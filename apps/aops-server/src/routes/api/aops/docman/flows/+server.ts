import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { Effect } from 'effect'

import {
  saveDocmanGroupFlow,
  saveDocmanDocumentFlow,
  saveDocmanSectionFlow,
  copyDocmanSectionFlow,
  createDocmanDocumentVersionFlow,
  createDocmanPageWithInitialVersionFlow,
  createLinkedDocmanPage,
  createLinkedDocmanSection,
  copyDocmanPageFlow,
  linkExistingDocmanSection,
  linkExistingDocmanPageVersion,
  updateDocmanDocumentSectionLinksFlow,
  updateDocmanSectionPageLinksFlow,
  saveDocmanPageVersionDraftFlow,
  updateDocmanDocumentVersionFlow,
  updateDocmanPageFlow,
  inferDocmanFlowErrorStatus,
  normalizeDocmanFlowAction,
} from '@aopslab/domain-product-docman'
import { resolveProjectScopeFromLocals } from '$lib/server/api/project-scope'
import { attachResolvedProjectScope } from '$lib/server/request-context'
import { errResult, okResult, type XfResult } from '$lib/server/xf-result'

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function inferScopeStatus(result: XfResult<unknown>): number {
  if (result.ok) return 200
  const message = String(result.messages?.[0]?.messageText ?? '').trim().toLowerCase()
  if (message === 'unauthorized') return 401
  if (message === 'forbidden') return 403
  if (message === 'project_required') return 409
  // Unresolved project scope remains non-visible and returns 404.
  if (message === 'project_not_found') return 404
  return 400
}

function normalizeNonEmpty(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

type ProjectRow = {
  id?: string
  scopeId?: string
  [key: string]: unknown
}

async function resolveDocmanFlowScope(params: {
  projectId: string
  requestedScopeId?: string
  kit: {
    createProjectService: () => Promise<{
      getById?: (id: string) => unknown
    }>
  }
}): Promise<
  | { ok: true; scopeId: string }
  | { ok: false; status: number; result: XfResult<unknown> }
> {
  const projectSvc = await params.kit.createProjectService()
  const directProject =
    typeof projectSvc.getById === 'function'
      ? ((await Effect.runPromise(projectSvc.getById(params.projectId) as any).catch(() => null)) as ProjectRow | null)
      : null
  const projectId = normalizeNonEmpty(directProject?.id) || normalizeNonEmpty(params.projectId)
  const projectScopeId = normalizeNonEmpty(directProject?.scopeId)
  const defaultScopeId = projectScopeId || projectId

  if (!defaultScopeId) {
    return {
      ok: false,
      status: 404,
      result: errResult('project_scope_not_found', { projectId: params.projectId }),
    }
  }

  const requestedScopeId = normalizeNonEmpty(params.requestedScopeId)
  if (!requestedScopeId) {
    return { ok: true, scopeId: defaultScopeId }
  }

  // Project-first compatibility: an explicit project id is the canonical scope alias.
  if (requestedScopeId === projectId || requestedScopeId === projectScopeId) {
    return { ok: true, scopeId: requestedScopeId }
  }

  return {
    ok: false,
    status: 409,
    result: errResult('scope_not_in_project', {
      projectId: params.projectId,
      scopeId: requestedScopeId,
    }),
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    return toRecord(await request.json())
  } catch {
    return {}
  }
}

export const POST: RequestHandler = async ({ request, locals }) => {
  await attachResolvedProjectScope({ request, locals })
  const body = await readJsonBody(request)
  const attachedScopeId = normalizeNonEmpty((locals as { scopeId?: unknown }).scopeId)
  const requestedScopeId = normalizeNonEmpty(body.scopeId)

  let resolvedScopeId = attachedScopeId

  if (!resolvedScopeId || (requestedScopeId && requestedScopeId !== resolvedScopeId)) {
    const scope = await resolveProjectScopeFromLocals({
      input: {
        projectId: body.projectId ?? locals.projectId,
        projectName: body.projectName,
        project: body.project,
      },
      locals,
    })
    if (!scope.ok) return json(scope.result, { status: inferScopeStatus(scope.result) })
    const resolvedScope = await resolveDocmanFlowScope({
      projectId: scope.projectId,
      requestedScopeId: requestedScopeId || undefined,
      kit: scope.kit as unknown as {
        createProjectService: () => Promise<{ getById?: (id: string) => unknown }>
      },
    })
    if (!resolvedScope.ok) {
      return json(resolvedScope.result, { status: resolvedScope.status })
    }
    resolvedScopeId = resolvedScope.scopeId
  }

  if (!resolvedScopeId) {
    return json(errResult('project_required'), { status: 409 })
  }

  const action = normalizeDocmanFlowAction(body.action)
  if (!action) {
    return json(errResult('unsupported_docman_flow_action'), { status: 400 })
  }


  try {
    if (action === 'save-group') {
      const result = await saveDocmanGroupFlow({
        scopeId: resolvedScopeId,
        groupId: body.groupId,
        data: body.data,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'save-document') {
      const result = await saveDocmanDocumentFlow({
        scopeId: resolvedScopeId,
        documentId: body.documentId,
        data: body.data,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'save-section') {
      const result = await saveDocmanSectionFlow({
        scopeId: resolvedScopeId,
        sectionId: body.sectionId,
        data: body.data,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'copy-section') {
      const result = await copyDocmanSectionFlow({
        scopeId: resolvedScopeId,
        sourceSectionId: body.sourceSectionId,
        targetDocumentVersionId: body.targetDocumentVersionId,
        parentLinkId: body.parentLinkId,
        position: body.position,
        rename: body.rename,
        clonePages: body.clonePages,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'create-linked-section') {
      const result = await createLinkedDocmanSection({
        scopeId: resolvedScopeId,
        documentVersionId: body.documentVersionId,
        parentLinkId: body.parentLinkId,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'link-existing-section') {
      const result = await linkExistingDocmanSection({
        scopeId: resolvedScopeId,
        documentVersionId: body.documentVersionId,
        sectionId: body.sectionId,
        parentLinkId: body.parentLinkId,
        position: body.position,
        titleOverride: body.titleOverride,
        numbering: body.numbering,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'link-existing-page-version') {
      const result = await linkExistingDocmanPageVersion({
        scopeId: resolvedScopeId,
        sectionId: body.sectionId,
        pageId: body.pageId,
        pageVersionId: body.pageVersionId,
        position: body.position,
        titleOverride: body.titleOverride,
        numbering: body.numbering,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'update-document-section-links') {
      const result = await updateDocmanDocumentSectionLinksFlow({
        scopeId: resolvedScopeId,
        documentVersionId: body.documentVersionId,
        updates: body.updates,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'update-section-page-links') {
      const result = await updateDocmanSectionPageLinksFlow({
        scopeId: resolvedScopeId,
        sectionId: body.sectionId,
        updates: body.updates,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'save-page-version-draft') {
      const result = await saveDocmanPageVersionDraftFlow({
        scopeId: resolvedScopeId,
        pageVersionId: body.pageVersionId,
        documentLinkId: body.documentLinkId,
        data: body.data,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'update-document-version') {
      const result = await updateDocmanDocumentVersionFlow({
        scopeId: resolvedScopeId,
        documentVersionId: body.documentVersionId,
        documentId: body.documentId,
        data: body.data,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'update-page') {
      const result = await updateDocmanPageFlow({
        scopeId: resolvedScopeId,
        pageId: body.pageId,
        data: body.data,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'copy-page') {
      const result = await copyDocmanPageFlow({
        scopeId: resolvedScopeId,
        sourcePageId: body.sourcePageId,
        sourcePageVersionId: body.sourcePageVersionId,
        targetSectionId: body.targetSectionId,
        position: body.position,
        rename: body.rename,
        clonePage: body.clonePage,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'create-document-version') {
      const result = await createDocmanDocumentVersionFlow({
        scopeId: resolvedScopeId,
        documentId: body.documentId,
        data: body.data,
        documentInitMode: body.documentInitMode,
        sourceVersionId: body.sourceVersionId,
        sourceSectionLinkIds: body.sourceSectionLinkIds,
      })
      return json(okResult(result), { status: 200 })
    }

    if (action === 'create-page-with-initial-version') {
      const result = await createDocmanPageWithInitialVersionFlow({
        scopeId: resolvedScopeId,
        data:
          body.format === undefined
            ? body.data
            : {
                ...toRecord(body.data),
                format: body.format,
              },
      })
      return json(okResult(result), { status: 200 })
    }

    const result = await createLinkedDocmanPage({
      scopeId: resolvedScopeId,
      documentVersionId: body.documentVersionId,
      sectionId: body.sectionId,
      parentLinkId: body.parentLinkId,
      format: body.format,
    })
    return json(okResult(result), { status: 200 })
  } catch (error) {
    const message = error instanceof Error && error.message.trim().length > 0 ? error.message : 'docman_flow_failed'
    return json(errResult(message), { status: inferDocmanFlowErrorStatus(message) })
  }
}
