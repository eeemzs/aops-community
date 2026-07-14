// @ts-nocheck
import { createProjectmanPlugin as createBaseProjectmanPlugin } from '@aopslab/domain-host-plugin-projectman'
import {
  clearProjectmanKitEnvConfigCache,
  clearProjectmanKitOperationCaches,
  runProjectmanKitOperationByTypedId,
} from '@aopslab/domain-kit-projectman'
import { runAgentspaceKitOperationByTypedId } from '@aopslab/domain-kit-agentspace'
import {
  applyProjectmanRuntimeEnv,
  resolveProjectmanRuntimeConfig,
} from '@aopslab/domain-runtime-config-projectman'
import { createAgentspaceScopeResolver, toNonEmptyString } from './scope-context.mjs'

const DEFAULT_RESUME_MEMORY_LIMIT = 8
const DEFAULT_RESUME_MEMORY_CANDIDATE_LIMIT = 48
const OPEN_ISSUE_STATUSES = new Set(['open', 'triaged', 'in_progress'])
const OPEN_FEEDBACK_STATUSES = new Set(['new', 'triaged', 'planned'])
let projectmanHostedRuntimeEnvReady = false
let projectmanHostedStorageReadyPromise = null

function assertProjectmanHostRuntimeStorage(runtime) {
  if (runtime?.repoUrlSource === 'default-sqlite' || runtime?.repoDialect === 'sqlite') {
    throw new Error(
      'projectman_host_runtime_storage_unbound:Set PROJECTMAN_REPO_URL, PROJECTMAN_PG_URL, AOPS_REPO_URL, or AOPS_PG_URL to PostgreSQL before starting AOPS server.',
    )
  }
}

function ensureProjectmanHostedRuntimeEnv(options = {}) {
  if (projectmanHostedRuntimeEnvReady) return

  clearProjectmanKitEnvConfigCache()
  clearProjectmanKitOperationCaches()

  const repoUrlOverride =
    toNonEmptyString(process.env.PROJECTMAN_REPO_URL) ??
    toNonEmptyString(process.env.PROJECTMAN_SQLITE_URL) ??
    toNonEmptyString(process.env.PROJECTMAN_PG_URL) ??
    toNonEmptyString(process.env.AOPS_REPO_URL) ??
    toNonEmptyString(process.env.AOPS_SQLITE_URL) ??
    toNonEmptyString(process.env.AOPS_PG_URL)

  const runtime = resolveProjectmanRuntimeConfig(
    {
      repoUrl: repoUrlOverride,
      projectId: options.defaultProjectId,
    },
    process.env,
  )

  assertProjectmanHostRuntimeStorage(runtime)

  applyProjectmanRuntimeEnv(
    {
      runtimeMode: runtime.runtimeMode,
      repoUrl: runtime.repoUrl,
      repoDialect: runtime.repoDialect,
      projectId: runtime.projectId,
    },
    process.env,
  )

  clearProjectmanKitEnvConfigCache()
  clearProjectmanKitOperationCaches()
  if (process.env.AOPS_DB_BOOTSTRAP_MODE !== 'explicit') {
    throw new Error('community_strict_bootstrap_mode_required');
  }
  projectmanHostedStorageReadyPromise = Promise.resolve();
  projectmanHostedRuntimeEnvReady = true
}

async function ensureProjectmanHostedStorageReady() {
  if (projectmanHostedStorageReadyPromise) {
    await projectmanHostedStorageReadyPromise
  }
}

function toStringArray(values) {
  if (!Array.isArray(values)) return []
  return values.map((item) => String(item ?? '').trim()).filter(Boolean)
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function compactRecord(value) {
  return Object.fromEntries(Object.entries(toRecord(value)).filter(([, item]) => item !== undefined))
}

function uniqueStrings(values) {
  const seen = new Set()
  const result = []
  for (const value of values) {
    const normalized = toNonEmptyString(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function toRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

const projectmanScopeResolver = createAgentspaceScopeResolver({
  runAgentspaceOperation: runAgentspaceKitOperationByTypedId,
})

async function resolveProjectOwnerContext(projectId) {
  const owner = await projectmanScopeResolver.resolveProjectContext(projectId)
  if (owner.scopeId) return owner
  const safeProjectId = toNonEmptyString(projectId)
  return {
    ...owner,
    projectId: owner.projectId ?? safeProjectId,
    scopeId: owner.scopeId ?? safeProjectId,
  }
}

function toImportance(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function unwrapData(value) {
  const record = toRecord(value)
  if (Object.prototype.hasOwnProperty.call(record, 'data')) {
    return record.data
  }
  return value
}

function toResultArray(value) {
  const data = unwrapData(value)
  if (Array.isArray(data)) return data
  const record = toRecord(data)
  if (Array.isArray(record.items)) return record.items
  return []
}

function isNotCompletedMicrotask(item) {
  const status = toNonEmptyString(item?.status)?.toLowerCase()
  return status !== 'completed' && status !== 'cancelled'
}

function isActiveSprint(item) {
  const status = toNonEmptyString(item?.status)?.toLowerCase()
  return status !== 'completed' && status !== 'cancelled'
}

function isOpenIssue(item) {
  const status = toNonEmptyString(item?.status)?.toLowerCase()
  return !!status && OPEN_ISSUE_STATUSES.has(status)
}

function isOpenFeedback(item) {
  const status = toNonEmptyString(item?.status)?.toLowerCase()
  return !!status && OPEN_FEEDBACK_STATUSES.has(status)
}

function pickPrimaryResumeMicrotask(items) {
  const rows = toArray(items)
  return (
    rows.find((item) => toNonEmptyString(item?.status)?.toLowerCase() === 'doing') ??
    rows.find((item) => toNonEmptyString(item?.status)?.toLowerCase() === 'blocked') ??
    rows.find((item) => toNonEmptyString(item?.id)) ??
    null
  )
}

function pickPrimaryEntity(items) {
  return toArray(items).find((item) => toNonEmptyString(item?.id)) ?? null
}

function buildResumeSubject(type, id, label) {
  const subject = compactRecord({
    type: toNonEmptyString(type),
    id: toNonEmptyString(id),
    label: toNonEmptyString(label),
  })
  return Object.keys(subject).length > 0 ? subject : undefined
}

function appendSourceReference(sourceTypes, sourceIds, type, id) {
  const safeType = toNonEmptyString(type)
  const safeId = toNonEmptyString(id)
  if (!safeType || !safeId) return
  sourceTypes.push(safeType)
  sourceIds.push(safeId)
}

function appendMicrotaskLineageSourceRefs(sourceTypes, sourceIds, microtask, options = {}) {
  appendSourceReference(sourceTypes, sourceIds, 'projectman.microtask', microtask?.id)
  if (options.includeSprint !== false) {
    appendSourceReference(sourceTypes, sourceIds, 'projectman.sprint', microtask?.sprintId)
  }
  appendSourceReference(sourceTypes, sourceIds, 'projectman.kanban-task', microtask?.kanbanTaskId)
}

function buildProjectmanMemoryTags({ baseTags = [], projectId, sprintId, phaseId, kanbanTaskId, microtaskId }) {
  return uniqueStrings([
    ...toStringArray(baseTags),
    projectId ? `project:${projectId}` : undefined,
    sprintId ? `sprint:${sprintId}` : undefined,
    phaseId ? `phase:${phaseId}` : undefined,
    kanbanTaskId ? `kanban-task:${kanbanTaskId}` : undefined,
    microtaskId ? `microtask:${microtaskId}` : undefined,
  ])
}

function buildProjectmanMemoryMeta({
  projectId,
  subjectType,
  subjectId,
  subjectTitle,
  sprintId,
  phaseId,
  kanbanTaskId,
  microtaskId,
  nextAction,
  nextReadRefs,
  validationState,
  sourceRefs,
  extra,
}) {
  return compactRecord({
    projectId: toNonEmptyString(projectId),
    subjectType: toNonEmptyString(subjectType),
    subjectId: toNonEmptyString(subjectId),
    subjectTitle: toNonEmptyString(subjectTitle),
    sprintId: toNonEmptyString(sprintId),
    phaseId: toNonEmptyString(phaseId),
    kanbanTaskId: toNonEmptyString(kanbanTaskId),
    microtaskId: toNonEmptyString(microtaskId),
    nextAction: toNonEmptyString(nextAction),
    nextReadRefs: toArray(nextReadRefs),
    validationState: toNonEmptyString(validationState),
    sourceRefs: toArray(sourceRefs),
    synchronizedAt: new Date().toISOString(),
    ...compactRecord(toRecord(extra)),
  })
}

function buildProjectmanResumeMemoryRetrieval({ activeSprints, incompleteMicrotasks, openIssues, openFeedback }) {
  const primaryMicrotask = pickPrimaryResumeMicrotask(incompleteMicrotasks)
  const primarySprint = pickPrimaryEntity(activeSprints)
  const primaryIssue = pickPrimaryEntity(openIssues)
  const primaryFeedback = pickPrimaryEntity(openFeedback)

  let query = 'resume project context'
  let runtimeProfile = 'planning'
  let subject

  const sourceTypes = []
  const sourceIds = []

  if (primaryMicrotask) {
    query = 'resume implementation handoff'
    runtimeProfile = 'implementation'
    subject = buildResumeSubject('projectman.microtask', primaryMicrotask.id, primaryMicrotask.title)
    appendMicrotaskLineageSourceRefs(sourceTypes, sourceIds, primaryMicrotask)
  } else if (primarySprint) {
    query = 'resume active sprint context'
    runtimeProfile = 'planning'
    subject = buildResumeSubject('projectman.sprint', primarySprint.id, primarySprint.name)
    appendSourceReference(sourceTypes, sourceIds, 'projectman.sprint', primarySprint.id)
  } else if (primaryIssue) {
    query = 'resume open issue context'
    runtimeProfile = 'investigation'
    subject = buildResumeSubject('projectman.issue', primaryIssue.id, primaryIssue.title)
    appendSourceReference(sourceTypes, sourceIds, 'projectman.issue', primaryIssue.id)
  } else if (primaryFeedback) {
    query = 'resume feedback triage context'
    runtimeProfile = 'feedback-triage'
    subject = buildResumeSubject('projectman.feedback', primaryFeedback.id, primaryFeedback.title)
    appendSourceReference(sourceTypes, sourceIds, 'projectman.feedback', primaryFeedback.id)
  }

  if (primarySprint && !sourceIds.includes(primarySprint.id)) {
    appendSourceReference(sourceTypes, sourceIds, 'projectman.sprint', primarySprint.id)
  }

  return compactRecord({
    query,
    runtimeProfile,
    subject,
    tags: uniqueStrings([
      'phase:memory',
      primaryMicrotask ? 'resume:implementation' : undefined,
      primarySprint ? 'resume:sprint' : undefined,
      primaryIssue ? 'resume:issue' : undefined,
      primaryFeedback ? 'resume:feedback' : undefined,
    ]),
    sourceTypes: uniqueStrings(sourceTypes),
    sourceIds: uniqueStrings(sourceIds),
    candidateLimit: DEFAULT_RESUME_MEMORY_CANDIDATE_LIMIT,
  })
}

function shouldWritebackOnSprintCompletion(operationId, input, output) {
  if (operationId !== 'sprint.update') return false
  const requestedStatus = toNonEmptyString(input?.status)?.toLowerCase()
  if (requestedStatus !== 'completed') return false
  const updatedStatus = toNonEmptyString(output?.status)?.toLowerCase()
  return updatedStatus === 'completed'
}

function shouldWritebackOnMicrotaskCompletion(operationId, input, output) {
  if (operationId !== 'microtask.update') return false
  const requestedStatus = toNonEmptyString(input?.status)?.toLowerCase()
  if (requestedStatus !== 'completed') return false
  const updatedStatus = toNonEmptyString(output?.status)?.toLowerCase()
  return updatedStatus === 'completed'
}

function buildMemoryContent(sprint) {
  const sprintName = toNonEmptyString(sprint?.name) ?? 'Unnamed sprint'
  const sprintGoal = toNonEmptyString(sprint?.goal) ?? 'No goal'
  const endedAt = toNonEmptyString(sprint?.endAt)
  if (endedAt) {
    return `Sprint "${sprintName}" completed. Goal: ${sprintGoal}. End date: ${endedAt}.`
  }
  return `Sprint "${sprintName}" completed. Goal: ${sprintGoal}.`
}

function buildSummaryText(sprint) {
  const sprintName = toNonEmptyString(sprint?.name) ?? 'Unnamed sprint'
  const sprintGoal = toNonEmptyString(sprint?.goal) ?? 'No goal'
  return `Latest completed sprint: ${sprintName}. Goal: ${sprintGoal}.`
}

function ensureTrailingSentence(value) {
  const normalized = toNonEmptyString(value)
  if (!normalized) return undefined
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`
}

function buildMicrotaskMemoryContent(microtask) {
  const microtaskTitle = toNonEmptyString(microtask?.title) ?? 'Unnamed microtask'
  const notes = toNonEmptyString(microtask?.notes)
  const closedAt = toNonEmptyString(microtask?.closedAt)
  const parts = [`Microtask "${microtaskTitle}" completed.`]
  const noteSentence = ensureTrailingSentence(notes)
  if (noteSentence) parts.push(`Notes: ${noteSentence}`)
  if (closedAt) parts.push(`Closed at: ${closedAt}.`)
  return parts.join(' ')
}

async function listIncompleteMicrotasksForActiveSprints(projectId, activeSprints) {
  return toArray(activeSprints).flatMap((sprint) => {
    const sprintId = toNonEmptyString(sprint?.id)
    return toArray(sprint?.phases).flatMap((phase) =>
      toArray(phase?.microtasks)
        .filter(isNotCompletedMicrotask)
        .map((microtask) => ({
          ...toRecord(microtask),
          sprintId: toNonEmptyString(microtask?.sprintId) || sprintId,
          phaseId: toNonEmptyString(microtask?.phaseId) || toNonEmptyString(phase?.id),
          kanbanTaskId: toNonEmptyString(microtask?.kanbanTaskId) || toNonEmptyString(sprint?.kanbanTaskId),
        })),
    )
  })
}

export async function buildProjectmanResumeContextPack({ projectId }) {
  const safeProjectId = toNonEmptyString(projectId)
  if (!safeProjectId) {
    throw new Error('missing_project_id_for_resume_context_pack')
  }
  const ownerContext = await resolveProjectOwnerContext(safeProjectId)
  const ownerScopeId = toNonEmptyString(ownerContext.scopeId) ?? safeProjectId

  const [activeSprintsRaw, issueItemsRaw, feedbackItemsRaw] = await Promise.all([
    runProjectmanKitOperationByTypedId('sprint.list', {
      scopeId: ownerScopeId,
    }),
    runProjectmanKitOperationByTypedId('issue.list', {
      scopeId: ownerScopeId,
    }),
    runProjectmanKitOperationByTypedId('feedback.list', {
      scopeId: ownerScopeId,
    }),
  ])

  const activeSprints = toArray(activeSprintsRaw).filter(isActiveSprint)
  const incompleteMicrotasks = await listIncompleteMicrotasksForActiveSprints(safeProjectId, activeSprints)
  const openIssues = toArray(issueItemsRaw).filter(isOpenIssue)
  const openFeedback = toArray(feedbackItemsRaw).filter(isOpenFeedback)
  const resumePack = toRecord(
    unwrapData(
      await runAgentspaceKitOperationByTypedId('memory-item.build-resume-pack', {
        filter: { scopeId: ownerScopeId, scopeResolution: 'cascade', projectId: safeProjectId },
        retrieval: buildProjectmanResumeMemoryRetrieval({
          activeSprints,
          incompleteMicrotasks,
          openIssues,
          openFeedback,
        }),
        options: { depth: 'light', limit: DEFAULT_RESUME_MEMORY_LIMIT },
      })
    )
  )
  const memoryItems = toResultArray(resumePack.relatedMemory).slice(0, DEFAULT_RESUME_MEMORY_LIMIT)
  const synopsis = toRecord(resumePack.synopsis)
  const bootstrapGuidance = uniqueStrings(toArray(resumePack.bootstrapGuidance)).slice(0, 3)

  return {
    generatedAt: new Date().toISOString(),
    projectId: safeProjectId,
    synopsis: Object.keys(synopsis).length > 0 ? synopsis : null,
    bootstrapGuidance,
    resumePack: Object.keys(resumePack).length > 0 ? resumePack : null,
    memoryItems,
    activeSprints,
    incompleteMicrotasks,
    openIssues,
    openFeedback,
  }
}

async function writebackSprintCompletionToAops(sprint) {
  const projectId = toNonEmptyString(sprint?.projectId)
  const ownerContext = await resolveProjectOwnerContext(projectId)
  const scopeId = toNonEmptyString(ownerContext.scopeId) ?? projectId
  const sprintId = toNonEmptyString(sprint?.id)
  if (!projectId || !scopeId || !sprintId) return

  const tags = buildProjectmanMemoryTags({
    baseTags: [
      'phase:memory',
      'phase:closeout',
      'source:projectman',
      ...toStringArray(sprint?.tags).map((tag) => `sprint-tag:${tag}`),
    ],
    projectId,
    sprintId,
  })

  await runAgentspaceKitOperationByTypedId('memory-item.add-memory-item', {
    data: {
      scopeId,
      kind: 'closeout',
      durability: 'short',
      content: buildMemoryContent(sprint),
      tags,
      importance: 70,
      sourceType: 'projectman.sprint',
      sourceId: sprintId,
      meta: buildProjectmanMemoryMeta({
        projectId,
        subjectType: 'projectman.sprint',
        subjectId: sprintId,
        subjectTitle: sprint?.name,
        sprintId,
        validationState: toNonEmptyString(sprint?.status),
        extra: {
          sprintName: toNonEmptyString(sprint?.name),
          sprintGoal: toNonEmptyString(sprint?.goal),
          sprintStatus: toNonEmptyString(sprint?.status),
        },
      }),
    },
  })

  const resumeContextPack = await buildProjectmanResumeContextPack({ projectId })
  const openItems = [
    `Active sprints: ${resumeContextPack.activeSprints.length}`,
    `Incomplete microtasks: ${resumeContextPack.incompleteMicrotasks.length}`,
    `Open issues: ${resumeContextPack.openIssues.length}`,
    `Open feedback: ${resumeContextPack.openFeedback.length}`,
  ]
  if (openItems.length > 0) {
    await runAgentspaceKitOperationByTypedId('memory-item.add-memory-item', {
      data: {
        scopeId,
        kind: 'note',
        durability: 'durable',
        content: `${buildSummaryText(sprint)} ${openItems.join('. ')}.`,
        tags: buildProjectmanMemoryTags({
          baseTags: ['phase:memory', 'phase:note', 'source:projectman'],
          projectId,
          sprintId,
        }),
        importance: 50,
        sourceType: 'projectman.sprint',
        sourceId: sprintId,
        meta: buildProjectmanMemoryMeta({
          projectId,
          subjectType: 'projectman.sprint',
          subjectId: sprintId,
          subjectTitle: sprint?.name,
          sprintId,
          extra: { openItems },
        }),
      },
    })
  }
}

async function writebackMicrotaskCompletionToAops(microtask) {
  const projectId = toNonEmptyString(microtask?.projectId)
  const ownerContext = await resolveProjectOwnerContext(projectId)
  const scopeId = toNonEmptyString(ownerContext.scopeId) ?? projectId
  const microtaskId = toNonEmptyString(microtask?.id)
  if (!projectId || !scopeId || !microtaskId) return

  const sprintId = toNonEmptyString(microtask?.sprintId)
  const phaseId = toNonEmptyString(microtask?.phaseId)
  const kanbanTaskId = toNonEmptyString(microtask?.kanbanTaskId)

  await runAgentspaceKitOperationByTypedId('memory-item.add-memory-item', {
    data: {
      scopeId,
      kind: 'note',
      content: buildMicrotaskMemoryContent(microtask),
      tags: buildProjectmanMemoryTags({
        baseTags: ['phase:memory', 'phase:closeout', 'source:projectman'],
        projectId,
        sprintId,
        phaseId,
        kanbanTaskId,
        microtaskId,
      }),
      durability: 'short',
      importance: 60,
      sourceType: 'projectman.microtask',
      sourceId: microtaskId,
      meta: buildProjectmanMemoryMeta({
        projectId,
        subjectType: 'projectman.microtask',
        subjectId: microtaskId,
        subjectTitle: microtask?.title,
        sprintId,
        phaseId,
        kanbanTaskId,
        microtaskId,
        validationState: toNonEmptyString(microtask?.status),
        extra: {
          microtaskStatus: toNonEmptyString(microtask?.status),
          notes: toNonEmptyString(microtask?.notes),
          closedAt: toNonEmptyString(microtask?.closedAt),
        },
      }),
    },
  })
}

export function createProjectmanPlugin(options = {}) {
  ensureProjectmanHostedRuntimeEnv(options)

  const projectmanRunner =
    typeof options.runner === 'function'
      ? options.runner
      : (operationId, input) => runProjectmanKitOperationByTypedId(operationId, input)

  const enableAopsWriteback = options.enableAopsWriteback !== false
  const failOnWritebackError = options.failOnWritebackError === true

  const wrappedRunner = async (operationId, input) => {
    await ensureProjectmanHostedStorageReady()
    const output = await projectmanRunner(operationId, input)

    if (enableAopsWriteback) {
      try {
        if (shouldWritebackOnSprintCompletion(operationId, input, output)) {
          await writebackSprintCompletionToAops(output)
        }
        if (shouldWritebackOnMicrotaskCompletion(operationId, input, output)) {
          await writebackMicrotaskCompletionToAops(output)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[projectman-host-adapter] aops writeback failed', {
          operationId,
          message,
        })
        if (failOnWritebackError) throw error
      }
    }


    return output
  }

  return createBaseProjectmanPlugin({
    defaultProjectId: options.defaultProjectId,
    runner: wrappedRunner,
  })
}
