import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { Effect } from 'effect'

import {
  applyProjectmanTemplateFlow,
  createProjectmanBoardColumnFlow,
  createProjectmanBoardFlow,
  createProjectmanFeedbackFlow,
  createProjectmanIssueFlow,
  createProjectmanSprintFlow,
  createProjectmanSprintMicrotaskFlow,
  createProjectmanTemplateFlow,
  createProjectmanTaskFlow,
  convertProjectmanFeedbackToIssueFlow,
  convertProjectmanFeedbackToTaskFlow,
  deleteProjectmanTemplateFlow,
  inferProjectmanFlowErrorStatus,
  moveProjectmanTaskFlow,
  repositionProjectmanTaskFlow,
  normalizeProjectmanFlowAction,
  updateProjectmanFeedbackFlow,
  updateProjectmanIssueFlow,
  updateProjectmanSprintMicrotaskStatusFlow,
  updateProjectmanSprintPlanFlow,
  updateProjectmanTemplateFlow,
  updateProjectmanTaskFlow,
} from '@aopslab/domain-product-projectman'
import { getAgentspaceKit } from '@/kits'
import { resolveProjectScopeFromLocals } from '$lib/server/api/project-scope'
import { attachResolvedProjectScope } from '$lib/server/request-context'
import { errResult, okResult, type XfResult } from '$lib/server/xf-result'

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function pickBodyValue(body: Record<string, unknown>, primaryKey: string, fallbackKey: string): unknown {
  return Object.prototype.hasOwnProperty.call(body, primaryKey) ? body[primaryKey] : body[fallbackKey]
}

function pickOptionalBodyString(
  body: Record<string, unknown>,
  primaryKey: string,
  fallbackKey: string
): string | undefined {
  const value = pickBodyValue(body, primaryKey, fallbackKey)
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return toRecord(await request.json())
  } catch {
    return {}
  }
}

function inferScopeStatus(result: XfResult<unknown>): number {
  if (result.ok) return 200
  const message = String(result.messages?.[0]?.messageText ?? '').trim().toLowerCase()
  if (message === 'unauthorized') return 401
  if (message === 'forbidden') return 403
  if (message === 'project_required') return 409
  // An unresolved project scope remains non-visible and returns 404.
  if (message === 'project_not_found') return 404
  return 400
}

type ProjectRow = {
  id?: string
  scopeId?: string
  [key: string]: unknown
}

async function validateProjectScopeMatch(params: {
  scopeId?: string
  projectId: string
  locals: Record<string, unknown>
}): Promise<{ status: number; result: XfResult<unknown> } | null> {
  if (!params.projectId) return null

  const kit = await getAgentspaceKit({
    tenantId: typeof params.locals.tenantId === 'string' ? params.locals.tenantId : undefined,
    locale: typeof params.locals.locale === 'string' ? params.locals.locale : undefined,
    fallbackLocale: typeof params.locals.fallbackLocale === 'string' ? params.locals.fallbackLocale : undefined,
  })
  const projectSvc = await kit.createProjectService()
  const project = (await Effect.runPromise(projectSvc.getById(params.projectId)).catch(() => null)) as ProjectRow | null

  if (!project?.id) {
    return {
      status: 404,
      result: errResult('project_not_found', { projectId: params.projectId }),
    }
  }

  const projectScopeId = typeof project?.id === 'string' ? project.id.trim() : ''
  if (params.scopeId && projectScopeId && params.scopeId !== projectScopeId) {
    return {
      status: 409,
      result: errResult('project_scope_mismatch', {
        projectId: params.projectId,
        scopeId: params.scopeId,
        projectScopeId,
      }),
    }
  }

  return null
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.principal) {
    return json(errResult('unauthorized'), { status: 401 })
  }

  await attachResolvedProjectScope({ request, locals })
  const body = await readJsonBody(request)
  const scope = await resolveProjectScopeFromLocals({
    input: {
      projectId: body.projectId ?? locals.projectId,
      projectName: body.projectName,
      project: body.project,
    },
    locals,
  })
  if (!scope.ok) return json(scope.result, { status: inferScopeStatus(scope.result) })

  const action = normalizeProjectmanFlowAction(body.action)
  if (!action) {
    return json(errResult('unsupported_projectman_flow_action'), { status: 400 })
  }


  const requestScopeId = String(body.scopeId ?? '').trim() || undefined
  const explicitProjectId = String(body.projectId ?? body.project ?? '').trim()
  const resolvedProjectId = explicitProjectId || scope.projectId
  const resolvedScopeId = requestScopeId || scope.scopeId || scope.projectId
  const projectScopeError = await validateProjectScopeMatch({
    scopeId: requestScopeId,
    projectId: explicitProjectId,
    locals: locals as unknown as Record<string, unknown>,
  })
  if (projectScopeError) {
    return json(projectScopeError.result, { status: projectScopeError.status })
  }

  try {
    const result =
      action === 'create-board'
        ? await createProjectmanBoardFlow({
            scopeId: resolvedScopeId,
            projectId: resolvedProjectId,
            name: body.name,
            slug: body.slug,
            description: body.description,
            columns: body.columns,
            sourceCreatedAt: body.sourceCreatedAt,
            sourceUpdatedAt: body.sourceUpdatedAt,
          })
        : action === 'apply-template'
          ? await applyProjectmanTemplateFlow({
              scopeId: resolvedScopeId,
              projectId: resolvedProjectId,
              templateId: body.templateId ?? body.kanbanTemplate ?? body.id,
            })
          : action === 'create-template'
            ? await createProjectmanTemplateFlow({
                scopeId: resolvedScopeId,
                name: body.name,
                description: body.description,
                definition: body.definition,
              })
            : action === 'update-template'
              ? await updateProjectmanTemplateFlow({
                  scopeId: resolvedScopeId,
                  templateId: body.templateId ?? body.kanbanTemplate ?? body.id,
                  name: body.name,
                  description: body.description,
                  definition: body.definition,
                })
              : action === 'delete-template'
                ? await deleteProjectmanTemplateFlow({
                    scopeId: resolvedScopeId,
                    templateId: body.templateId ?? body.kanbanTemplate ?? body.id,
                  })
        : action === 'create-column'
          ? await createProjectmanBoardColumnFlow({
              scopeId: resolvedScopeId,
              boardId: body.boardId ?? body.board,
              name: body.name,
              slug: body.slug,
              })
          : action === 'create-task'
            ? await createProjectmanTaskFlow({
                scopeId: resolvedScopeId,
                projectId: resolvedProjectId,
                boardId: body.boardId ?? body.board,
                boardColumnId: body.boardColumnId ?? body.boardColumn,
                title: body.title,
                description: body.description,
              })
          : action === 'update-task'
            ? await updateProjectmanTaskFlow({
                scopeId: resolvedScopeId,
                taskId: body.taskId ?? body.kanbanTask,
                title: body.title,
                description: body.description,
                progress: body.progress,
              })
          : action === 'move-task'
            ? await moveProjectmanTaskFlow({
                scopeId: resolvedScopeId,
                taskId: body.taskId ?? body.kanbanTask,
                boardColumnId: body.boardColumnId ?? body.boardColumn,
              })
          : action === 'reposition-task'
            ? await repositionProjectmanTaskFlow({
                scopeId: resolvedScopeId,
                taskId: body.taskId ?? body.kanbanTask,
                boardColumnId: body.boardColumnId ?? body.boardColumn,
                orderedIds: body.orderedIds,
                sourceBoardColumnId: body.sourceBoardColumnId ?? body.sourceBoardColumn,
                sourceOrderedIds: body.sourceOrderedIds,
              })
          : action === 'create-sprint'
            ? await createProjectmanSprintFlow({
                scopeId: resolvedScopeId,
                projectId: resolvedProjectId,
                kanbanTaskId: body.kanbanTaskId ?? body.kanbanTask ?? body.taskId ?? body.task,
                name: body.name,
                goal: body.goal,
                references: body.references,
                scope: body.scope,
                validationPlan: body.validationPlan,
                notes: body.notes,
                phases: body.phases,
              })
          : action === 'update-sprint-plan'
            ? await updateProjectmanSprintPlanFlow({
                scopeId: resolvedScopeId,
                projectId: resolvedProjectId,
                sprintId: body.sprintId ?? body.sprint ?? body.id,
                name: body.name,
                goal: body.goal,
                references: body.references,
                scope: body.scope,
                validationPlan: body.validationPlan,
                notes: body.notes,
                phases: body.phases,
                expectedUpdatedAt: body.expectedUpdatedAt,
              })
          : action === 'create-sprint-microtask'
            ? await createProjectmanSprintMicrotaskFlow({
                scopeId: resolvedScopeId,
                projectId: resolvedProjectId,
                sprintId: body.sprintId ?? body.sprint,
                phaseId: body.phaseId,
                phase: body.phase,
                title: body.title,
                status: body.status,
                position: body.position,
                notes: body.notes,
                createdBy: body.createdBy,
                updatedBy: body.updatedBy,
              })
          : action === 'update-sprint-microtask-status'
            ? await updateProjectmanSprintMicrotaskStatusFlow({
                scopeId: resolvedScopeId,
                projectId: resolvedProjectId,
                sprintId: body.sprintId ?? body.sprint,
                microTaskId: body.microTaskId ?? body.microtask ?? body.microTask ?? body.id,
                status: body.status,
              })
          : action === 'create-issue'
            ? await createProjectmanIssueFlow({
                scopeId: resolvedScopeId,
                projectId: resolvedProjectId,
                title: body.title,
                description: body.description,
                status: body.status,
                severity: body.severity,
                source: body.source,
                sprintId: body.sprintId ?? body.sprint,
                kanbanTaskId: body.kanbanTaskId ?? body.kanbanTask,
                microTaskId: body.microTaskId ?? body.microTask,
                tags: body.tags,
                notes: body.notes,
                resolvedAt: body.resolvedAt,
              })
          : action === 'update-issue'
            ? await updateProjectmanIssueFlow({
                issueId: body.issueId ?? body.issue ?? body.id,
                title: body.title,
                description: body.description,
                status: body.status,
                severity: body.severity,
                source: body.source,
                sprintId: pickOptionalBodyString(body, 'sprintId', 'sprint'),
                kanbanTaskId: pickOptionalBodyString(body, 'kanbanTaskId', 'kanbanTask'),
                notes: body.notes,
                resolvedAt: body.resolvedAt,
              })
          : action === 'create-feedback'
            ? await createProjectmanFeedbackFlow({
                scopeId: resolvedScopeId,
                projectId: resolvedProjectId,
                title: body.title,
                description: body.description,
                status: body.status,
                type: body.type,
                severity: body.severity,
                source: body.source,
                sprintId: body.sprintId ?? body.sprint,
                kanbanTaskId: body.kanbanTaskId ?? body.kanbanTask,
                microTaskId: body.microTaskId ?? body.microTask,
                tags: body.tags,
                suggestion: body.suggestion,
                notes: body.notes,
                handledAt: body.handledAt,
              })
          : action === 'update-feedback'
            ? await updateProjectmanFeedbackFlow({
                feedbackId: body.feedbackId ?? body.feedback ?? body.id,
                title: body.title,
                description: body.description,
                status: body.status,
                type: body.type,
                severity: body.severity,
                source: body.source,
                sprintId: pickOptionalBodyString(body, 'sprintId', 'sprint'),
                kanbanTaskId: pickOptionalBodyString(body, 'kanbanTaskId', 'kanbanTask'),
                suggestion: body.suggestion,
                notes: body.notes,
                handledAt: body.handledAt,
              })
          : action === 'convert-feedback-to-issue'
            ? await convertProjectmanFeedbackToIssueFlow({
                scopeId: resolvedScopeId,
                projectId: resolvedProjectId,
                feedbackId: body.feedbackId ?? body.feedback,
                title: body.title,
                description: body.description,
                severity: body.severity,
              })
            : action === 'convert-feedback-to-task'
            ? await convertProjectmanFeedbackToTaskFlow({
                  scopeId: resolvedScopeId,
                  projectId: resolvedProjectId,
                  feedbackId: body.feedbackId ?? body.feedback,
                  boardId: body.boardId ?? body.board,
                  boardColumnId: body.boardColumnId ?? body.boardColumn,
                  title: body.title,
                  description: body.description,
                })
              : null
    return json(okResult(result), { status: 200 })
  } catch (error) {
    const message = error instanceof Error && error.message.trim().length > 0 ? error.message : 'projectman_flow_failed'
    return json(errResult(message), { status: inferProjectmanFlowErrorStatus(message) })
  }
}
