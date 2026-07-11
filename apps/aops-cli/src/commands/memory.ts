import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { logError, logSuccess } from '@aopslab/xf-cli-ui'

import { applyCommonOptions, compactPayload } from '../utils/command.js'
import {
  buildAgentContextHeaders,
  invokeHostedToolWithApiState,
  requireApiState,
  unwrapHostedToolResult,
  type HostedToolInvokeOptions,
  type AgentGatewayContextOptions,
} from '../utils/agent-gateway.js'
import {
  preferProjectNameBinding,
  resolveOwnerScopeIdFromBinding,
  resolveOwnerScopeIdFromProjectRecord,
  resolveProjectBindingContext,
} from '../utils/project-context.js'
import { normalizeNonEmpty } from '../utils/command.js'
import { buildOperatorCookbook } from '../utils/hosted-sugar.js'
import { GUIDE_PATHS } from '../utils/guide-paths.js'
// Server-first: the memory command no longer WRITES the local
// .aops/agentspace/memory tree. Only read-only helpers remain, and they are
// used solely by the read-only startup brief (buildReadOnlyRepoFirstMemoryBrief*)
// that the `start` command consumes. No memory subcommand reads or writes local
// memory files as truth; all subcommands go through the hosted memory-item ops.
import {
  readLocalMemoryEntries,
  resolveMemoryWorkspacePaths,
  type MemoryWorkspaceEntry,
  type MemoryWorkspaceResumePack,
} from '../utils/memory-workspace.js'
import type { CliApiClientState } from '../utils/api.js'

type MemoryContextOptions = AgentGatewayContextOptions & {
  projectName?: string
  scopeId?: string
  fileBased?: boolean
  hosted?: boolean
}

type GuardedWriteOptions = {
  preview?: boolean
  apply?: boolean
  confirm?: boolean
  idempotencyKey?: string
}

type MemorySearchOptions = MemoryContextOptions & {
  subject?: string
  id?: string
  label?: string
  query?: string
  q?: string
  goal?: string
  runtimeProfile?: string
  workflowId?: string
  stepId?: string
  subjectType?: string
  subjectId?: string
  subjectLabel?: string
  purpose?: string[]
  area?: string[]
  status?: string[]
  taskId?: string
  sprintId?: string
  phaseId?: string
  utaskId?: string
  tag?: string[]
  sourceType?: string[]
  sourceId?: string[]
  candidateLimit?: number
  limit?: number
  strictClassification?: boolean
}

type MemoryListOptions = MemoryContextOptions & {
  subject?: string
  id?: string
  kind?: string
  durability?: 'short' | 'durable' | 'sticky'
  purpose?: string[]
  area?: string[]
  status?: string[]
  sourceType?: string
  sourceId?: string
  subjectType?: string
  subjectId?: string
  taskId?: string
  sprintId?: string
  phaseId?: string
  utaskId?: string
  issueId?: string
  feedbackId?: string
  limit?: number
}

type MemoryResumeOptions = MemorySearchOptions & {
  depth?: 'light' | 'deep'
}

type MemorySynopsisOptions = MemorySearchOptions & {
  limit?: number
}

export type MemoryBriefOptions = MemoryResumeOptions

export type RepoFirstMemoryBriefContext = {
  repoRoot: string
  configPath: string
  configFound: boolean
  scopeId?: string
  projectId?: string
  projectName?: string
  projectSlug?: string
  localRoot?: string
  ownerRepo?: string
  parentProjectSlug?: string
}

type MemoryGetOptions = MemoryContextOptions & {
  id?: string
}

type MemoryWriteOptions = MemoryContextOptions & GuardedWriteOptions & {
  mode?: string
  subject?: string
  id?: string
  label?: string
  durability?: 'short' | 'durable' | 'sticky'
  stickyRank?: number
  supersede?: string
  kind?: string
  content?: string
  importance?: number
  purpose?: string[]
  area?: string[]
  status?: string[]
  reviewAfterDays?: number
  expiresAt?: string
  tag?: string[]
  sourceType?: string
  sourceId?: string
  subjectType?: string
  subjectId?: string
  subjectTitle?: string
  taskId?: string
  kanbanTaskId?: string
  sprintId?: string
  phaseId?: string
  utaskId?: string
  microtaskId?: string
  issueId?: string
  feedbackId?: string
  nextAction?: string
  nextReadRef?: string[]
  sourceRef?: string[]
  validationState?: string
  patternName?: string
  patternWhen?: string
  patternWhy?: string
  patternEvidence?: string
  checkpointAs?: string
  summaryType?: string
  diagnosticWarning?: string[]
  envelopeCommand?: string
}

type MemoryUpdateOptions = MemoryContextOptions & GuardedWriteOptions & {
  id?: string
  mode?: string
  subject?: string
  subjectType?: string
  subjectId?: string
  subjectTitle?: string
  taskId?: string
  kanbanTaskId?: string
  sprintId?: string
  phaseId?: string
  utaskId?: string
  microtaskId?: string
  issueId?: string
  feedbackId?: string
  kind?: string
  durability?: 'short' | 'durable' | 'sticky'
  content?: string
  importance?: number
  purpose?: string[]
  area?: string[]
  status?: string[]
  reviewAfterDays?: number
  expiresAt?: string
  tag?: string[]
  nextAction?: string
  nextReadRef?: string[]
  sourceRef?: string[]
  validationState?: string
  patternName?: string
  patternWhen?: string
  patternWhy?: string
  patternEvidence?: string
  checkpointAs?: string
  summaryType?: string
  diagnosticWarning?: string[]
  stickyRank?: number
  supersede?: string
  envelopeCommand?: string
}

type MemoryCheckpointOptions = MemoryWriteOptions & {
  as?: string
}

type MemorySummaryOptions = MemoryWriteOptions & {
  closeout?: boolean
}

type MemoryDeleteOptions = MemoryContextOptions & GuardedWriteOptions & {
  id?: string
}

type MemoryPruneOptions = MemoryContextOptions & GuardedWriteOptions & {
  olderThanDays?: number
  keepLatest?: number
  maxDelete?: number
  includeSynced?: boolean
  kind?: string
  durability?: 'short' | 'durable' | 'sticky'
  subject?: string
  id?: string
  subjectType?: string
  subjectId?: string
  purpose?: string[]
  area?: string[]
  status?: string[]
  taskId?: string
  sprintId?: string
  phaseId?: string
  utaskId?: string
  issueId?: string
  feedbackId?: string
}

type MemoryCompactOptions = MemoryPruneOptions & {
  label?: string
  subjectLabel?: string
  subjectTitle?: string
  maxItems?: number
  writeSummary?: boolean
  targetDurability?: 'short' | 'durable' | 'sticky'
  targetKind?: string
  content?: string
  markSource?: boolean
  pruneSource?: boolean
}

type MemoryDocShortcutBaseOptions = MemoryResumeOptions & {
  refIndex?: number
}

type MemoryDocRefsOptions = MemoryDocShortcutBaseOptions

type MemoryDocAnswerOptions = MemoryDocShortcutBaseOptions & {
  q?: string
  ensure?: 'none' | 'index' | 'summary'
  limit?: number
  retrievalStrategy?: 'lexical' | 'hybrid' | 'semantic'
  documentVersionId?: string
}

type MemoryDocSourceOptions = MemoryDocShortcutBaseOptions & {
  documentVersionId?: string
  sectionId?: string
  pageVersionId?: string
  pageNumber?: string | number
}

type MemoryDocPublishOptions = MemoryDocSourceOptions & {
  target?: 'markdown' | 'html'
}

type ResolvedMemoryContext = Awaited<ReturnType<typeof resolveProjectBindingContext>>
type MemoryMode = 'kickoff' | 'resume' | 'decision' | 'blocker' | 'closeout' | 'rule'
type MemorySubjectKey = 'project' | 'ktask' | 'sprint' | 'phase' | 'utask' | 'issue' | 'feedback'
type MemorySubjectConfig = {
  key: MemorySubjectKey
  subjectType: string
  defaultQuery?: string
  defaultSourceTypes: string[]
}
type MemoryResumePackRefRecord = {
  kind?: string
  uri?: string
  resourceId?: string
  ref?: string
  documentVersionId?: string
  sectionId?: string
  pageVersionId?: string
  pageNumber?: number
  target?: string
  locale?: string
  fallbackLocale?: string
}

const MEMORY_MODES = new Set<MemoryMode>(['kickoff', 'resume', 'decision', 'blocker', 'closeout', 'rule'])
const MEMORY_SUBJECTS: Record<MemorySubjectKey, MemorySubjectConfig> = {
  project: {
    key: 'project',
    subjectType: 'projectman.plan',
    defaultQuery: 'resume project context',
    defaultSourceTypes: ['projectman.plan'],
  },
  ktask: {
    key: 'ktask',
    subjectType: 'projectman.kanban-task',
    defaultQuery: 'resume implementation handoff',
    defaultSourceTypes: ['projectman.kanban-task', 'projectman.sprint', 'projectman.phase', 'projectman.microtask'],
  },
  sprint: {
    key: 'sprint',
    subjectType: 'projectman.sprint',
    defaultQuery: 'resume active sprint context',
    defaultSourceTypes: ['projectman.sprint', 'projectman.phase', 'projectman.microtask', 'projectman.kanban-task'],
  },
  phase: {
    key: 'phase',
    subjectType: 'projectman.phase',
    defaultQuery: 'resume implementation handoff',
    defaultSourceTypes: ['projectman.phase', 'projectman.microtask', 'projectman.sprint', 'projectman.kanban-task'],
  },
  utask: {
    key: 'utask',
    subjectType: 'projectman.microtask',
    defaultQuery: 'resume implementation handoff',
    defaultSourceTypes: ['projectman.microtask', 'projectman.phase', 'projectman.sprint', 'projectman.kanban-task'],
  },
  issue: {
    key: 'issue',
    subjectType: 'projectman.issue',
    defaultQuery: 'resume open issue context',
    defaultSourceTypes: ['projectman.issue', 'projectman.kanban-task', 'projectman.sprint'],
  },
  feedback: {
    key: 'feedback',
    subjectType: 'projectman.feedback',
    defaultQuery: 'resume feedback triage context',
    defaultSourceTypes: ['projectman.feedback', 'projectman.kanban-task', 'projectman.sprint'],
  },
}
const MEMORY_MODE_DEFAULTS: Record<MemoryMode, { kind: string; durability: 'short' | 'durable' | 'sticky'; tags: string[] }> = {
  kickoff: { kind: 'kickoff', durability: 'short', tags: ['phase:kickoff'] },
  resume: { kind: 'resume', durability: 'short', tags: ['phase:resume'] },
  decision: { kind: 'decision', durability: 'short', tags: ['phase:decision'] },
  blocker: { kind: 'constraint', durability: 'short', tags: ['phase:blocker'] },
  closeout: { kind: 'closeout', durability: 'short', tags: ['phase:closeout'] },
  rule: { kind: 'rule', durability: 'sticky', tags: ['phase:memory'] },
}

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  const normalized = normalizeNonEmpty(value)
  return normalized ? [...previous, normalized] : previous
}

function toStringArray(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = normalizeNonEmpty(value)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function normalizeDecisionMemoryShape(params: {
  kind?: string
  durability?: 'short' | 'durable' | 'sticky'
  tags?: string[]
}): { kind?: string; durability?: 'short' | 'durable' | 'sticky'; tags: string[] } {
  const normalizedKind = normalizeNonEmpty(params.kind) || undefined
  const durability = params.durability
  const tags = uniqueStrings(params.tags ?? [])
  if (normalizedKind === 'decision') {
    return {
      kind: 'decision',
      durability,
      tags: uniqueStrings([...tags, 'phase:decision']),
    }
  }
  return { kind: normalizedKind, durability, tags }
}

function normalizeTagToken(value: unknown): string | undefined {
  const normalized = String(normalizeNonEmpty(value) ?? '').toLowerCase()
  if (!normalized) return undefined
  const token = normalized
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return token || undefined
}

function buildScopedTags(prefix: string, values: unknown[]): string[] {
  return uniqueStrings(values.map((value) => {
    const token = normalizeTagToken(value)
    return token ? `${prefix}:${token}` : undefined
  }))
}

function buildClassificationTags(options: { purpose?: unknown; area?: unknown; status?: unknown }): string[] {
  return uniqueStrings([
    ...buildScopedTags('purpose', toStringArray(options.purpose)),
    ...buildScopedTags('area', toStringArray(options.area)),
    ...buildScopedTags('status', toStringArray(options.status)),
  ])
}

function toNonNegativeInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`)
  }
  return parsed
}

function normalizeIsoDateTime(value: unknown, label: string): string | undefined {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return undefined
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} must be a valid ISO date/time.`)
  }
  return parsed.toISOString()
}

function parseRefLikeRecord(value: unknown, label: string): Record<string, unknown> {
  if (isRecord(value)) return value
  const normalized = normalizeNonEmpty(value)
  if (normalized) return { ref: normalized }
  throw new Error(`${label} entries must be strings, JSON objects, JSON arrays, or @file inputs.`)
}

function stripLooseRefToken(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2) {
    const first = trimmed[0]
    const last = trimmed[trimmed.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1)
    }
  }
  return trimmed
}

function parseLooseRefObject(value: string): Record<string, unknown> | undefined {
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return undefined
  const inner = trimmed.slice(1, -1).trim()
  if (!inner) return {}

  const result: Record<string, unknown> = {}
  for (const part of inner.split(/\s*,\s*/)) {
    if (!part) continue
    const separatorIndex = part.indexOf(':')
    if (separatorIndex <= 0) return undefined
    const key = stripLooseRefToken(part.slice(0, separatorIndex))
    const rawValue = stripLooseRefToken(part.slice(separatorIndex + 1))
    if (!key || !rawValue) return undefined
    result[key] = rawValue
  }
  return Object.keys(result).length > 0 ? result : undefined
}

function expandAtFileContent(value: string | undefined): string | undefined {
  if (typeof value === 'string' && value.startsWith('@')) {
    return readFileSync(value.slice(1).trim(), 'utf8')
  }
  return value
}

function parseRefLikeEntries(value: string, label: string): Record<string, unknown>[] {
  const trimmed = value.trim()
  if (!trimmed) return []

  const raw = trimmed.startsWith('@')
    ? readFileSync(trimmed.slice(1).trim(), 'utf8')
    : trimmed
  const normalizedRaw = raw.trim()
  if (!normalizedRaw) return []

  if ((normalizedRaw.startsWith('{') && normalizedRaw.endsWith('}')) || (normalizedRaw.startsWith('[') && normalizedRaw.endsWith(']'))) {
    try {
      const parsed = JSON.parse(normalizedRaw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((entry) => parseRefLikeRecord(entry, label))
      }
      return [parseRefLikeRecord(parsed, label)]
    } catch (error) {
      const looseObject = parseLooseRefObject(normalizedRaw)
      if (looseObject) return [looseObject]
      if (normalizedRaw.startsWith('{')) {
        return [{ ref: normalizedRaw }]
      }
      throw error
    }
  }

  return [{ ref: normalizedRaw }]
}

function parseRefOptionValues(values: unknown, label: string): Record<string, unknown>[] {
  return toStringArray(values).flatMap((entry) => parseRefLikeEntries(entry, label))
}

function normalizeMemoryMode(value: unknown): MemoryMode | undefined {
  const normalized = normalizeNonEmpty(value)?.toLowerCase() as MemoryMode | undefined
  if (!normalized) return undefined
  if (!MEMORY_MODES.has(normalized)) {
    throw new Error('Invalid --mode. Expected one of: kickoff, resume, decision, blocker, closeout, rule.')
  }
  return normalized
}

function normalizeMemoryDurability(value: unknown): 'short' | 'durable' | 'sticky' | undefined {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'short' || normalized === 'durable' || normalized === 'sticky') {
    return normalized
  }
  throw new Error('Invalid --durability. Expected one of: short, durable, sticky.')
}

function normalizeMemorySubject(value: unknown): MemorySubjectConfig | undefined {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized) return undefined
  const alias = normalized === 'task' ? 'ktask' : normalized === 'microtask' ? 'utask' : normalized
  const config = MEMORY_SUBJECTS[alias as MemorySubjectKey]
  if (!config) {
    throw new Error('Invalid --subject. Expected one of: project, ktask, sprint, phase, utask, issue, feedback.')
  }
  return config
}

function resolveAliasValue(primary: unknown, alias: unknown, primaryFlag: string, aliasFlag: string): string | undefined {
  const primaryValue = normalizeNonEmpty(primary)
  const aliasValue = normalizeNonEmpty(alias)
  if (primaryValue && aliasValue && primaryValue !== aliasValue) {
    throw new Error(`Conflicting values for ${primaryFlag} and ${aliasFlag}.`)
  }
  return primaryValue ?? aliasValue
}

function buildLinkedIds(options: {
  taskId?: unknown
  kanbanTaskId?: unknown
  sprintId?: unknown
  phaseId?: unknown
  utaskId?: unknown
  microtaskId?: unknown
  issueId?: unknown
  feedbackId?: unknown
}): {
  kanbanTaskId?: string
  sprintId?: string
  phaseId?: string
  microtaskId?: string
  issueId?: string
  feedbackId?: string
} {
  return {
    kanbanTaskId: resolveAliasValue(options.kanbanTaskId, options.taskId, '--kanban-task-id', '--task-id'),
    sprintId: normalizeNonEmpty(options.sprintId),
    phaseId: normalizeNonEmpty(options.phaseId),
    microtaskId: resolveAliasValue(options.microtaskId, options.utaskId, '--microtask-id', '--utask-id'),
    issueId: normalizeNonEmpty(options.issueId),
    feedbackId: normalizeNonEmpty(options.feedbackId),
  }
}

function buildSubjectId(
  config: MemorySubjectConfig | undefined,
  options: { id?: unknown; subjectId?: unknown },
  context: ResolvedMemoryContext,
): string | undefined {
  const genericId = normalizeNonEmpty(options.id)
  const subjectId = normalizeNonEmpty(options.subjectId)
  if (genericId && subjectId && genericId !== subjectId) {
    throw new Error('Conflicting values for --id and --subject-id.')
  }
  const explicit = subjectId ?? genericId
  if (explicit) return explicit
  if (config?.key === 'project') {
    const projectId = normalizeNonEmpty(context.projectId)
    if (!projectId) {
      throw new Error('Project subject requires --project-id or repo-bound project context.')
    }
    return projectId
  }
  if (config) {
    throw new Error('Subject requires --id (or --subject-id).')
  }
  return undefined
}

function buildSubjectLabel(options: { label?: unknown; subjectLabel?: unknown; subjectTitle?: unknown }): string | undefined {
  const label = normalizeNonEmpty(options.label)
  const subjectLabel = normalizeNonEmpty(options.subjectLabel)
  const subjectTitle = normalizeNonEmpty(options.subjectTitle)
  const values = [label, subjectLabel, subjectTitle].filter(Boolean) as string[]
  const unique = uniqueStrings(values)
  if (unique.length > 1) {
    throw new Error('Conflicting values for --label, --subject-label, and --subject-title.')
  }
  return unique[0]
}

function applySubjectDefaults(
  config: MemorySubjectConfig | undefined,
  subjectId: string | undefined,
  linked: ReturnType<typeof buildLinkedIds>,
): { subjectType?: string; sourceType?: string; sourceId?: string; sourceTypes: string[]; sourceIds: string[] } {
  if (!config || !subjectId) {
    return { sourceTypes: [], sourceIds: [] }
  }

  const sourceTypes = config.defaultSourceTypes
  const sourceIds = uniqueStrings([
    subjectId,
    linked.kanbanTaskId,
    linked.sprintId,
    linked.phaseId,
    linked.microtaskId,
    linked.issueId,
    linked.feedbackId,
  ])

  return {
    subjectType: config.subjectType,
    sourceType: config.subjectType,
    sourceId: subjectId,
    sourceTypes,
    sourceIds,
  }
}

function buildEnvelope(params: {
  command: string
  toolId: string
  resolvedContext: Record<string, unknown>
  input: Record<string, unknown>
  result: unknown
  diagnostics?: Record<string, unknown>
}): Record<string, unknown> {
  return compactPayload({
    command: params.command,
    toolId: params.toolId,
    resolvedContext: params.resolvedContext,
    input: params.input,
    result: params.result,
    diagnostics: params.diagnostics,
  })
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function buildMemoryQualityDiagnostics(params: {
  kind?: unknown
  durability?: unknown
  content?: unknown
  tags?: unknown
  subjectType?: unknown
  nextAction?: unknown
  validationState?: unknown
  sourceRefs?: unknown
  nextReadRefs?: unknown
}): Record<string, unknown> {
  const kind = normalizeNonEmpty(params.kind)?.toLowerCase()
  const durability = normalizeNonEmpty(params.durability)?.toLowerCase()
  const content = normalizeNonEmpty(params.content) ?? ''
  const tags = toStringArray(params.tags).map((tag) => tag.toLowerCase())
  const hasLinkedPmRef = tags.some((tag) =>
    tag.startsWith('kanban-task:')
    || tag.startsWith('sprint:')
    || tag.startsWith('phase:')
    || tag.startsWith('microtask:')
    || tag.startsWith('issue:')
    || tag.startsWith('feedback:'),
  )
  const hasSourceRefs = arrayLength(params.sourceRefs) > 0
  const hasNextReadRefs = arrayLength(params.nextReadRefs) > 0
  const warnings: string[] = []

  if ((kind === 'closeout' || kind === 'decision' || kind === 'blocker') && !normalizeNonEmpty(params.validationState)) {
    warnings.push('Add --validation-state with test/review/status evidence for closeout, decision, and blocker memory.')
  }
  if ((kind === 'kickoff' || kind === 'resume' || kind === 'closeout') && !normalizeNonEmpty(params.nextAction)) {
    warnings.push('Add --next-action so the next agent knows exactly where to continue or verify.')
  }
  if (!hasLinkedPmRef && !hasSourceRefs) {
    warnings.push('Link concrete evidence with --task-id/--sprint-id/--issue-id or --source-ref; project-only memory without refs is hard to verify.')
  }
  if ((durability === 'durable' || kind === 'closeout' || kind === 'decision') && content.length < 180) {
    warnings.push('Durable/decision memory content is very short; include request, work surface, outcome, refs, validation, and carry-forward.')
  }
  if (/\bPR\d+\b/i.test(content)) {
    warnings.push('Expand PR1/PR2-style labels into concrete scope and changed behavior; future agents should not need prior chat context.')
  }
  if (!hasSourceRefs && !hasNextReadRefs) {
    warnings.push('Add --source-ref or --next-read-ref for artifacts, sessions, docs, files, or PM records that prove the memory.')
  }

  return {
    contract: 'agent-readable-evidence-pack',
    status: warnings.length > 0 ? 'warn' : 'pass',
    requiredContent: [
      'request-or-purpose',
      'work-surface: board/task/sprint/issue/session/doc/file refs',
      'completed-outcome-and-current-status',
      'validation-or-review-evidence',
      'open-risks-and-next-action',
    ],
    warnings,
  }
}

function inferErrorCode(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes('apply_required')) return 'apply_required'
  if (normalized.includes('confirmation_required')) return 'confirmation_required'
  if (normalized.includes('not_found')) return 'not_found'
  if (normalized.includes('provide --id')) return 'missing_id'
  if (normalized.includes('provide one content source')) return 'missing_content_source'
  return 'command_failed'
}

function parseApiErrorPayload(message: string): { status?: number; payload?: Record<string, unknown> } {
  const match = /^API\s+(\d+):\s+([\s\S]+)$/i.exec(message.trim())
  if (!match) return {}
  const status = Number.parseInt(match[1] ?? '', 10)
  const rawPayload = match[2]?.trim()
  if (!rawPayload) return { status: Number.isInteger(status) ? status : undefined }
  try {
    const parsed = JSON.parse(rawPayload)
    return {
      status: Number.isInteger(status) ? status : undefined,
      payload: isRecord(parsed) ? parsed : undefined,
    }
  } catch {
    return { status: Number.isInteger(status) ? status : undefined }
  }
}

function augmentMemoryErrorMessage(toolId: string | undefined, message: string): { displayMessage: string; code: string } {
  const normalized = String(message ?? '')
  const api = parseApiErrorPayload(normalized)
  const payloadMessage = normalizeNonEmpty(api.payload?.message)
  const payloadError = normalizeNonEmpty(api.payload?.error)
  const baseMessage = payloadMessage ?? payloadError ?? normalized
  const code = inferErrorCode(`${normalized} ${payloadMessage ?? ''} ${payloadError ?? ''}`)

  if (code === 'apply_required') {
    return {
      code,
      displayMessage: `${baseMessage}\nRetry with --apply because ${toolId ?? 'this command'} writes durable memory.`,
    }
  }
  if (code === 'confirmation_required') {
    return {
      code,
      displayMessage: `${baseMessage}\nRetry with --apply --confirm because ${toolId ?? 'this command'} is destructive.`,
    }
  }

  return { code, displayMessage: baseMessage }
}

function emitMemoryCommandError(params: {
  options: { json?: boolean }
  command: string
  toolId?: string
  resolvedContext?: ResolvedMemoryContext
  input?: Record<string, unknown>
  error: unknown
}): void {
  const rawMessage = params.error instanceof Error ? params.error.message : String(params.error)
  const api = parseApiErrorPayload(rawMessage)
  const augmented = augmentMemoryErrorMessage(params.toolId, rawMessage)

  if (params.options.json) {
    console.log(JSON.stringify(compactPayload({
      command: params.command,
      toolId: params.toolId,
      resolvedContext: params.resolvedContext ? buildResolvedContextRecord(params.resolvedContext) : undefined,
      input: params.input,
      error: compactPayload({
        code: augmented.code,
        message: augmented.displayMessage,
        status: api.status,
        detail: isRecord(api.payload) ? api.payload : undefined,
      }),
    }), null, 2))
  } else {
    logError(augmented.displayMessage)
  }

  process.exitCode = 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readRecordTags(value: unknown): string[] {
  return isRecord(value) ? toStringArray(value.tags).map((entry) => entry.toLowerCase()) : []
}

function readRecordMeta(value: unknown): Record<string, unknown> {
  return isRecord(value) && isRecord(value.meta) ? value.meta : {}
}

function matchesClassificationFilters(record: unknown, options: { purpose?: unknown; area?: unknown; status?: unknown }): boolean {
  const requiredTags = buildClassificationTags(options)
  if (requiredTags.length === 0) return true

  const tagSet = new Set(readRecordTags(record))
  const meta = readRecordMeta(record)
  const purposeValues = uniqueStrings([...toStringArray(meta.purpose), normalizeNonEmpty(meta.purpose)])
  const areaValues = uniqueStrings([...toStringArray(meta.area), ...toStringArray(meta.areas), normalizeNonEmpty(meta.area)])
  const statusValues = uniqueStrings([...toStringArray(meta.status), normalizeNonEmpty(meta.status)])
  const derivedTags = new Set([
    ...buildScopedTags('purpose', purposeValues),
    ...buildScopedTags('area', areaValues),
    ...buildScopedTags('status', statusValues),
  ])

  for (const tag of requiredTags) {
    const normalizedTag = tag.toLowerCase()
    if (!tagSet.has(normalizedTag) && !derivedTags.has(normalizedTag)) {
      return false
    }
  }

  return true
}

function filterHostedMemoryResult(result: unknown, options: { purpose?: unknown; area?: unknown; status?: unknown }): unknown {
  if (buildClassificationTags(options).length === 0) return result
  if (Array.isArray(result)) {
    return result.filter((entry) => matchesClassificationFilters(entry, options))
  }
  if (!isRecord(result) || !Array.isArray(result.data)) return result
  return {
    ...result,
    data: result.data.filter((entry) => matchesClassificationFilters(entry, options)),
  }
}

const REPO_FIRST_MEMORY_TOOL_ID = 'repo-first.memory'
const MEMORY_EVIDENCE_HELP_TEXT = [
  '',
  'Memory quality contract:',
  '  Memory is an agent-readable evidence pack, not a chat log or changelog headline.',
  '  Content must name the request/purpose, PM surface (board/task/sprint/issue), concrete outcome, validation/review evidence, open risks, and next action.',
  '  Use --task-id/--sprint-id/--issue-id plus --source-ref/--next-read-ref so a future agent can verify the claim without rereading the whole transcript.',
  '  Expand labels like PR1/PR2 into concrete behavior and files; raw phase labels alone are not durable context.',
].join('\n')

function buildFileBasedEntryTags(entry: MemoryWorkspaceEntry): Set<string> {
  const classification = buildClassificationTags({
    purpose: entry.purpose,
    area: entry.areas,
    status: entry.status,
  })
  return new Set(uniqueStrings([...entry.tags, ...classification]).map((value) => value.toLowerCase()))
}

function localEntryMatchesClassification(entry: MemoryWorkspaceEntry, options: { purpose?: unknown; area?: unknown; status?: unknown }): boolean {
  const requiredTags = buildClassificationTags(options)
  if (requiredTags.length === 0) return true
  const tagSet = buildFileBasedEntryTags(entry)
  return requiredTags.every((tag) => tagSet.has(tag.toLowerCase()))
}

function normalizeLocalMemoryRecord(entry: MemoryWorkspaceEntry): Record<string, unknown> {
  return compactPayload({
    id: entry.memoryId ?? entry.id,
    kind: entry.kind,
    durability: entry.durability,
    content: entry.content,
    tags: entry.tags,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    importance: entry.importance,
    sourceType: entry.subjectType,
    sourceId: entry.subjectId,
    storage: entry.storage ?? 'local-cache',
    meta: compactPayload({
      projectId: entry.projectId,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      subjectTitle: entry.subjectTitle,
      nextAction: entry.nextAction,
      validationState: entry.validationState,
      sourceRefs: entry.sourceRefs,
      nextReadRefs: entry.nextReadRefs,
      purpose: entry.purpose,
      areas: entry.areas,
      status: entry.status,
      supersedes: normalizeNonEmpty(entry.raw?.supersedes),
      checkpointAs: normalizeNonEmpty(entry.raw?.checkpointAs),
      summaryType: normalizeNonEmpty(entry.raw?.summaryType),
    }),
  })
}

// Read-only loader: used solely by the read-only startup brief that the `start`
// command consumes. Memory subcommands never read local files as truth.
async function loadFileBasedEntries(context: ResolvedMemoryContext): Promise<MemoryWorkspaceEntry[]> {
  const paths = resolveMemoryWorkspacePaths(context)
  return readLocalMemoryEntries(paths.localItemsDir)
}

function buildFileBasedResultPayload(entries: MemoryWorkspaceEntry[]): Record<string, unknown>[] {
  return entries.map((entry) => normalizeLocalMemoryRecord(entry))
}

function filterFileBasedEntries(
  entries: MemoryWorkspaceEntry[],
  options: {
    subject?: unknown
    id?: unknown
    kind?: unknown
    durability?: unknown
    subjectType?: unknown
    subjectId?: unknown
    sourceType?: unknown
    sourceId?: unknown
    taskId?: unknown
    sprintId?: unknown
    phaseId?: unknown
    utaskId?: unknown
    issueId?: unknown
    feedbackId?: unknown
    purpose?: unknown
    area?: unknown
    status?: unknown
    strictClassification?: boolean
  },
): MemoryWorkspaceEntry[] {
  const subjectConfig = normalizeMemorySubject(options.subject)
  const subjectType = normalizeNonEmpty(options.subjectType) ?? subjectConfig?.subjectType
  const subjectId = normalizeNonEmpty(options.subjectId) ?? normalizeNonEmpty(options.id)
  const sourceType = normalizeNonEmpty(options.sourceType)
  const sourceId = normalizeNonEmpty(options.sourceId)
  const linked = buildLinkedIds(options)
  const kind = normalizeNonEmpty(options.kind)?.toLowerCase()
  const durability = normalizeMemoryDurability(options.durability)

  return entries.filter((entry) => {
    if (kind && (entry.kind ?? '').toLowerCase() !== kind) return false
    if (durability && entry.durability !== durability) return false
    if (subjectType && entry.subjectType !== subjectType) return false
    if (subjectId && entry.subjectId !== subjectId) return false
    if (sourceType && entry.subjectType !== sourceType) return false
    if (sourceId && entry.subjectId !== sourceId) return false
    const tagSet = buildFileBasedEntryTags(entry)
    if (linked.kanbanTaskId && !tagSet.has(`kanban-task:${linked.kanbanTaskId}`.toLowerCase())) return false
    if (linked.sprintId && !tagSet.has(`sprint:${linked.sprintId}`.toLowerCase())) return false
    if (linked.phaseId && !tagSet.has(`phase:${linked.phaseId}`.toLowerCase())) return false
    if (linked.microtaskId && !tagSet.has(`microtask:${linked.microtaskId}`.toLowerCase())) return false
    if (linked.issueId && !tagSet.has(`issue:${linked.issueId}`.toLowerCase())) return false
    if (linked.feedbackId && !tagSet.has(`feedback:${linked.feedbackId}`.toLowerCase())) return false
    if (options.strictClassification === true) {
      return localEntryMatchesClassification(entry, options)
    }
    return true
  })
}

function computeFileBasedSearchScore(
  entry: MemoryWorkspaceEntry,
  query: string | undefined,
  context: ResolvedMemoryContext,
  options: MemorySearchOptions,
): number {
  const normalizedQuery = normalizeNonEmpty(query)?.toLowerCase()
  const haystack = [
    entry.content,
    entry.subjectTitle,
    entry.nextAction,
    entry.validationState,
    ...entry.tags,
    ...entry.purpose,
    ...entry.areas,
    ...entry.status,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
  const tagSet = buildFileBasedEntryTags(entry)
  let score = 0

  if (options.subject && entry.subjectType === normalizeMemorySubject(options.subject)?.subjectType) {
    score += 50
  }
  const requestedId = normalizeNonEmpty(options.subjectId) ?? normalizeNonEmpty(options.id)
  if (requestedId && entry.subjectId === requestedId) {
    score += 80
  }
  if (!requestedId && normalizeMemorySubject(options.subject)?.key === 'project' && entry.projectId === context.projectId) {
    score += 40
  }
  for (const tag of buildClassificationTags(options)) {
    if (tagSet.has(tag.toLowerCase())) score += 20
  }
  if (normalizedQuery) {
    if (haystack.includes(normalizedQuery)) score += 30
    normalizedQuery
      .split(/\s+/)
      .filter(Boolean)
      .forEach((token) => {
        if (haystack.includes(token)) score += 8
      })
  }
  const timestamp = entry.updatedAt ?? entry.createdAt
  if (timestamp) {
    const ageMs = Math.max(0, Date.now() - new Date(timestamp).getTime())
    const days = Math.floor(ageMs / 86_400_000)
    score += Math.max(0, 15 - Math.min(days, 15))
  }
  return score
}

function resolveMemoryQuery(options: Pick<MemorySearchOptions, 'query' | 'q'>): string | undefined {
  return normalizeNonEmpty(options.query) ?? normalizeNonEmpty(options.q)
}

function summarizeFileBasedContent(content: string, maxLength = 120): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact || 'No content.'
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function memoryEntryId(entry: MemoryWorkspaceEntry): string | undefined {
  return normalizeNonEmpty(entry.memoryId) ?? normalizeNonEmpty(entry.id)
}

function memoryEntryRef(entry: MemoryWorkspaceEntry): string | undefined {
  const id = memoryEntryId(entry)
  return id ? `memory:${id}` : undefined
}

function buildSupersededMemoryIdSet(entries: MemoryWorkspaceEntry[]): Set<string> {
  const superseded = new Set<string>()
  for (const entry of entries) {
    const target = normalizeNonEmpty(entry.raw?.supersedes)
    if (target) superseded.add(target)
  }
  return superseded
}

function collapseSupersededFileBasedEntries(entries: MemoryWorkspaceEntry[]): MemoryWorkspaceEntry[] {
  const superseded = buildSupersededMemoryIdSet(entries)
  if (superseded.size === 0) return entries
  return entries.filter((entry) => {
    const id = memoryEntryId(entry)
    return !id || !superseded.has(id)
  })
}

function buildFileBasedResumePack(
  entries: MemoryWorkspaceEntry[],
  context: ResolvedMemoryContext,
  options: MemoryResumeOptions,
): MemoryWorkspaceResumePack & Record<string, unknown> {
  const filtered = collapseSupersededFileBasedEntries(filterFileBasedEntries(entries, options))
  const ranked = filtered
    .map((entry) => ({
      entry,
      score: computeFileBasedSearchScore(entry, resolveMemoryQuery(options) ?? options.goal, context, options),
    }))
    .sort((left, right) => right.score - left.score || (right.entry.updatedAt ?? right.entry.createdAt ?? '').localeCompare(left.entry.updatedAt ?? left.entry.createdAt ?? ''))

  const summaryCandidates = ranked
    .map(({ entry }) => entry)
    .filter((entry) => ['resume', 'kickoff', 'closeout', 'decision'].includes((entry.kind ?? '').toLowerCase()))
    .slice(0, 4)
  const stickyRules = filtered
    .filter((entry) => entry.durability === 'sticky' && (entry.kind ?? '').toLowerCase() === 'rule')
    .map((entry) => entry.content)

  const result: MemoryWorkspaceResumePack & Record<string, unknown> = {
    subject: compactPayload({
      type: normalizeMemorySubject(options.subject)?.subjectType ?? 'projectman.plan',
      id: normalizeNonEmpty(options.subjectId) ?? normalizeNonEmpty(options.id) ?? context.projectId,
    }),
    resumeSummary: summaryCandidates.length > 0
      ? summaryCandidates.map((entry) => summarizeFileBasedContent(entry.content, 100)).join(' | ')
      : 'No hosted resume summary available.',
    readStrategy: 'repo-first-deterministic',
    bootstrapGuidance: stickyRules,
    relatedMemory: buildFileBasedResultPayload(ranked.slice(0, toNonNegativeInteger(options.limit, 'limit') ?? 8).map(({ entry }) => entry)),
    recommendedRefs: [],
    depth: options.depth === 'deep' ? 'deep' : 'light',
  }
  return result
}

function buildFileBasedSynopsis(
  entries: MemoryWorkspaceEntry[],
  context: ResolvedMemoryContext,
  options: MemorySynopsisOptions,
): Record<string, unknown> {
  const filtered = collapseSupersededFileBasedEntries(filterFileBasedEntries(entries, options))
  const ranked = filtered
    .map((entry) => ({
      entry,
      score: computeFileBasedSearchScore(entry, resolveMemoryQuery(options) ?? options.goal, context, options),
    }))
    .sort((left, right) => right.score - left.score || (right.entry.updatedAt ?? right.entry.createdAt ?? '').localeCompare(left.entry.updatedAt ?? left.entry.createdAt ?? ''))
    .map(({ entry }) => entry)

  const currentFocus = ranked.find((entry) => ['resume', 'kickoff', 'decision'].includes((entry.kind ?? '').toLowerCase()))?.content
  const decisions = ranked
    .filter((entry) => ['decision', 'note'].includes((entry.kind ?? '').toLowerCase()))
    .slice(0, 5)
    .map((entry) => summarizeFileBasedContent(entry.content, 120))
  const openItems = ranked
    .map((entry) => normalizeNonEmpty(entry.nextAction))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 8)
  const bootstrapGuidance = ranked
    .filter((entry) => entry.durability === 'sticky' && (entry.kind ?? '').toLowerCase() === 'rule')
    .slice(0, 8)
    .map((entry) => summarizeFileBasedContent(entry.content, 140))

  return {
    projectId: context.projectId,
    scopeId: context.scopeId,
    summary: currentFocus ? summarizeFileBasedContent(currentFocus, 220) : 'No hosted synopsis available.',
    decisions,
    openItems,
    bootstrapGuidance,
    currentFocus: currentFocus ? summarizeFileBasedContent(currentFocus, 160) : undefined,
    sourceMemoryIds: ranked.slice(0, 8).map((entry) => entry.memoryId ?? entry.id).filter((entry): entry is string => Boolean(entry)),
    generatedAt: new Date().toISOString(),
    readStrategy: 'repo-first-deterministic',
  }
}

function rankFileBasedEntries(
  entries: MemoryWorkspaceEntry[],
  context: ResolvedMemoryContext,
  options: MemorySearchOptions,
): MemoryWorkspaceEntry[] {
  return collapseSupersededFileBasedEntries(filterFileBasedEntries(entries, options))
    .map((entry) => ({
      entry,
      score: computeFileBasedSearchScore(entry, resolveMemoryQuery(options) ?? options.goal, context, options),
    }))
    .sort((left, right) =>
      right.score - left.score
      || (right.entry.updatedAt ?? right.entry.createdAt ?? '').localeCompare(left.entry.updatedAt ?? left.entry.createdAt ?? ''),
    )
    .map(({ entry }) => entry)
}

function uniqueRefRecords(refs: unknown[]): Record<string, unknown>[] {
  const seen = new Set<string>()
  const result: Record<string, unknown>[] = []
  for (const ref of refs) {
    const record = parseRefLikeRecord(ref, 'memory ref')
    const key = JSON.stringify(record)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(record)
  }
  return result
}

function readStickyRank(entry: MemoryWorkspaceEntry): number {
  const rawRank = entry.raw?.stickyRank
  if (typeof rawRank === 'number' && Number.isFinite(rawRank)) return rawRank
  if (typeof rawRank === 'string' && rawRank.trim()) {
    const parsed = Number.parseInt(rawRank, 10)
    if (Number.isFinite(parsed)) return parsed
  }
  return entry.importance ?? 0
}

function sortStickyRuleEntries(entries: MemoryWorkspaceEntry[]): MemoryWorkspaceEntry[] {
  return [...entries]
    .filter((entry) => entry.durability === 'sticky' && (entry.kind ?? '').toLowerCase() === 'rule')
    .sort((left, right) =>
      readStickyRank(right) - readStickyRank(left)
      || (right.updatedAt ?? right.createdAt ?? '').localeCompare(left.updatedAt ?? left.createdAt ?? ''),
    )
}

function buildMemoryPointer(entry: MemoryWorkspaceEntry, whySimilar: string): Record<string, unknown> {
  return compactPayload({
    id: memoryEntryId(entry),
    ref: memoryEntryRef(entry),
    kind: entry.kind,
    durability: entry.durability,
    whySimilar,
    updatedAt: entry.updatedAt ?? entry.createdAt,
    summary: summarizeFileBasedContent(entry.content, 160),
  })
}

function buildStickyRulePointer(entry: MemoryWorkspaceEntry): Record<string, unknown> {
  return compactPayload({
    id: memoryEntryId(entry),
    ref: memoryEntryRef(entry),
    rank: readStickyRank(entry),
    summary: summarizeFileBasedContent(entry.content, 140),
  })
}

function buildWhySimilar(entry: MemoryWorkspaceEntry, options: MemorySearchOptions): string {
  const query = resolveMemoryQuery(options) ?? normalizeNonEmpty(options.goal)
  const reasons = uniqueStrings([
    query ? `matched query: ${query}` : undefined,
    entry.kind ? `kind:${entry.kind}` : undefined,
    entry.durability ? `durability:${entry.durability}` : undefined,
    ...entry.purpose.map((value) => `purpose:${value}`),
    ...entry.areas.map((value) => `area:${value}`),
  ])
  return reasons.slice(0, 3).join('; ') || 'ranked by subject, tags, and recency'
}

function applyLightBriefBudget(result: Record<string, unknown>, maxBytes = 12_000): Record<string, unknown> {
  const next: Record<string, unknown> & { budget: Record<string, unknown> } = {
    ...result,
    budget: {
      mode: 'light',
      maxBytes,
      truncated: false,
    },
  }
  const mutableSimilar = Array.isArray(next.similarWork) ? [...next.similarWork] : []
  const mutableSticky = Array.isArray(next.stickyRules) ? [...next.stickyRules] : []
  next.similarWork = mutableSimilar
  next.stickyRules = mutableSticky

  let bytes = Buffer.byteLength(JSON.stringify(next), 'utf8')
  while (bytes > maxBytes && mutableSimilar.length > 1) {
    mutableSimilar.pop()
    next.budget.truncated = true
    bytes = Buffer.byteLength(JSON.stringify(next), 'utf8')
  }
  while (bytes > maxBytes && mutableSticky.length > 1) {
    mutableSticky.pop()
    next.budget.truncated = true
    bytes = Buffer.byteLength(JSON.stringify(next), 'utf8')
  }
  next.budget.bytes = bytes
  return next
}

function buildMemoryGapHints(params: {
  resumePack: MemoryWorkspaceResumePack & Record<string, unknown>
  synopsis: Record<string, unknown>
  ranked: MemoryWorkspaceEntry[]
}): string[] {
  const gaps: string[] = []
  if (params.resumePack.bootstrapGuidance.length === 0) {
    gaps.push('No sticky project guidance is available for bootstrap.')
  }
  if (params.ranked.length === 0) {
    gaps.push('No matching hosted memory items were found for this subject/query.')
  }
  if (uniqueRefRecords(params.ranked.flatMap((entry) => entry.nextReadRefs ?? [])).length === 0) {
    gaps.push('No next-read refs are attached to the selected memory set.')
  }
  if (Array.isArray(params.synopsis.openItems) && params.synopsis.openItems.length === 0) {
    gaps.push('No explicit next actions are recorded in the selected memory set.')
  }
  return gaps
}

function buildFileBasedBrief(
  entries: MemoryWorkspaceEntry[],
  context: ResolvedMemoryContext,
  options: MemoryBriefOptions,
): Record<string, unknown> {
  const limit = toNonNegativeInteger(options.limit, 'limit') ?? 6
  const deep = options.depth === 'deep'
  const resumePack = buildFileBasedResumePack(entries, context, {
    ...options,
    limit,
    depth: options.depth ?? 'light',
  })
  const synopsis = buildFileBasedSynopsis(entries, context, { ...options, limit })
  const ranked = rankFileBasedEntries(entries, context, options).slice(0, limit)
  const nextActions = uniqueStrings(ranked.map((entry) => entry.nextAction)).slice(0, 5)
  const nextReadRefs = uniqueRefRecords(ranked.flatMap((entry) => entry.nextReadRefs ?? [])).slice(0, 8)
  const filtered = collapseSupersededFileBasedEntries(filterFileBasedEntries(entries, options))
  const stickyRuleEntries = sortStickyRuleEntries(filtered)
  const stickyCap = Math.min(3, Math.max(1, limit))
  const selectedStickyRules = stickyRuleEntries.slice(0, deep ? stickyRuleEntries.length : stickyCap)
  const baseResult = {
    readStrategy: deep ? 'repo-first-brief-deep' : 'repo-first-brief',
    generatedAt: new Date().toISOString(),
    subject: resumePack.subject,
    currentSynopsis: synopsis,
    subjectResume: compactPayload({
      resumeSummary: resumePack.resumeSummary,
      depth: resumePack.depth,
      relatedCount: resumePack.relatedMemory.length,
    }),
    stickyRules: deep
      ? selectedStickyRules.map((entry) => entry.content)
      : selectedStickyRules.map((entry) => buildStickyRulePointer(entry)),
    stickyRuleCount: stickyRuleEntries.length,
    omittedStickyRuleCount: deep ? 0 : Math.max(0, stickyRuleEntries.length - selectedStickyRules.length),
    similarWork: deep
      ? buildFileBasedResultPayload(ranked)
      : ranked.map((entry) => buildMemoryPointer(entry, buildWhySimilar(entry, options))),
    recommendedNextReads: nextReadRefs,
    memoryGaps: buildMemoryGapHints({ resumePack, synopsis, ranked }),
    nextMemoryAction: nextActions[0] ?? 'Use mem checkpoint --content <status> --apply --json after meaningful progress.',
    sourceMemoryIds: ranked.map((entry) => memoryEntryId(entry)).filter((entry): entry is string => Boolean(entry)),
  }

  return deep ? baseResult : applyLightBriefBudget(baseResult)
}

function buildRepoFirstMemoryBriefEnvelope(
  entries: MemoryWorkspaceEntry[],
  resolvedContext: ResolvedMemoryContext,
  options: MemoryBriefOptions,
  params: { readOnly?: boolean } = {},
): Record<string, unknown> {
  return buildEnvelope({
    command: 'memory.brief',
    toolId: REPO_FIRST_MEMORY_TOOL_ID,
    resolvedContext: buildResolvedContextRecord(resolvedContext),
    input: compactPayload({
      subject: options.subject,
      id: options.id,
      query: resolveMemoryQuery(options),
      repoFirst: true,
      readOnly: params.readOnly === true ? true : undefined,
    }),
    result: buildFileBasedBrief(entries, resolvedContext, options),
  })
}

export async function buildReadOnlyRepoFirstMemoryBrief(
  options: MemoryBriefOptions = {},
): Promise<Record<string, unknown>> {
  const resolvedContext = await resolveMemoryContext(options, { requireScope: true })
  const entries = await loadFileBasedEntries(resolvedContext)
  return buildRepoFirstMemoryBriefEnvelope(entries, resolvedContext, { ...options, depth: options.depth ?? 'light' }, { readOnly: true })
}

export async function buildReadOnlyRepoFirstMemoryBriefFromContext(
  context: RepoFirstMemoryBriefContext,
  options: MemoryBriefOptions = {},
): Promise<Record<string, unknown>> {
  const resolvedContext = context as ResolvedMemoryContext
  const entries = await loadFileBasedEntries(resolvedContext)
  return buildRepoFirstMemoryBriefEnvelope(entries, resolvedContext, { ...options, depth: options.depth ?? 'light' }, { readOnly: true })
}

function buildBriefFromHostedPacks(params: {
  resumePack: unknown
  synopsis: unknown
}): Record<string, unknown> {
  const resume = isRecord(params.resumePack) && isRecord(params.resumePack.data)
    ? params.resumePack.data
    : params.resumePack
  const synopsis = isRecord(params.synopsis) && isRecord(params.synopsis.data)
    ? params.synopsis.data
    : params.synopsis
  const relatedMemory = isRecord(resume) && Array.isArray(resume.relatedMemory) ? resume.relatedMemory : []
  const bootstrapGuidance = isRecord(resume) && Array.isArray(resume.bootstrapGuidance) ? resume.bootstrapGuidance : []

  return {
    readStrategy: 'hosted-brief',
    generatedAt: new Date().toISOString(),
    subject: isRecord(resume) ? resume.subject : undefined,
    currentSynopsis: synopsis,
    subjectResume: compactPayload({
      resumeSummary: isRecord(resume) ? normalizeNonEmpty(resume.resumeSummary) : undefined,
      depth: isRecord(resume) ? normalizeNonEmpty(resume.depth) : undefined,
      relatedCount: relatedMemory.length,
    }),
    stickyRules: bootstrapGuidance,
    similarWork: relatedMemory,
    recommendedNextReads: [],
    memoryGaps: relatedMemory.length === 0 ? ['No related hosted memory was returned for this subject/query.'] : [],
    nextMemoryAction: 'Use mem checkpoint --content <status> --apply --json after meaningful progress.',
  }
}

function unwrapResultData<T>(result: unknown): T | undefined {
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'data')) {
    return result.data as T
  }
  return result as T
}

async function resolveMemoryContext(options: MemoryContextOptions, params: { requireScope?: boolean } = {}): Promise<ResolvedMemoryContext> {
  const resolved = await resolveProjectBindingContext(options, {
    requireProject: params.requireScope === true,
  })
  const scopeId = normalizeNonEmpty(options.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  if (params.requireScope === true && !scopeId && !normalizeNonEmpty(resolved.projectId)) {
    throw new Error(
      'Memory context could not be resolved. Provide --project-id/--project-name. `--scope-id` remains a legacy/internal alias.',
    )
  }
  return { ...resolved, scopeId }
}

function normalizeMemoryDocRef(value: unknown): MemoryResumePackRefRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const pageNumberRaw = record.pageNumber
  const pageNumber =
    typeof pageNumberRaw === 'number'
      ? Math.trunc(pageNumberRaw)
      : typeof pageNumberRaw === 'string' && pageNumberRaw.trim()
        ? Number.parseInt(pageNumberRaw, 10)
        : undefined
  const normalized: MemoryResumePackRefRecord = compactPayload({
    kind: normalizeNonEmpty(record.kind),
    uri: normalizeNonEmpty(record.uri),
    resourceId: normalizeNonEmpty(record.resourceId),
    ref: normalizeNonEmpty(record.ref),
    documentVersionId: normalizeNonEmpty(record.documentVersionId),
    sectionId: normalizeNonEmpty(record.sectionId),
    pageVersionId: normalizeNonEmpty(record.pageVersionId),
    pageNumber: Number.isInteger(pageNumber) ? pageNumber : undefined,
    target: normalizeNonEmpty(record.target),
    locale: normalizeNonEmpty(record.locale),
    fallbackLocale: normalizeNonEmpty(record.fallbackLocale),
  })
  return Object.keys(normalized).length > 0 ? normalized : null
}

function getRecommendedDocRefs(resumePack: unknown): MemoryResumePackRefRecord[] {
  const payload = isRecord(resumePack) && isRecord(resumePack.data)
    ? resumePack.data
    : resumePack
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  const refs: unknown[] = Array.isArray((payload as Record<string, unknown>).recommendedRefs)
    ? ((payload as Record<string, unknown>).recommendedRefs as unknown[])
    : []
  return refs
    .map((entry) => normalizeMemoryDocRef(entry))
    .filter((entry): entry is MemoryResumePackRefRecord => Boolean(entry))
    .filter((entry) => entry.kind === 'doc' || Boolean(entry.documentVersionId) || Boolean(entry.uri))
}

function toPositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`)
  }
  return parsed
}

function selectRecommendedDocRef(refs: MemoryResumePackRefRecord[], refIndex: unknown): MemoryResumePackRefRecord {
  const index = toPositiveInteger(refIndex, 'refIndex') ?? 1
  const selected = refs[index - 1]
  if (!selected) {
    throw new Error(`Recommended doc ref #${index} was not found.`)
  }
  return selected
}

function resolveDocVersionIdFromRef(ref: MemoryResumePackRefRecord, explicit: unknown): string {
  const documentVersionId = normalizeNonEmpty(explicit) ?? normalizeNonEmpty(ref.documentVersionId)
  if (!documentVersionId) {
    throw new Error(
      'Selected recommended ref does not include documentVersionId. Write richer doc refs with documentVersionId to use memory -> docman shortcuts.',
    )
  }
  return documentVersionId
}

function appendQuery(path: string, query: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.append(key, String(value))
  }
  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}

async function callDocmanVersionRouteFromMemory(
  apiState: CliApiClientState,
  options: MemoryContextOptions,
  resolvedContext: ResolvedMemoryContext,
  params: {
    documentVersionId: string
    suffix: 'answer-pack' | 'compose-fetch' | 'materialize' | 'summaries' | 'index'
    method: 'GET' | 'POST'
    query?: Record<string, unknown>
    body?: Record<string, unknown>
  },
): Promise<unknown> {
  const headers = await buildAgentContextHeaders(buildGatewayOptions(options, resolvedContext))
  let path = `/api/docman/document-versions/${encodeURIComponent(params.documentVersionId)}/${params.suffix}`
  if (params.query) path = appendQuery(path, params.query)
  return apiState.client.fetchJson(path, {
    method: params.method,
    headers,
    body: params.method === 'GET' ? undefined : params.body,
    timeoutMs: options.timeoutMs,
  })
}

function normalizeEnsureMode(value: unknown): 'none' | 'index' | 'summary' {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized || normalized === 'none') return 'none'
  if (normalized === 'index' || normalized === 'summary') return normalized
  throw new Error('Invalid --ensure. Expected one of: none, index, summary.')
}

async function maybeEnsureDocmanReadState(
  apiState: CliApiClientState,
  options: MemoryContextOptions,
  resolvedContext: ResolvedMemoryContext,
  params: {
    ensure: 'none' | 'index' | 'summary'
    documentVersionId: string
    locale?: string
    fallbackLocale?: string
  },
): Promise<void> {
  if (params.ensure === 'none') return
  await callDocmanVersionRouteFromMemory(apiState, options, resolvedContext, {
    documentVersionId: params.documentVersionId,
    suffix: params.ensure === 'index' ? 'index' : 'summaries',
    method: 'POST',
    body: compactPayload({
      locale: normalizeNonEmpty(params.locale),
      fallbackLocale: normalizeNonEmpty(params.fallbackLocale),
    }),
  })
}

async function fetchMemoryResumePack(
  apiState: CliApiClientState,
  options: MemoryResumeOptions,
  resolvedContext: ResolvedMemoryContext,
): Promise<{ input: Record<string, unknown>; result: unknown }> {
  const input = compactPayload({
    filter: compactPayload({
      scopeId: resolvedContext.scopeId,
      scopeResolution: 'cascade',
      projectId: resolvedContext.projectId,
    }),
    retrieval: buildRetrievalInput(options, resolvedContext, {
      defaultQuery: normalizeMemorySubject(options.subject)?.defaultQuery,
    }),
    options: compactPayload({
      depth: options.depth === 'deep' ? 'deep' : 'light',
      limit: toNonNegativeInteger(options.limit, 'limit'),
    }),
  })
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    timeoutMs: options.timeoutMs,
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    toolId: 'agentspace.memory-item.build-resume-pack',
    input,
  })
  return { input, result: unwrapHostedToolResult(payload) }
}

async function fetchMemorySynopsis(
  apiState: CliApiClientState,
  options: MemorySynopsisOptions,
  resolvedContext: ResolvedMemoryContext,
): Promise<{ input: Record<string, unknown>; result: unknown }> {
  const input = compactPayload({
    filter: compactPayload({
      scopeId: resolvedContext.scopeId,
      scopeResolution: 'cascade',
      projectId: resolvedContext.projectId,
    }),
    retrieval: buildRetrievalInput(options, resolvedContext, {
      defaultQuery: normalizeMemorySubject(options.subject)?.defaultQuery,
    }),
    options: compactPayload({
      limit: toNonNegativeInteger(options.limit, 'limit'),
    }),
  })
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    timeoutMs: options.timeoutMs,
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    toolId: 'agentspace.memory-item.build-synopsis',
    input,
  })
  return { input, result: unwrapHostedToolResult(payload) }
}

function buildGatewayOptions(
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedMemoryContext,
): AgentGatewayContextOptions {
  return {
    ...options,
    ...preferProjectNameBinding(resolvedContext),
  }
}

async function hydrateProjectScopeContext(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedMemoryContext,
): Promise<ResolvedMemoryContext> {
  const projectId = normalizeNonEmpty(resolvedContext.projectId)
  if (!projectId) {
    return resolvedContext
  }
  if (normalizeNonEmpty(resolvedContext.scopeId) === projectId && normalizeNonEmpty(resolvedContext.projectName)) {
    return resolvedContext
  }

  const gatewayOptions: HostedToolInvokeOptions = {
    ...buildGatewayOptions(options, resolvedContext),
    toolId: 'agentspace.project.get-by-id',
    input: { id: projectId },
  }

  try {
    const payload = await invokeHostedToolWithApiState(apiState, gatewayOptions)
    const result = unwrapHostedToolResult(payload)
    const project = unwrapResultData<Record<string, unknown>>(result)
    if (!isRecord(project)) {
      return resolvedContext
    }

    const scopeId = resolveOwnerScopeIdFromProjectRecord(project, resolvedContext.scopeId ?? projectId)
    const projectName = normalizeNonEmpty(project.name) ?? resolvedContext.projectName

    return {
      ...resolvedContext,
      scopeId: scopeId ?? resolvedContext.scopeId,
      projectName,
    }
  } catch {
    return resolvedContext
  }
}

function buildResolvedContextRecord(context: ResolvedMemoryContext): Record<string, unknown> {
  return compactPayload({
    repoRoot: context.repoRoot,
    configPath: context.configPath,
    configFound: context.configFound,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
  })
}

function normalizeHostedCompatibleMemoryKind(kind: unknown): string | undefined {
  const value = normalizeNonEmpty(kind)
  if (value === 'summary') return 'checkpoint'
  return value
}

function normalizeCheckpointAsOption(value: unknown): 'status' | 'decision' | 'blocker' | 'milestone' {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized || normalized === 'status') return 'status'
  if (normalized === 'decision' || normalized === 'blocker' || normalized === 'milestone') return normalized
  throw new Error('Invalid --as. Expected one of: status, decision, blocker, milestone.')
}

function buildCheckpointWriteOptions(options: MemoryCheckpointOptions): MemoryWriteOptions {
  const checkpointAs = normalizeCheckpointAsOption(options.as)
  const mode = checkpointAs === 'decision'
    ? 'decision'
    : checkpointAs === 'blocker'
      ? 'blocker'
      : checkpointAs === 'status'
        ? 'resume'
        : undefined
  // `milestone` is not a hosted memory-item kind (valid kinds: kickoff, resume,
  // closeout, checkpoint, decision, constraint, rule, note). Map the milestone
  // flavor onto the `checkpoint` kind; the flavor is preserved via the
  // checkpoint:milestone tag, purpose, and meta.checkpointAs.
  const kind = checkpointAs === 'milestone' ? 'checkpoint' : undefined
  return {
    ...options,
    mode: options.mode ?? mode,
    kind: normalizeNonEmpty(options.kind) ?? kind,
    durability: normalizeMemoryDurability(options.durability) ?? 'short',
    subject: normalizeNonEmpty(options.subject) ?? 'project',
    purpose: uniqueStrings([...toStringArray(options.purpose), 'checkpoint', checkpointAs]),
    status: uniqueStrings([...toStringArray(options.status), 'active']),
    tag: uniqueStrings([...toStringArray(options.tag), 'memory:checkpoint', `checkpoint:${checkpointAs}`]),
    checkpointAs,
    envelopeCommand: 'memory.checkpoint',
  }
}

function buildSummaryWriteOptions(options: MemorySummaryOptions): MemoryWriteOptions {
  const closeout = options.closeout === true
  const targetDurability = normalizeMemoryDurability(options.durability) ?? 'short'
  const diagnosticWarning = closeout && targetDurability === 'short'
    ? ['--closeout without --durability durable writes a short session-closeout summary. Use --closeout --durability durable --confirm for durable closeout memory.']
    : []
  return {
    ...options,
    mode: options.mode ?? (closeout ? 'closeout' : 'resume'),
    kind: normalizeHostedCompatibleMemoryKind(options.kind) ?? (closeout ? 'closeout' : 'resume'),
    durability: targetDurability,
    subject: normalizeNonEmpty(options.subject) ?? 'project',
    purpose: uniqueStrings([...toStringArray(options.purpose), 'summary', closeout ? 'closeout' : 'session']),
    status: uniqueStrings([...toStringArray(options.status), closeout ? 'closed' : 'active']),
    tag: uniqueStrings([...toStringArray(options.tag), 'memory:summary', closeout ? 'summary:closeout' : 'summary:session']),
    summaryType: closeout ? 'closeout' : 'session',
    diagnosticWarning: uniqueStrings([...toStringArray(options.diagnosticWarning), ...diagnosticWarning]),
    envelopeCommand: 'memory.summary',
  }
}

function assertSummaryDurabilityGuard(options: MemorySummaryOptions, writeOptions: MemoryWriteOptions): void {
  const durability = normalizeMemoryDurability(writeOptions.durability)
  if (durability === 'durable' && (options.closeout !== true || options.confirm !== true)) {
    throw new Error('Durable summary requires --closeout --durability durable --confirm.')
  }
}

function buildRetrievalInput(
  options: MemorySearchOptions,
  context: ResolvedMemoryContext,
  params: { defaultQuery?: string } = {},
): Record<string, unknown> {
  const subjectConfig = normalizeMemorySubject(options.subject)
  const linked = buildLinkedIds(options)
  const subjectId = buildSubjectId(subjectConfig, options, context)
  const subjectLabel = buildSubjectLabel(options)
  const defaults = applySubjectDefaults(subjectConfig, subjectId, linked)

  return compactPayload({
    query: resolveMemoryQuery(options) ?? params.defaultQuery,
    goal: normalizeNonEmpty(options.goal),
    runtimeProfile: normalizeNonEmpty(options.runtimeProfile),
    workflowId: normalizeNonEmpty(options.workflowId),
    stepId: normalizeNonEmpty(options.stepId),
    subject: compactPayload({
      type: normalizeNonEmpty(options.subjectType) ?? defaults.subjectType,
      id: normalizeNonEmpty(options.subjectId) ?? subjectId,
      label: normalizeNonEmpty(options.subjectLabel) ?? subjectLabel,
    }),
    tags: uniqueStrings([
      ...toStringArray(options.tag),
      ...buildClassificationTags(options),
    ]),
    sourceTypes: toStringArray(options.sourceType).length > 0 ? toStringArray(options.sourceType) : defaults.sourceTypes,
    sourceIds: toStringArray(options.sourceId).length > 0 ? toStringArray(options.sourceId) : defaults.sourceIds,
    candidateLimit: toNonNegativeInteger(options.candidateLimit, 'candidateLimit'),
  })
}

export async function runMemorySearch(options: MemorySearchOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext | undefined
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const input = compactPayload({
      filter: compactPayload({
        scopeId: resolvedContext.scopeId,
        scopeResolution: 'cascade',
        projectId: resolvedContext.projectId,
      }),
      retrieval: buildRetrievalInput(options, resolvedContext),
      options: compactPayload({
        limit: toNonNegativeInteger(options.limit, 'limit'),
      }),
    })
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: 'agentspace.memory-item.search-memory-items',
      input,
    })

    const result = unwrapHostedToolResult(payload)
    const filteredResult = options.strictClassification === true ? filterHostedMemoryResult(result, options) : result
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'memory.search',
        toolId: 'agentspace.memory-item.search-memory-items',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: filteredResult,
      }), null, 2))
      return
    }

    logSuccess('Memory search completed.')
    console.log(JSON.stringify(filteredResult, null, 2))
  } catch (error) {
    emitMemoryCommandError({
      options,
      command: 'memory.search',
      toolId: 'agentspace.memory-item.search-memory-items',
      resolvedContext,
      error,
    })
  }
}

export async function runMemoryList(options: MemoryListOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const subjectConfig = normalizeMemorySubject(options.subject)
    const linked = buildLinkedIds(options)
    const subjectId = buildSubjectId(subjectConfig, options, resolvedContext)
    const defaults = applySubjectDefaults(subjectConfig, subjectId, linked)
    const input = compactPayload({
      filter: compactPayload({
        scopeId: resolvedContext.scopeId,
        scopeResolution: 'cascade',
        kind: normalizeNonEmpty(options.kind),
        durability: normalizeMemoryDurability(options.durability),
        sourceType: normalizeNonEmpty(options.sourceType) ?? normalizeNonEmpty(options.subjectType) ?? defaults.sourceType,
        sourceId: normalizeNonEmpty(options.sourceId) ?? normalizeNonEmpty(options.subjectId) ?? subjectId,
      }),
      options: compactPayload({
        limit: toNonNegativeInteger(options.limit, 'limit'),
      }),
    })
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: 'agentspace.memory-item.list-memory-items',
      input,
    })

    const result = unwrapHostedToolResult(payload)
    const filteredResult = filterHostedMemoryResult(result, options)
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'memory.list',
        toolId: 'agentspace.memory-item.list-memory-items',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: filteredResult,
      }), null, 2))
      return
    }

    logSuccess('Memory list completed.')
    console.log(JSON.stringify(filteredResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runMemoryGet(options: MemoryGetOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext
  let apiState: CliApiClientState | null
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: false })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)

    const input = { id }
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: 'agentspace.memory-item.get-by-id',
      input,
    })

    const result = unwrapHostedToolResult(payload)
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'memory.get',
        toolId: 'agentspace.memory-item.get-by-id',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result,
      }), null, 2))
      return
    }

    logSuccess('Memory item loaded.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runMemoryResume(options: MemoryResumeOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const { input, result } = await fetchMemoryResumePack(apiState, options, resolvedContext)
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'memory.resume',
        toolId: 'agentspace.memory-item.build-resume-pack',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result,
      }), null, 2))
      return
    }

    logSuccess('Resume pack built.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runMemorySynopsis(options: MemorySynopsisOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const { input, result } = await fetchMemorySynopsis(apiState, options, resolvedContext)
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'memory.synopsis',
        toolId: 'agentspace.memory-item.build-synopsis',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result,
      }), null, 2))
      return
    }

    logSuccess('Synopsis built.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runMemoryBrief(options: MemoryBriefOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext | undefined
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
    const resume = await fetchMemoryResumePack(apiState, options, resolvedContext)
    const synopsis = await fetchMemorySynopsis(apiState, options, resolvedContext)
    const result = buildBriefFromHostedPacks({
      resumePack: resume.result,
      synopsis: synopsis.result,
    })
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'memory.brief',
        toolId: 'agentspace.memory-item.build-resume-pack',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input: compactPayload({
          resume: resume.input,
          synopsis: synopsis.input,
        }),
        result,
      }), null, 2))
      return
    }
    logSuccess('Memory brief built.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    emitMemoryCommandError({
      options,
      command: 'memory.brief',
      toolId: 'agentspace.memory-item.build-resume-pack',
      resolvedContext,
      error,
    })
  }
}

export async function runMemoryDocRefs(options: MemoryDocRefsOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const { input, result } = await fetchMemoryResumePack(apiState, options, resolvedContext)
    const refs = getRecommendedDocRefs(result)
    const response = {
      refCount: refs.length,
      refs: refs.map((ref, index) => compactPayload({ index: index + 1, ...ref })),
      readStrategy: isRecord(result) ? normalizeNonEmpty(result.readStrategy) : undefined,
      resumeSummary: isRecord(result) ? normalizeNonEmpty(result.resumeSummary) : undefined,
    }

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'memory.doc.refs',
        toolId: 'agentspace.memory-item.build-resume-pack',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: response,
      }), null, 2))
      return
    }

    logSuccess('Recommended Docman refs loaded.')
    console.log(JSON.stringify(response, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runMemoryDocAnswer(options: MemoryDocAnswerOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext
  let apiState: CliApiClientState | null
  try {
    const q = normalizeNonEmpty(options.q)
    if (!q) throw new Error('Provide --q.')
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const { input: resumeInput, result: resumePack } = await fetchMemoryResumePack(apiState, options, resolvedContext)
    const refs = getRecommendedDocRefs(resumePack)
    const selectedRef = selectRecommendedDocRef(refs, options.refIndex)
    const documentVersionId = resolveDocVersionIdFromRef(selectedRef, options.documentVersionId)
    const ensure = normalizeEnsureMode(options.ensure)
    const locale = normalizeNonEmpty(selectedRef.locale) ?? normalizeNonEmpty(options.locale)
    const fallbackLocale = normalizeNonEmpty(selectedRef.fallbackLocale) ?? normalizeNonEmpty(options.fallbackLocale)

    await maybeEnsureDocmanReadState(apiState, options, resolvedContext, {
      ensure,
      documentVersionId,
      locale,
      fallbackLocale,
    })

    const q = normalizeNonEmpty(options.q)!
    const result = await callDocmanVersionRouteFromMemory(apiState, options, resolvedContext, {
      documentVersionId,
      suffix: 'answer-pack',
      method: 'GET',
      query: compactPayload({
        q,
        limit: toNonNegativeInteger(options.limit, 'limit'),
        retrievalStrategy: normalizeNonEmpty(options.retrievalStrategy),
        locale,
        fallbackLocale,
      }),
    })

    const envelopeResult = {
      selectedRef: compactPayload({ index: toPositiveInteger(options.refIndex, 'refIndex') ?? 1, ...selectedRef }),
      docman: result,
    }

    if (options.json) {
      console.log(JSON.stringify({
        command: 'memory.doc.answer',
        surface: '/api/docman/document-versions/:id/answer-pack',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input: compactPayload({
          resume: resumeInput,
          selectedRef: compactPayload({ index: toPositiveInteger(options.refIndex, 'refIndex') ?? 1, ...selectedRef }),
          documentVersionId,
          q,
          limit: toNonNegativeInteger(options.limit, 'limit'),
          retrievalStrategy: normalizeNonEmpty(options.retrievalStrategy),
          locale,
          fallbackLocale,
          ensure,
        }),
        result: envelopeResult,
      }, null, 2))
      return
    }

    logSuccess('Docman answer pack loaded from recommended memory refs.')
    console.log(JSON.stringify(envelopeResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runMemoryDocSource(options: MemoryDocSourceOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const { input: resumeInput, result: resumePack } = await fetchMemoryResumePack(apiState, options, resolvedContext)
    const refs = getRecommendedDocRefs(resumePack)
    const selectedRef = selectRecommendedDocRef(refs, options.refIndex)
    const documentVersionId = resolveDocVersionIdFromRef(selectedRef, options.documentVersionId)
    const result = await callDocmanVersionRouteFromMemory(apiState, options, resolvedContext, {
      documentVersionId,
      suffix: 'compose-fetch',
      method: 'POST',
      body: compactPayload({
        documentVersionId,
        sectionId: normalizeNonEmpty(options.sectionId) ?? normalizeNonEmpty(selectedRef.sectionId),
        pageVersionId: normalizeNonEmpty(options.pageVersionId) ?? normalizeNonEmpty(selectedRef.pageVersionId),
        pageNumber: toPositiveInteger(options.pageNumber, 'pageNumber') ?? selectedRef.pageNumber,
        locale: normalizeNonEmpty(selectedRef.locale) ?? normalizeNonEmpty(options.locale),
        fallbackLocale: normalizeNonEmpty(selectedRef.fallbackLocale) ?? normalizeNonEmpty(options.fallbackLocale),
      }),
    })

    const envelopeResult = {
      selectedRef: compactPayload({ index: toPositiveInteger(options.refIndex, 'refIndex') ?? 1, ...selectedRef }),
      docman: result,
    }

    if (options.json) {
      console.log(JSON.stringify({
        command: 'memory.doc.source',
        surface: '/api/docman/document-versions/:id/compose-fetch',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input: compactPayload({
          resume: resumeInput,
          selectedRef: compactPayload({ index: toPositiveInteger(options.refIndex, 'refIndex') ?? 1, ...selectedRef }),
          documentVersionId,
          sectionId: normalizeNonEmpty(options.sectionId) ?? normalizeNonEmpty(selectedRef.sectionId),
          pageVersionId: normalizeNonEmpty(options.pageVersionId) ?? normalizeNonEmpty(selectedRef.pageVersionId),
          pageNumber: toPositiveInteger(options.pageNumber, 'pageNumber') ?? selectedRef.pageNumber,
          locale: normalizeNonEmpty(selectedRef.locale) ?? normalizeNonEmpty(options.locale),
          fallbackLocale: normalizeNonEmpty(selectedRef.fallbackLocale) ?? normalizeNonEmpty(options.fallbackLocale),
        }),
        result: envelopeResult,
      }, null, 2))
      return
    }

    logSuccess('Docman source loaded from recommended memory refs.')
    console.log(JSON.stringify(envelopeResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runMemoryDocPublish(options: MemoryDocPublishOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const { input: resumeInput, result: resumePack } = await fetchMemoryResumePack(apiState, options, resolvedContext)
    const refs = getRecommendedDocRefs(resumePack)
    const selectedRef = selectRecommendedDocRef(refs, options.refIndex)
    const documentVersionId = resolveDocVersionIdFromRef(selectedRef, options.documentVersionId)
    const target = normalizeNonEmpty(options.target) ?? normalizeNonEmpty(selectedRef.target) ?? 'markdown'
    if (target !== 'markdown' && target !== 'html') {
      throw new Error('Target must be markdown or html.')
    }
    const result = await callDocmanVersionRouteFromMemory(apiState, options, resolvedContext, {
      documentVersionId,
      suffix: 'materialize',
      method: 'POST',
      body: compactPayload({
        documentVersionId,
        target,
        sectionId: normalizeNonEmpty(options.sectionId) ?? normalizeNonEmpty(selectedRef.sectionId),
        pageVersionId: normalizeNonEmpty(options.pageVersionId) ?? normalizeNonEmpty(selectedRef.pageVersionId),
        pageNumber: toPositiveInteger(options.pageNumber, 'pageNumber') ?? selectedRef.pageNumber,
        locale: normalizeNonEmpty(selectedRef.locale) ?? normalizeNonEmpty(options.locale),
        fallbackLocale: normalizeNonEmpty(selectedRef.fallbackLocale) ?? normalizeNonEmpty(options.fallbackLocale),
      }),
    })

    const envelopeResult = {
      selectedRef: compactPayload({ index: toPositiveInteger(options.refIndex, 'refIndex') ?? 1, ...selectedRef }),
      docman: result,
    }

    if (options.json) {
      console.log(JSON.stringify({
        command: 'memory.doc.publish',
        surface: '/api/docman/document-versions/:id/materialize',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input: compactPayload({
          resume: resumeInput,
          selectedRef: compactPayload({ index: toPositiveInteger(options.refIndex, 'refIndex') ?? 1, ...selectedRef }),
          documentVersionId,
          target,
          sectionId: normalizeNonEmpty(options.sectionId) ?? normalizeNonEmpty(selectedRef.sectionId),
          pageVersionId: normalizeNonEmpty(options.pageVersionId) ?? normalizeNonEmpty(selectedRef.pageVersionId),
          pageNumber: toPositiveInteger(options.pageNumber, 'pageNumber') ?? selectedRef.pageNumber,
          locale: normalizeNonEmpty(selectedRef.locale) ?? normalizeNonEmpty(options.locale),
          fallbackLocale: normalizeNonEmpty(selectedRef.fallbackLocale) ?? normalizeNonEmpty(options.fallbackLocale),
        }),
        result: envelopeResult,
      }, null, 2))
      return
    }

    logSuccess('Docman publish output loaded from recommended memory refs.')
    console.log(JSON.stringify(envelopeResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

// -----------------------------------------------------------------------------
// Hosted client-orchestration helpers for checkpoint/prune/compact.
// These read hosted memory rows (list-memory-items) and never touch local files.
// -----------------------------------------------------------------------------

function hostedRowId(row: Record<string, unknown>): string | undefined {
  return normalizeNonEmpty(row.id) ?? normalizeNonEmpty(row.memoryId)
}

function hostedRowTags(row: Record<string, unknown>): Set<string> {
  return new Set(toStringArray(row.tags).map((tag) => tag.toLowerCase()))
}

function hostedRowMeta(row: Record<string, unknown>): Record<string, unknown> {
  return isRecord(row.meta) ? row.meta : {}
}

function hostedRowTimestamp(row: Record<string, unknown>): number | undefined {
  const value = normalizeNonEmpty(row.updatedAt) ?? normalizeNonEmpty(row.createdAt)
  if (!value) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

/**
 * Read hosted memory rows for client-orchestrated prune/compact/checkpoint
 * supersede. Uses the hosted list-memory-items op (server truth) with the same
 * subject/source filter the write path uses; applies durability/kind/linked-id
 * filters in-process. No local memory file is read.
 */
async function listHostedMemoryRows(
  apiState: CliApiClientState,
  options: MemoryContextOptions,
  resolvedContext: ResolvedMemoryContext,
  filters: {
    durability?: 'short' | 'durable' | 'sticky'
    kind?: string
    subject?: string
    subjectType?: string
    subjectId?: string
    id?: string
    taskId?: string
    sprintId?: string
    phaseId?: string
    utaskId?: string
    issueId?: string
    feedbackId?: string
  },
): Promise<Record<string, unknown>[]> {
  const subjectConfig = normalizeMemorySubject(filters.subject)
  const linked = buildLinkedIds(filters)
  const subjectId = buildSubjectId(subjectConfig, { id: filters.id, subjectId: filters.subjectId }, resolvedContext)
  const defaults = applySubjectDefaults(subjectConfig, subjectId, linked)
  const input = compactPayload({
    filter: compactPayload({
      scopeId: resolvedContext.scopeId,
      scopeResolution: 'cascade',
      durability: filters.durability,
      kind: normalizeNonEmpty(filters.kind),
      sourceType: normalizeNonEmpty(filters.subjectType) ?? defaults.sourceType,
      sourceId: normalizeNonEmpty(filters.subjectId) ?? subjectId,
    }),
  })
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    timeoutMs: options.timeoutMs,
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    toolId: 'agentspace.memory-item.list-memory-items',
    input,
  })
  const result = unwrapHostedToolResult(payload)
  const data = unwrapResultData<unknown>(result)
  const rows = Array.isArray(data) ? data.filter(isRecord) : Array.isArray(result) ? result.filter(isRecord) : []
  // In-process linked-id filtering (hosted list filters by source, not by tag).
  return rows.filter((row) => {
    if (filters.durability && normalizeNonEmpty(row.durability) !== filters.durability) return false
    const tagSet = hostedRowTags(row)
    if (linked.kanbanTaskId && !tagSet.has(`kanban-task:${linked.kanbanTaskId}`.toLowerCase())) return false
    if (linked.sprintId && !tagSet.has(`sprint:${linked.sprintId}`.toLowerCase())) return false
    if (linked.phaseId && !tagSet.has(`phase:${linked.phaseId}`.toLowerCase())) return false
    if (linked.microtaskId && !tagSet.has(`microtask:${linked.microtaskId}`.toLowerCase())) return false
    if (linked.issueId && !tagSet.has(`issue:${linked.issueId}`.toLowerCase())) return false
    if (linked.feedbackId && !tagSet.has(`feedback:${linked.feedbackId}`.toLowerCase())) return false
    return true
  })
}

/**
 * Resolve the prior rolling status checkpoint id from hosted memory so a new
 * status checkpoint can supersede it. Server-first: reads via list-memory-items,
 * never from local files. Only applies to the default `--as status` flavor with
 * no explicit --supersede.
 */
async function addAutoCheckpointSupersedeHosted(
  writeOptions: MemoryWriteOptions,
  original: MemoryCheckpointOptions,
): Promise<MemoryWriteOptions> {
  if (normalizeNonEmpty(writeOptions.supersede) || normalizeNonEmpty(writeOptions.checkpointAs) !== 'status') {
    return writeOptions
  }
  try {
    const apiState = await requireApiState(original)
    if (!apiState) return writeOptions
    let resolvedContext = await resolveMemoryContext(original, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, original, resolvedContext)
    // Match the prior rolling status checkpoint by SUBJECT only (mirrors the
    // legacy subjectType/subjectId match). Linked task/sprint tags are not part
    // of the supersede key, so a status checkpoint supersedes the prior status
    // checkpoint for the same subject regardless of which linked refs it carried.
    const rows = await listHostedMemoryRows(apiState, original, resolvedContext, {
      durability: 'short',
      kind: 'resume',
      subject: writeOptions.subject,
      subjectType: writeOptions.subjectType,
      subjectId: writeOptions.subjectId,
      id: writeOptions.id,
    })
    const previous = rows
      .filter((row) => {
        const tagSet = hostedRowTags(row)
        const meta = hostedRowMeta(row)
        return tagSet.has('memory:checkpoint') || normalizeNonEmpty(meta.checkpointAs) === 'status'
      })
      .sort((left, right) => (hostedRowTimestamp(right) ?? 0) - (hostedRowTimestamp(left) ?? 0))[0]
    const previousId = previous ? hostedRowId(previous) : undefined
    return previousId ? { ...writeOptions, supersede: previousId } : writeOptions
  } catch {
    // Best-effort supersede only; never block the checkpoint write on it.
    return writeOptions
  }
}

function hostedRowSummary(row: Record<string, unknown>, maxLength = 180): string {
  const content = normalizeNonEmpty(row.content) ?? ''
  const compact = content.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact || 'No content.'
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function buildHostedCompactDraftSummary(
  rows: Record<string, unknown>[],
  context: ResolvedMemoryContext,
): string {
  const lines = [
    '# Compacted Memory Summary',
    '',
    `Project: ${context.projectName ?? context.projectId ?? 'unknown'}`,
    `Source count: ${rows.length}`,
    '',
    '## High-Signal Notes',
  ]
  if (rows.length === 0) {
    lines.push('- No source memories selected for compaction.')
  } else {
    for (const row of rows) {
      const meta = hostedRowMeta(row)
      const subject = [normalizeNonEmpty(row.sourceType) ?? normalizeNonEmpty(meta.subjectType), normalizeNonEmpty(meta.subjectTitle) ?? normalizeNonEmpty(row.sourceId)].filter(Boolean).join(' / ')
      lines.push(`- ${normalizeNonEmpty(row.kind) ?? 'memory'}${subject ? ` (${subject})` : ''}: ${hostedRowSummary(row, 180)}`)
    }
  }
  const nextActions = uniqueStrings(rows.map((row) => normalizeNonEmpty(hostedRowMeta(row).nextAction))).slice(0, 8)
  if (nextActions.length > 0) {
    lines.push('', '## Carry-Forward Actions')
    for (const action of nextActions) lines.push(`- ${action}`)
  }
  lines.push('', '## Source Memory IDs')
  for (const row of rows) {
    lines.push(`- ${hostedRowId(row) ?? 'unknown'}`)
  }
  lines.push('', '> Review this deterministic draft before treating it as durable project memory.')
  return `${lines.join('\n')}\n`
}

export async function runMemoryCheckpoint(options: MemoryCheckpointOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext | undefined
  try {
    const writeOptions = buildCheckpointWriteOptions(options)
    // Server-first: a rolling status checkpoint auto-supersedes the previous
    // status checkpoint for the same subject. Resolve the prior id from hosted
    // memory (list-memory-items), never from local files.
    const withSupersede = await addAutoCheckpointSupersedeHosted(writeOptions, options)
    await runMemoryWrite(withSupersede)
  } catch (error) {
    emitMemoryCommandError({
      options,
      command: 'memory.checkpoint',
      toolId: 'agentspace.memory-item.add-memory-item',
      resolvedContext,
      error,
    })
  }
}

export async function runMemorySummary(options: MemorySummaryOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext | undefined
  try {
    const writeOptions = buildSummaryWriteOptions(options)
    assertSummaryDurabilityGuard(options, writeOptions)
    // Server-first: summary maps to a hosted memory-item write with the
    // checkpoint/closeout kind (there is no separate `summary` kind on
    // memory-item; the summary flavor is carried in tags + meta.summaryType).
    await runMemoryWrite(writeOptions)
  } catch (error) {
    emitMemoryCommandError({
      options,
      command: 'memory.summary',
      toolId: 'agentspace.memory-item.add-memory-item',
      resolvedContext,
      error,
    })
  }
}

function buildMemoryUpdatePatch(
  options: MemoryUpdateOptions,
  resolvedContext: ResolvedMemoryContext,
): Record<string, unknown> {
  const mode = normalizeMemoryMode(options.mode)
  const modeDefaults = mode ? MEMORY_MODE_DEFAULTS[mode] : undefined
  const subjectConfig = normalizeMemorySubject(options.subject)
  const linked = buildLinkedIds(options)
  const subjectId = buildSubjectId(subjectConfig, { subjectId: options.subjectId }, resolvedContext)
  const subjectLabel = buildSubjectLabel(options)
  const subjectDefaults = applySubjectDefaults(subjectConfig, subjectId, linked)
  const durability = normalizeMemoryDurability(options.durability) ?? modeDefaults?.durability
  const stickyScope = durability === 'sticky' ? 'project' : undefined

  const tags = uniqueStrings([
    ...(modeDefaults?.tags ?? []),
    ...toStringArray(options.tag),
    ...buildClassificationTags(options),
    resolvedContext.projectId ? `project:${resolvedContext.projectId}` : undefined,
    linked.kanbanTaskId ? `kanban-task:${linked.kanbanTaskId}` : undefined,
    linked.sprintId ? `sprint:${linked.sprintId}` : undefined,
    linked.phaseId ? `phase:${linked.phaseId}` : undefined,
    linked.microtaskId ? `microtask:${linked.microtaskId}` : undefined,
    normalizeNonEmpty(options.patternName) ? `pattern:${normalizeNonEmpty(options.patternName)}` : undefined,
  ])
  const normalizedMemoryShape = normalizeDecisionMemoryShape({
    kind: normalizeNonEmpty(options.kind) ?? modeDefaults?.kind,
    durability,
    tags,
  })

  const meta = compactPayload({
    purpose: toStringArray(options.purpose),
    areas: toStringArray(options.area),
    status: toStringArray(options.status),
    reviewAfterDays: toNonNegativeInteger(options.reviewAfterDays, 'reviewAfterDays'),
    expiresAt: normalizeIsoDateTime(options.expiresAt, 'expiresAt'),
    subjectType: normalizeNonEmpty(options.subjectType) ?? subjectDefaults.subjectType,
    subjectId: normalizeNonEmpty(options.subjectId) ?? subjectId,
    subjectTitle: normalizeNonEmpty(options.subjectTitle) ?? subjectLabel,
    projectId: resolvedContext.projectId,
    kanbanTaskId: linked.kanbanTaskId,
    sprintId: linked.sprintId,
    phaseId: linked.phaseId,
    microtaskId: linked.microtaskId,
    issueId: linked.issueId,
    feedbackId: linked.feedbackId,
    nextAction: normalizeNonEmpty(options.nextAction),
    nextReadRefs: parseRefOptionValues(options.nextReadRef, '--next-read-ref'),
    validationState: normalizeNonEmpty(options.validationState),
    sourceRefs: parseRefOptionValues(options.sourceRef, '--source-ref'),
    patternName: normalizeNonEmpty(options.patternName),
    patternWhen: normalizeNonEmpty(options.patternWhen),
    patternWhy: normalizeNonEmpty(options.patternWhy),
    patternEvidence: normalizeNonEmpty(options.patternEvidence),
    stickyScope,
    stickyRank: toNonNegativeInteger(options.stickyRank, 'stickyRank'),
    supersedes: normalizeNonEmpty(options.supersede),
  })

  return compactPayload({
    kind: normalizedMemoryShape.kind,
    durability: normalizedMemoryShape.durability,
    content: normalizeNonEmpty(options.content),
    tags: normalizedMemoryShape.tags.length > 0 ? normalizedMemoryShape.tags : undefined,
    importance: toNonNegativeInteger(options.importance, 'importance'),
    sourceType: normalizeNonEmpty(options.subjectType) ?? subjectDefaults.sourceType,
    sourceId: normalizeNonEmpty(options.subjectId) ?? subjectId,
    meta: Object.keys(meta).length > 0 ? meta : undefined,
  })
}

export async function runMemoryUpdate(options: MemoryUpdateOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext | undefined
  let apiState: CliApiClientState | null
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: false })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)

    const patch = buildMemoryUpdatePatch(options, resolvedContext)
    if (Object.keys(patch).length === 0) {
      throw new Error('Provide at least one patch field such as --content, --kind, --tag, --next-action, or sticky metadata.')
    }
    const patchMeta = isRecord(patch.meta) ? patch.meta : {}
    const memoryQuality = buildMemoryQualityDiagnostics({
      kind: patch.kind,
      durability: patch.durability,
      content: patch.content,
      tags: patch.tags,
      subjectType: patch.sourceType,
      nextAction: patchMeta.nextAction,
      validationState: patchMeta.validationState,
      sourceRefs: patchMeta.sourceRefs,
      nextReadRefs: patchMeta.nextReadRefs,
    })
    const input = { id, patch }
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: 'agentspace.memory-item.update-memory-item',
      input,
      preview: options.preview,
      apply: options.apply,
      confirm: options.confirm,
      idempotencyKey: options.idempotencyKey,
    })

    const result = unwrapHostedToolResult(payload)
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: options.envelopeCommand ?? 'memory.update',
        toolId: 'agentspace.memory-item.update-memory-item',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result,
        diagnostics: compactPayload({ memoryQuality, warnings: toStringArray(options.diagnosticWarning) }),
      }), null, 2))
      return
    }

    logSuccess('Memory item updated.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    emitMemoryCommandError({
      options,
      command: options.envelopeCommand ?? 'memory.update',
      toolId: 'agentspace.memory-item.update-memory-item',
      resolvedContext,
      error,
    })
  }
}

export async function runMemoryWrite(options: MemoryWriteOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext | undefined
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const mode = normalizeMemoryMode(options.mode)
    const modeDefaults = mode ? MEMORY_MODE_DEFAULTS[mode] : undefined
    const subjectConfig = normalizeMemorySubject(options.subject)
    const linked = buildLinkedIds(options)
    const subjectId = buildSubjectId(subjectConfig, options, resolvedContext)
    const subjectLabel = buildSubjectLabel(options)
    const subjectDefaults = applySubjectDefaults(subjectConfig, subjectId, linked)

    const requestedKind = normalizeNonEmpty(options.kind) ?? modeDefaults?.kind
    const durability = normalizeMemoryDurability(options.durability) ?? modeDefaults?.durability
    const content = normalizeNonEmpty(expandAtFileContent(options.content))
    if (!requestedKind || !durability || !content) {
      logError('Missing required memory write fields. Provide --kind or --mode, --durability or --mode, and --content.')
      process.exitCode = 1
      return
    }

    const stickyScope = durability === 'sticky' ? 'project' : undefined
    const tags = [
      ...(modeDefaults?.tags ?? []),
      ...toStringArray(options.tag),
      ...buildClassificationTags(options),
      resolvedContext.projectId ? `project:${resolvedContext.projectId}` : undefined,
      linked.kanbanTaskId ? `kanban-task:${linked.kanbanTaskId}` : undefined,
      linked.sprintId ? `sprint:${linked.sprintId}` : undefined,
      linked.phaseId ? `phase:${linked.phaseId}` : undefined,
      linked.microtaskId ? `microtask:${linked.microtaskId}` : undefined,
      normalizeNonEmpty(options.patternName) ? `pattern:${normalizeNonEmpty(options.patternName)}` : undefined,
    ]
    const normalizedMemoryShape = normalizeDecisionMemoryShape({
      kind: requestedKind,
      durability,
      tags: uniqueStrings(tags),
    })

    const meta = compactPayload({
      purpose: toStringArray(options.purpose),
      areas: toStringArray(options.area),
      status: toStringArray(options.status),
      reviewAfterDays: toNonNegativeInteger(options.reviewAfterDays, 'reviewAfterDays'),
      expiresAt: normalizeIsoDateTime(options.expiresAt, 'expiresAt'),
      subjectType: normalizeNonEmpty(options.subjectType) ?? subjectDefaults.subjectType,
      subjectId: normalizeNonEmpty(options.subjectId) ?? subjectId,
      subjectTitle: normalizeNonEmpty(options.subjectTitle) ?? subjectLabel,
      projectId: resolvedContext.projectId,
      kanbanTaskId: linked.kanbanTaskId,
      sprintId: linked.sprintId,
      phaseId: linked.phaseId,
      microtaskId: linked.microtaskId,
      issueId: linked.issueId,
      feedbackId: linked.feedbackId,
      nextAction: normalizeNonEmpty(options.nextAction),
      nextReadRefs: parseRefOptionValues(options.nextReadRef, '--next-read-ref'),
      validationState: normalizeNonEmpty(options.validationState),
      sourceRefs: parseRefOptionValues(options.sourceRef, '--source-ref'),
      patternName: normalizeNonEmpty(options.patternName),
      patternWhen: normalizeNonEmpty(options.patternWhen),
      patternWhy: normalizeNonEmpty(options.patternWhy),
      patternEvidence: normalizeNonEmpty(options.patternEvidence),
      stickyScope,
      stickyRank: toNonNegativeInteger(options.stickyRank, 'stickyRank'),
      supersedes: normalizeNonEmpty(options.supersede),
      // Preserve the checkpoint/summary flavor server-side (these flow in from
      // mem checkpoint --as <flavor> / mem summary). There is no dedicated
      // hosted column, so they live in meta alongside the matching tags.
      checkpointAs: normalizeNonEmpty(options.checkpointAs),
      summaryType: normalizeNonEmpty(options.summaryType),
    })

    const input = {
      data: compactPayload({
        scopeId: resolvedContext.scopeId,
        kind: normalizedMemoryShape.kind,
        durability: normalizedMemoryShape.durability,
        content,
        tags: normalizedMemoryShape.tags.length > 0 ? normalizedMemoryShape.tags : undefined,
        importance: toNonNegativeInteger(options.importance, 'importance'),
        sourceType: normalizeNonEmpty(options.sourceType) ?? subjectDefaults.sourceType,
        sourceId: normalizeNonEmpty(options.sourceId) ?? subjectDefaults.sourceId,
        meta: Object.keys(meta).length > 0 ? meta : undefined,
      }),
    }
    const memoryQuality = buildMemoryQualityDiagnostics({
      kind: input.data.kind,
      durability: input.data.durability,
      content: input.data.content,
      tags: input.data.tags,
      subjectType: input.data.sourceType,
      nextAction: meta.nextAction,
      validationState: meta.validationState,
      sourceRefs: meta.sourceRefs,
      nextReadRefs: meta.nextReadRefs,
    })

    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: 'agentspace.memory-item.add-memory-item',
      input,
      preview: options.preview,
      apply: options.apply,
      confirm: options.confirm,
      idempotencyKey: options.idempotencyKey,
    })

    const result = unwrapHostedToolResult(payload)
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: options.envelopeCommand ?? 'memory.write',
        toolId: 'agentspace.memory-item.add-memory-item',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result,
        diagnostics: compactPayload({ memoryQuality, warnings: toStringArray(options.diagnosticWarning) }),
      }), null, 2))
      return
    }

    logSuccess('Memory item written.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    emitMemoryCommandError({
      options,
      command: options.envelopeCommand ?? 'memory.write',
      toolId: 'agentspace.memory-item.add-memory-item',
      resolvedContext,
      input: undefined,
      error,
    })
  }
}

export async function runMemoryDelete(options: MemoryDeleteOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext
  let apiState: CliApiClientState | null
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    if (options.apply !== true || options.confirm !== true) {
      throw new Error('This command deletes durable memory. Retry with --apply --confirm.')
    }
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: false })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)

    const input = { id }
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: 'agentspace.memory-item.remove-memory-item',
      input,
      preview: options.preview,
      apply: options.apply,
      confirm: options.confirm,
      idempotencyKey: options.idempotencyKey,
    })

    const result = unwrapHostedToolResult(payload)
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'memory.delete',
        toolId: 'agentspace.memory-item.remove-memory-item',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result,
      }), null, 2))
      return
    }

    logSuccess('Memory item deleted.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runMemoryPrune(options: MemoryPruneOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext | undefined
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)

    const durability = normalizeMemoryDurability(options.durability) ?? 'short'
    if (durability !== 'short') {
      throw new Error('Memory prune only supports short memory. Delete durable/sticky memory explicitly with mem delete --id.')
    }
    const olderThanDays = toNonNegativeInteger(options.olderThanDays, 'olderThanDays') ?? 30
    const keepLatest = toNonNegativeInteger(options.keepLatest, 'keepLatest') ?? 20
    const maxDelete = toNonNegativeInteger(options.maxDelete, 'maxDelete')
    const dryRun = options.apply !== true || options.preview === true
    if (options.apply === true && options.preview !== true && options.confirm !== true) {
      throw new Error('This command deletes hosted memory items. Retry with --apply --confirm (or use --preview).')
    }

    // Server-first client-orchestration: read candidates from hosted
    // list-memory-items, apply the retention policy in-process, then delete via
    // hosted remove-memory-item. No local file is read or written.
    const rows = await listHostedMemoryRows(apiState, options, resolvedContext, {
      durability,
      kind: normalizeNonEmpty(options.kind),
      subject: options.subject,
      subjectType: options.subjectType,
      subjectId: options.subjectId,
      id: options.id,
      taskId: options.taskId,
      sprintId: options.sprintId,
      phaseId: options.phaseId,
      utaskId: options.utaskId,
      issueId: options.issueId,
      feedbackId: options.feedbackId,
    })
    const matched = rows
      .map((row) => ({ row, timestamp: hostedRowTimestamp(row) }))
      .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
    const retained = new Set(matched.slice(0, keepLatest).map(({ row }) => hostedRowId(row)).filter(Boolean))
    const cutoffMs = Date.now() - olderThanDays * 86_400_000
    const stale = matched.filter(({ row, timestamp }) => {
      const id = hostedRowId(row)
      if (!id || retained.has(id)) return false
      return Boolean(timestamp && timestamp <= cutoffMs)
    })
    const selected = (maxDelete === undefined ? stale : stale.slice(0, maxDelete)).filter(({ row }) => Boolean(hostedRowId(row)))

    const deleted: string[] = []
    if (!dryRun) {
      for (const { row } of selected) {
        const id = hostedRowId(row)
        if (!id) continue
        await invokeHostedToolWithApiState(apiState, {
          ...buildGatewayOptions(options, resolvedContext),
          tenantId: options.tenantId,
          locale: options.locale,
          fallbackLocale: options.fallbackLocale,
          timeoutMs: options.timeoutMs,
          apiBaseUrl: options.apiBaseUrl,
          accessToken: options.accessToken,
          refreshToken: options.refreshToken,
          toolId: 'agentspace.memory-item.remove-memory-item',
          input: { id },
          apply: true,
          confirm: true,
        })
        deleted.push(id)
      }
    }

    const result = compactPayload({
      dryRun,
      policy: compactPayload({ durability, olderThanDays, keepLatest, maxDelete }),
      matchedCount: matched.length,
      staleCount: stale.length,
      candidateCount: selected.length,
      prunedCount: dryRun ? 0 : deleted.length,
      prunedIds: deleted,
      candidates: selected.map(({ row }) => compactPayload({ id: hostedRowId(row), kind: normalizeNonEmpty(row.kind), durability: normalizeNonEmpty(row.durability) })),
      note: 'Hosted memory prune is server-first: candidates are read from list-memory-items and deleted via remove-memory-item. No local memory files are read or written.',
    })
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'memory.prune',
        toolId: 'agentspace.memory-item.remove-memory-item',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input: compactPayload({ policy: result.policy, dryRun }),
        result,
      }), null, 2))
      return
    }
    logSuccess(dryRun ? 'Hosted memory prune preview completed.' : 'Hosted memory prune completed.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    emitMemoryCommandError({
      options,
      command: 'memory.prune',
      toolId: 'agentspace.memory-item.remove-memory-item',
      resolvedContext,
      error,
    })
  }
}

export async function runMemoryCompact(options: MemoryCompactOptions = {}): Promise<void> {
  let resolvedContext: ResolvedMemoryContext | undefined
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveMemoryContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)

    if (options.apply === true && options.pruneSource === true && options.confirm !== true) {
      throw new Error('Compaction source pruning deletes hosted memory items. Retry with --apply --confirm.')
    }
    if (options.pruneSource === true && options.writeSummary !== true) {
      throw new Error('Use --write-summary with --prune-source so source deletion has a compacted destination.')
    }
    const durability = normalizeMemoryDurability(options.durability) ?? 'short'
    if (durability !== 'short') {
      throw new Error('Memory compact only compacts short source memory. Durable/sticky memory is long-term truth and is never a default compact source.')
    }
    const olderThanDays = toNonNegativeInteger(options.olderThanDays, 'olderThanDays') ?? 30
    const keepLatest = toNonNegativeInteger(options.keepLatest, 'keepLatest') ?? 20
    const maxItems = toNonNegativeInteger(options.maxItems, 'maxItems') ?? 20
    const targetDurability = normalizeMemoryDurability(options.targetDurability) ?? 'durable'
    if (targetDurability === 'sticky') {
      throw new Error('Compaction writes durable or short summary memory only. Promote to sticky rule explicitly after review.')
    }
    const targetKind = normalizeHostedCompatibleMemoryKind(options.targetKind) ?? 'checkpoint'

    // Server-first client-orchestration: read source memory from hosted
    // list-memory-items, build a deterministic compact summary, write it via the
    // hosted add-memory-item op, then optionally delete sources via
    // remove-memory-item. No local memory file is read or written.
    const rows = await listHostedMemoryRows(apiState, options, resolvedContext, {
      durability,
      kind: normalizeNonEmpty(options.kind),
      subject: options.subject,
      subjectType: options.subjectType,
      subjectId: options.subjectId,
      id: options.id,
      taskId: options.taskId,
      sprintId: options.sprintId,
      phaseId: options.phaseId,
      utaskId: options.utaskId,
      issueId: options.issueId,
      feedbackId: options.feedbackId,
    })
    const matched = rows
      .map((row) => ({ row, timestamp: hostedRowTimestamp(row) }))
      .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
    const retained = new Set(matched.slice(0, keepLatest).map(({ row }) => hostedRowId(row)).filter(Boolean))
    const cutoffMs = Date.now() - olderThanDays * 86_400_000
    const sourceRows = matched
      .filter(({ row, timestamp }) => {
        const id = hostedRowId(row)
        if (!id || retained.has(id)) return false
        return Boolean(timestamp && timestamp <= cutoffMs)
      })
      .slice(0, maxItems)
      .map(({ row }) => row)

    const draftSummary = normalizeNonEmpty(options.content) ?? buildHostedCompactDraftSummary(sourceRows, resolvedContext)
    const sourceRefs = sourceRows.map((row) => compactPayload({
      kind: 'memory',
      memoryId: hostedRowId(row),
      sourceKind: normalizeNonEmpty(row.kind),
      durability: normalizeNonEmpty(row.durability),
    }))

    let writtenSummary: unknown
    let summaryId: string | undefined
    if (options.writeSummary === true) {
      if (options.apply !== true) {
        throw new Error('Retry with --apply because --write-summary writes a hosted memory item.')
      }
      const subjectConfig = normalizeMemorySubject(options.subject) ?? MEMORY_SUBJECTS.project
      const linked = buildLinkedIds(options)
      const subjectId = buildSubjectId(subjectConfig, options, resolvedContext)
      const subjectDefaults = applySubjectDefaults(subjectConfig, subjectId, linked)
      const summaryMeta = compactPayload({
        subjectType: normalizeNonEmpty(options.subjectType) ?? subjectDefaults.subjectType,
        subjectId,
        subjectTitle: buildSubjectLabel(options) ?? 'Compacted memory summary',
        projectId: resolvedContext.projectId,
        sourceRefs,
        purpose: uniqueStrings([...toStringArray(options.purpose), 'compaction']),
        areas: toStringArray(options.area),
        status: uniqueStrings([...toStringArray(options.status), 'active']),
      })
      const summaryInput = {
        data: compactPayload({
          scopeId: resolvedContext.scopeId,
          kind: targetKind,
          durability: targetDurability,
          content: draftSummary,
          tags: uniqueStrings([
            'phase:compaction',
            'memory:compact',
            resolvedContext.projectId ? `project:${resolvedContext.projectId}` : undefined,
            ...buildClassificationTags({ purpose: ['compaction'], area: options.area, status: options.status }),
          ]),
          sourceType: normalizeNonEmpty(options.subjectType) ?? subjectDefaults.sourceType,
          sourceId: subjectId,
          meta: Object.keys(summaryMeta).length > 0 ? summaryMeta : undefined,
        }),
      }
      const summaryPayload = await invokeHostedToolWithApiState(apiState, {
        ...buildGatewayOptions(options, resolvedContext),
        tenantId: options.tenantId,
        locale: options.locale,
        fallbackLocale: options.fallbackLocale,
        timeoutMs: options.timeoutMs,
        apiBaseUrl: options.apiBaseUrl,
        accessToken: options.accessToken,
        refreshToken: options.refreshToken,
        toolId: 'agentspace.memory-item.add-memory-item',
        input: summaryInput,
        apply: true,
      })
      writtenSummary = unwrapHostedToolResult(summaryPayload)
      summaryId = hostedRowId(unwrapResultData<Record<string, unknown>>(writtenSummary) ?? {})
        ?? hostedRowId(isRecord(writtenSummary) ? writtenSummary : {})

      if (options.pruneSource === true) {
        for (const row of sourceRows) {
          const id = hostedRowId(row)
          if (!id) continue
          await invokeHostedToolWithApiState(apiState, {
            ...buildGatewayOptions(options, resolvedContext),
            tenantId: options.tenantId,
            locale: options.locale,
            fallbackLocale: options.fallbackLocale,
            timeoutMs: options.timeoutMs,
            apiBaseUrl: options.apiBaseUrl,
            accessToken: options.accessToken,
            refreshToken: options.refreshToken,
            toolId: 'agentspace.memory-item.remove-memory-item',
            input: { id },
            apply: true,
            confirm: true,
          })
        }
      }
    }

    const result = compactPayload({
      readStrategy: 'hosted-deterministic-compact',
      writeSummary: options.writeSummary === true,
      pruneSource: options.pruneSource === true,
      sourceCount: sourceRows.length,
      target: compactPayload({ kind: targetKind, durability: targetDurability }),
      draftSummary,
      sourceRefs,
      writtenSummary,
      summaryId,
      note: 'Hosted memory compact is server-first: sources come from list-memory-items, the summary is written via add-memory-item, and sources are deleted via remove-memory-item. No local memory files are read or written.',
    })
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'memory.compact',
        toolId: 'agentspace.memory-item.add-memory-item',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input: compactPayload({ olderThanDays, keepLatest, maxItems, writeSummary: options.writeSummary === true }),
        result,
      }), null, 2))
      return
    }
    logSuccess(options.writeSummary === true ? 'Hosted memory compaction summary written.' : 'Hosted memory compact pack built.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    emitMemoryCommandError({
      options,
      command: 'memory.compact',
      toolId: 'agentspace.memory-item.add-memory-item',
      resolvedContext,
      error,
    })
  }
}

function applyMemoryContextOptions<T extends Command>(cmd: T): T {
  applyCommonOptions(cmd, { withProject: false })
  cmd.option('--hosted', 'Deprecated/no-op: memory is now server-first by default (hosted Agentspace memory-item ops). Kept for script compatibility.')
  cmd.option('--scope-id <id>', 'Canonical owner scope override')
  cmd.option('--project-id <id>', 'Project id used to resolve scope and memory ownership')
  cmd.option('--project-name <name>', 'Project name override for repo-aware scope resolution')
  cmd.option('--tenant-id <id>', 'Tenant id header (x-tenant-id)')
  cmd.option('--locale <locale>', 'Locale header (x-locale)')
  cmd.option('--fallback-locale <locale>', 'Fallback locale header (x-fallback-locale)')
  return cmd
}

function applyWriteOptions<T extends Command>(cmd: T): T {
  cmd.option('--preview', 'Return a validated preflight summary without executing the tool')
  cmd.option('--apply', 'Explicitly allow guarded write operations')
  cmd.option('--confirm', 'Explicitly confirm destructive operations')
  cmd.option('--idempotency-key <key>', 'Optional guarded-write idempotency key')
  return cmd
}

function applyMemoryClassificationOptions<T extends Command>(cmd: T): T {
  cmd.option('--purpose <value>', 'Repeatable memory purpose tag (resume, howto, architecture, pattern, carry-forward, etc.)', collectRepeatedOption, [])
  cmd.option('--area <value>', 'Repeatable workstream/area tag (adk, electron, runner, docs, etc.)', collectRepeatedOption, [])
  cmd.option('--status <value>', 'Repeatable memory lifecycle tag (active, stale, archived, draft, etc.)', collectRepeatedOption, [])
  return cmd
}

function applyMemoryReviewOptions<T extends Command>(cmd: T): T {
  cmd.option('--review-after-days <n>', 'Review/refresh reminder horizon in days', (value) => Number.parseInt(String(value), 10))
  return cmd
}

export function makeMemoryCommand(): Command {
  const cmd = new Command('mem')
    .alias('memory')
    .description('Agentspace server-first memory commands (hosted memory-item ops are the source of truth; the local .aops memory tree is never written)')
  const docCmd = cmd.command('doc').description('Advanced: read Docman through recommended memory refs')

  applyMemoryContextOptions(
    cmd.command('get')
      .description('Get a memory item by id')
      .requiredOption('--id <id>', 'Memory item id')
      .action(async (options: MemoryGetOptions) => {
        await runMemoryGet(options)
      }),
  )

  applyMemoryContextOptions(
    applyMemoryClassificationOptions(
      cmd.command('list')
      .description('List memory items within the current owner scope')
      .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
      .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
      .option('--kind <kind>', 'Filter by memory kind')
      .option('--durability <durability>', 'Filter by durability: short, durable, sticky')
      .option('--subject-type <type>', 'Subject type, e.g. projectman.sprint')
      .option('--subject-id <id>', 'Subject id')
      .option('--source-type <type>', 'Exact source type filter')
      .option('--source-id <id>', 'Exact source id filter')
      .option('--task-id <id>', 'Linked kanban task id')
      .option('--sprint-id <id>', 'Linked sprint id')
      .option('--phase-id <id>', 'Linked phase id')
      .option('--utask-id <id>', 'Linked utask id')
      .option('--issue-id <id>', 'Linked issue id')
      .option('--feedback-id <id>', 'Linked feedback id')
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .action(async (options: MemoryListOptions) => {
        await runMemoryList(options)
      }),
    ),
  )

  applyMemoryContextOptions(
    applyMemoryClassificationOptions(
      cmd.command('search')
      .description('Recommended: search memory with subject-aware retrieval ranking')
      .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
      .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
      .option('--label <text>', 'Optional subject label/title')
      .option('--query <text>', 'Search query')
      .option('--q <text>', 'Alias for --query')
      .option('--goal <text>', 'Goal hint')
      .option('--runtime-profile <profile>', 'Runtime profile hint')
      .option('--workflow-id <id>', 'Workflow id hint')
      .option('--step-id <id>', 'Workflow step id hint')
      .option('--subject-type <type>', 'Subject type, e.g. projectman.sprint')
      .option('--subject-id <id>', 'Subject id')
      .option('--subject-label <label>', 'Subject label')
      .option('--task-id <id>', 'Linked kanban task id')
      .option('--sprint-id <id>', 'Linked sprint id')
      .option('--phase-id <id>', 'Linked phase id')
      .option('--utask-id <id>', 'Linked utask id')
      .option('--issue-id <id>', 'Linked issue id')
      .option('--feedback-id <id>', 'Linked feedback id')
      .option('--tag <value>', 'Repeatable retrieval tag', collectRepeatedOption, [])
      .option('--source-type <value>', 'Repeatable retrieval source type', collectRepeatedOption, [])
      .option('--source-id <value>', 'Repeatable retrieval source id', collectRepeatedOption, [])
      .option('--candidate-limit <count>', 'Candidate fetch limit', (value) => Number.parseInt(String(value), 10))
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .option('--strict-classification', 'Apply purpose/area/status as post-search filters instead of retrieval hints')
      .action(async (options: MemorySearchOptions) => {
        await runMemorySearch(options)
      }),
    ),
  )

  applyMemoryContextOptions(
    applyMemoryClassificationOptions(
      cmd.command('synopsis')
      .description('Build a deterministic project/subject synopsis from hosted memory')
      .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
      .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
      .option('--label <text>', 'Optional subject label/title')
      .option('--query <text>', 'Synopsis query')
      .option('--q <text>', 'Alias for --query')
      .option('--goal <text>', 'Goal hint')
      .option('--runtime-profile <profile>', 'Runtime profile hint')
      .option('--workflow-id <id>', 'Workflow id hint')
      .option('--step-id <id>', 'Workflow step id hint')
      .option('--subject-type <type>', 'Subject type, e.g. projectman.sprint')
      .option('--subject-id <id>', 'Subject id')
      .option('--subject-label <label>', 'Subject label')
      .option('--task-id <id>', 'Linked kanban task id')
      .option('--sprint-id <id>', 'Linked sprint id')
      .option('--phase-id <id>', 'Linked phase id')
      .option('--utask-id <id>', 'Linked utask id')
      .option('--issue-id <id>', 'Linked issue id')
      .option('--feedback-id <id>', 'Linked feedback id')
      .option('--tag <value>', 'Repeatable retrieval tag', collectRepeatedOption, [])
      .option('--source-type <value>', 'Repeatable retrieval source type', collectRepeatedOption, [])
      .option('--source-id <value>', 'Repeatable retrieval source id', collectRepeatedOption, [])
      .option('--candidate-limit <count>', 'Candidate fetch limit', (value) => Number.parseInt(String(value), 10))
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .action(async (options: MemorySynopsisOptions) => {
        await runMemorySynopsis(options)
      }),
    ),
  )

  applyMemoryContextOptions(
    applyMemoryClassificationOptions(
      cmd.command('brief')
      .description('Build a read-only bootstrap brief from synopsis, resume, sticky guidance, and refs')
      .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
      .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
      .option('--label <text>', 'Optional subject label/title')
      .option('--query <text>', 'Brief query')
      .option('--q <text>', 'Alias for --query')
      .option('--goal <text>', 'Goal hint')
      .option('--runtime-profile <profile>', 'Runtime profile hint')
      .option('--workflow-id <id>', 'Workflow id hint')
      .option('--step-id <id>', 'Workflow step id hint')
      .option('--subject-type <type>', 'Subject type, e.g. projectman.sprint')
      .option('--subject-id <id>', 'Subject id')
      .option('--subject-label <label>', 'Subject label')
      .option('--task-id <id>', 'Linked kanban task id')
      .option('--sprint-id <id>', 'Linked sprint id')
      .option('--phase-id <id>', 'Linked phase id')
      .option('--utask-id <id>', 'Linked utask id')
      .option('--issue-id <id>', 'Linked issue id')
      .option('--feedback-id <id>', 'Linked feedback id')
      .option('--tag <value>', 'Repeatable retrieval tag', collectRepeatedOption, [])
      .option('--source-type <value>', 'Repeatable retrieval source type', collectRepeatedOption, [])
      .option('--source-id <value>', 'Repeatable retrieval source id', collectRepeatedOption, [])
      .option('--candidate-limit <count>', 'Candidate fetch limit', (value) => Number.parseInt(String(value), 10))
      .option('--limit <count>', 'Brief item/ref limit', (value) => Number.parseInt(String(value), 10))
      .option('--depth <mode>', 'Brief depth: light or deep', 'light')
      .addHelpText(
        'after',
        '\nWhen to call:\n' +
          '  Use at session start/resume before implementation. It is a read-only startup pack; it should not replace PM state or write memory.\n',
      )
      .action(async (options: MemoryBriefOptions) => {
        await runMemoryBrief(options)
      }),
    ),
  )

  applyMemoryContextOptions(
    applyMemoryClassificationOptions(
      cmd.command('resume')
      .description('Recommended: build a curated resume pack from hosted memory')
      .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
      .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
      .option('--label <text>', 'Optional subject label/title')
      .option('--query <text>', 'Resume query')
      .option('--q <text>', 'Alias for --query')
      .option('--goal <text>', 'Goal hint')
      .option('--runtime-profile <profile>', 'Runtime profile hint')
      .option('--workflow-id <id>', 'Workflow id hint')
      .option('--step-id <id>', 'Workflow step id hint')
      .option('--subject-type <type>', 'Subject type, e.g. projectman.sprint')
      .option('--subject-id <id>', 'Subject id')
      .option('--subject-label <label>', 'Subject label')
      .option('--task-id <id>', 'Linked kanban task id')
      .option('--sprint-id <id>', 'Linked sprint id')
      .option('--phase-id <id>', 'Linked phase id')
      .option('--utask-id <id>', 'Linked utask id')
      .option('--issue-id <id>', 'Linked issue id')
      .option('--feedback-id <id>', 'Linked feedback id')
      .option('--tag <value>', 'Repeatable retrieval tag', collectRepeatedOption, [])
      .option('--source-type <value>', 'Repeatable retrieval source type', collectRepeatedOption, [])
      .option('--source-id <value>', 'Repeatable retrieval source id', collectRepeatedOption, [])
      .option('--candidate-limit <count>', 'Candidate fetch limit', (value) => Number.parseInt(String(value), 10))
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .option('--depth <mode>', 'Resume pack depth: light or deep', 'light')
      .action(async (options: MemoryResumeOptions) => {
        await runMemoryResume(options)
      }),
    ),
  )

  applyMemoryContextOptions(
    applyMemoryClassificationOptions(
      docCmd.command('refs')
      .description('List Docman-capable recommended refs from a curated resume pack')
      .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
      .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
      .option('--label <text>', 'Optional subject label/title')
      .option('--query <text>', 'Resume query')
      .option('--goal <text>', 'Goal hint')
      .option('--runtime-profile <profile>', 'Runtime profile hint')
      .option('--workflow-id <id>', 'Workflow id hint')
      .option('--step-id <id>', 'Workflow step id hint')
      .option('--subject-type <type>', 'Subject type, e.g. projectman.sprint')
      .option('--subject-id <id>', 'Subject id')
      .option('--subject-label <label>', 'Subject label')
      .option('--task-id <id>', 'Linked kanban task id')
      .option('--sprint-id <id>', 'Linked sprint id')
      .option('--phase-id <id>', 'Linked phase id')
      .option('--utask-id <id>', 'Linked utask id')
      .option('--issue-id <id>', 'Linked issue id')
      .option('--feedback-id <id>', 'Linked feedback id')
      .option('--tag <value>', 'Repeatable retrieval tag', collectRepeatedOption, [])
      .option('--source-type <value>', 'Repeatable retrieval source type', collectRepeatedOption, [])
      .option('--source-id <value>', 'Repeatable retrieval source id', collectRepeatedOption, [])
      .option('--candidate-limit <count>', 'Candidate fetch limit', (value) => Number.parseInt(String(value), 10))
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .option('--depth <mode>', 'Resume pack depth: light or deep', 'light')
      .action(async (options: MemoryDocRefsOptions) => {
        await runMemoryDocRefs(options)
      }),
    ),
  )

  applyMemoryContextOptions(
    applyMemoryClassificationOptions(
      docCmd.command('answer')
      .description('Run Docman answer-pack against a recommended memory ref')
      .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
      .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
      .option('--label <text>', 'Optional subject label/title')
      .option('--query <text>', 'Resume query')
      .option('--goal <text>', 'Goal hint')
      .option('--runtime-profile <profile>', 'Runtime profile hint')
      .option('--workflow-id <id>', 'Workflow id hint')
      .option('--step-id <id>', 'Workflow step id hint')
      .option('--subject-type <type>', 'Subject type')
      .option('--subject-id <id>', 'Subject id')
      .option('--subject-label <label>', 'Subject label')
      .option('--task-id <id>', 'Linked kanban task id')
      .option('--sprint-id <id>', 'Linked sprint id')
      .option('--phase-id <id>', 'Linked phase id')
      .option('--utask-id <id>', 'Linked utask id')
      .option('--issue-id <id>', 'Linked issue id')
      .option('--feedback-id <id>', 'Linked feedback id')
      .option('--tag <value>', 'Repeatable retrieval tag', collectRepeatedOption, [])
      .option('--source-type <value>', 'Repeatable retrieval source type', collectRepeatedOption, [])
      .option('--source-id <value>', 'Repeatable retrieval source id', collectRepeatedOption, [])
      .option('--candidate-limit <count>', 'Candidate fetch limit', (value) => Number.parseInt(String(value), 10))
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .option('--depth <mode>', 'Resume pack depth: light or deep', 'light')
      .option('--ref-index <n>', 'Recommended ref index (1-based)', (value) => Number.parseInt(String(value), 10))
      .requiredOption('--q <text>', 'Question passed to Docman answer-pack')
      .option('--document-version-id <id>', 'Explicit document version id override')
      .option('--ensure <mode>', 'Ensure retrieval rows first: none, index, summary', 'none')
      .option('--retrieval-strategy <mode>', 'Retrieval strategy: lexical, hybrid, semantic')
      .action(async (options: MemoryDocAnswerOptions) => {
        await runMemoryDocAnswer(options)
      }),
    ),
  )

  applyMemoryContextOptions(
    applyMemoryClassificationOptions(
      docCmd.command('source')
      .description('Fetch exact Docman source from a recommended memory ref')
      .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
      .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
      .option('--label <text>', 'Optional subject label/title')
      .option('--query <text>', 'Resume query')
      .option('--goal <text>', 'Goal hint')
      .option('--runtime-profile <profile>', 'Runtime profile hint')
      .option('--workflow-id <id>', 'Workflow id hint')
      .option('--step-id <id>', 'Workflow step id hint')
      .option('--subject-type <type>', 'Subject type')
      .option('--subject-id <id>', 'Subject id')
      .option('--subject-label <label>', 'Subject label')
      .option('--task-id <id>', 'Linked kanban task id')
      .option('--sprint-id <id>', 'Linked sprint id')
      .option('--phase-id <id>', 'Linked phase id')
      .option('--utask-id <id>', 'Linked utask id')
      .option('--issue-id <id>', 'Linked issue id')
      .option('--feedback-id <id>', 'Linked feedback id')
      .option('--tag <value>', 'Repeatable retrieval tag', collectRepeatedOption, [])
      .option('--source-type <value>', 'Repeatable retrieval source type', collectRepeatedOption, [])
      .option('--source-id <value>', 'Repeatable retrieval source id', collectRepeatedOption, [])
      .option('--candidate-limit <count>', 'Candidate fetch limit', (value) => Number.parseInt(String(value), 10))
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .option('--depth <mode>', 'Resume pack depth: light or deep', 'light')
      .option('--ref-index <n>', 'Recommended ref index (1-based)', (value) => Number.parseInt(String(value), 10))
      .option('--document-version-id <id>', 'Explicit document version id override')
      .option('--section-id <id>', 'Explicit section id override')
      .option('--page-version-id <id>', 'Explicit page version id override')
      .option('--page-number <n>', 'Explicit page number override', (value) => Number.parseInt(String(value), 10))
      .action(async (options: MemoryDocSourceOptions) => {
        await runMemoryDocSource(options)
      }),
    ),
  )

  applyMemoryContextOptions(
    applyMemoryClassificationOptions(
      docCmd.command('publish')
      .description('Materialize Docman output from a recommended memory ref')
      .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
      .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
      .option('--label <text>', 'Optional subject label/title')
      .option('--query <text>', 'Resume query')
      .option('--goal <text>', 'Goal hint')
      .option('--runtime-profile <profile>', 'Runtime profile hint')
      .option('--workflow-id <id>', 'Workflow id hint')
      .option('--step-id <id>', 'Workflow step id hint')
      .option('--subject-type <type>', 'Subject type')
      .option('--subject-id <id>', 'Subject id')
      .option('--subject-label <label>', 'Subject label')
      .option('--task-id <id>', 'Linked kanban task id')
      .option('--sprint-id <id>', 'Linked sprint id')
      .option('--phase-id <id>', 'Linked phase id')
      .option('--utask-id <id>', 'Linked utask id')
      .option('--issue-id <id>', 'Linked issue id')
      .option('--feedback-id <id>', 'Linked feedback id')
      .option('--tag <value>', 'Repeatable retrieval tag', collectRepeatedOption, [])
      .option('--source-type <value>', 'Repeatable retrieval source type', collectRepeatedOption, [])
      .option('--source-id <value>', 'Repeatable retrieval source id', collectRepeatedOption, [])
      .option('--candidate-limit <count>', 'Candidate fetch limit', (value) => Number.parseInt(String(value), 10))
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .option('--depth <mode>', 'Resume pack depth: light or deep', 'light')
      .option('--ref-index <n>', 'Recommended ref index (1-based)', (value) => Number.parseInt(String(value), 10))
      .option('--document-version-id <id>', 'Explicit document version id override')
      .option('--section-id <id>', 'Explicit section id override')
      .option('--page-version-id <id>', 'Explicit page version id override')
      .option('--page-number <n>', 'Explicit page number override', (value) => Number.parseInt(String(value), 10))
      .option('--target <mode>', 'Materialize target: markdown or html', 'markdown')
      .action(async (options: MemoryDocPublishOptions) => {
        await runMemoryDocPublish(options)
      }),
    ),
  )

  applyMemoryContextOptions(
    applyWriteOptions(
      applyMemoryReviewOptions(applyMemoryClassificationOptions(
        cmd.command('checkpoint')
        .description('Write a short rolling checkpoint; defaults to project resume memory')
        .requiredOption('--content <textOrFile>', 'Checkpoint content text, or @file to read content from disk')
        .option('--as <kind>', 'Checkpoint flavor: status, decision, blocker, milestone', 'status')
        .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
        .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
        .option('--label <text>', 'Optional subject label/title')
        .option('--durability <durability>', 'Memory durability; defaults to short')
        .option('--importance <value>', 'Importance score (0-100)', (value) => Number.parseInt(String(value), 10))
        .option('--tag <value>', 'Repeatable tag', collectRepeatedOption, [])
        .option('--task-id <id>', 'Linked kanban task id')
        .option('--kanban-task-id <id>', 'Linked kanban task id')
        .option('--sprint-id <id>', 'Linked sprint id')
        .option('--phase-id <id>', 'Linked phase id')
        .option('--utask-id <id>', 'Linked utask id')
        .option('--microtask-id <id>', 'Linked microtask id')
        .option('--issue-id <id>', 'Linked issue id')
        .option('--feedback-id <id>', 'Linked feedback id')
        .option('--next-action <text>', 'Recommended next action')
        .option('--next-read-ref <value>', 'Repeatable next read ref (string, JSON object/array, or @file.json)', collectRepeatedOption, [])
        .option('--source-ref <value>', 'Repeatable source ref (string, JSON object/array, or @file.json)', collectRepeatedOption, [])
        .option('--validation-state <text>', 'Validation state summary')
        .option('--supersede <memoryId>', 'Explicitly supersede an older checkpoint memory id'),
      )).addHelpText(
        'after',
        '\nWhen to call:\n' +
          '  Use after a meaningful milestone, decision, blocker, or handoff point. Do not write one for every chat line or tiny edit.\n' +
          '  Default checkpoint is a short resume/carry-forward record; --as decision|blocker|milestone changes the checkpoint shape.\n' +
          MEMORY_EVIDENCE_HELP_TEXT + '\n',
      ),
    ).action(async (options: MemoryCheckpointOptions) => {
      await runMemoryCheckpoint(options)
    }),
  )

  applyMemoryContextOptions(
    applyWriteOptions(
      applyMemoryReviewOptions(applyMemoryClassificationOptions(
        cmd.command('summary')
        .description('Write a short session summary; durable closeout requires explicit --closeout --durability durable --confirm')
        .requiredOption('--content <textOrFile>', 'Summary content text, or @file to read content from disk')
        .option('--closeout', 'Mark this summary as a closeout summary')
        .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
        .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
        .option('--label <text>', 'Optional subject label/title')
        .option('--durability <durability>', 'Memory durability; defaults to short')
        .option('--importance <value>', 'Importance score (0-100)', (value) => Number.parseInt(String(value), 10))
        .option('--tag <value>', 'Repeatable tag', collectRepeatedOption, [])
        .option('--task-id <id>', 'Linked kanban task id')
        .option('--kanban-task-id <id>', 'Linked kanban task id')
        .option('--sprint-id <id>', 'Linked sprint id')
        .option('--phase-id <id>', 'Linked phase id')
        .option('--utask-id <id>', 'Linked utask id')
        .option('--microtask-id <id>', 'Linked microtask id')
        .option('--issue-id <id>', 'Linked issue id')
        .option('--feedback-id <id>', 'Linked feedback id')
        .option('--next-action <text>', 'Recommended next action')
        .option('--next-read-ref <value>', 'Repeatable next read ref (string, JSON object/array, or @file.json)', collectRepeatedOption, [])
        .option('--source-ref <value>', 'Repeatable source ref (string, JSON object/array, or @file.json)', collectRepeatedOption, [])
        .option('--validation-state <text>', 'Validation state summary'),
      )).addHelpText(
        'after',
        '\nWhen to call:\n' +
          '  Use at session end or explicit operator closeout/summary points. For ordinary continuation, prefer mem checkpoint.\n' +
          '  Durable closeout requires --closeout --durability durable --confirm; otherwise summaries stay short.\n' +
          MEMORY_EVIDENCE_HELP_TEXT + '\n',
      ),
    ).action(async (options: MemorySummaryOptions) => {
      await runMemorySummary(options)
    }),
  )

  applyMemoryContextOptions(
    applyWriteOptions(
      applyMemoryReviewOptions(applyMemoryClassificationOptions(
        cmd.command('update')
        .description('Advanced: update an existing memory item')
        .requiredOption('--id <id>', 'Memory item id')
        .option('--mode <mode>', 'Memory mode defaults: kickoff, resume, decision, blocker, closeout, rule')
        .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
        .option('--kind <kind>', 'Memory kind patch')
        .option('--durability <durability>', 'Memory durability: short, durable, sticky')
        .option('--content <textOrFile>', 'Updated memory content text, or @file to read content from disk')
        .option('--importance <value>', 'Importance score (0-100)', (value) => Number.parseInt(String(value), 10))
        .option('--tag <value>', 'Repeatable tag', collectRepeatedOption, [])
        .option('--subject-type <type>', 'Subject type')
        .option('--subject-id <id>', 'Subject id')
        .option('--subject-title <text>', 'Subject title')
        .option('--task-id <id>', 'Linked kanban task id')
        .option('--kanban-task-id <id>', 'Linked kanban task id')
        .option('--sprint-id <id>', 'Linked sprint id')
        .option('--phase-id <id>', 'Linked phase id')
        .option('--utask-id <id>', 'Linked utask id')
        .option('--microtask-id <id>', 'Linked microtask id')
        .option('--issue-id <id>', 'Linked issue id')
        .option('--feedback-id <id>', 'Linked feedback id')
        .option('--next-action <text>', 'Recommended next action')
        .option('--next-read-ref <value>', 'Repeatable next read ref (string, JSON object/array, or @file.json)', collectRepeatedOption, [])
        .option('--source-ref <value>', 'Repeatable source ref (string, JSON object/array, or @file.json)', collectRepeatedOption, [])
        .option('--validation-state <text>', 'Validation state summary')
        .option('--sticky-rank <n>', 'Sticky ordering rank (higher first)', (value) => Number.parseInt(String(value), 10))
        .option('--supersede <memoryId>', 'Supersede an older sticky memory id')
        .option('--pattern-name <text>', 'Reusable rule/pattern name')
        .option('--pattern-when <text>', 'When this rule applies')
        .option('--pattern-why <text>', 'Why this rule matters')
        .option('--pattern-evidence <text>', 'Pattern evidence or notes'),
      )).addHelpText('after', MEMORY_EVIDENCE_HELP_TEXT),
    ).action(async (options: MemoryUpdateOptions) => {
      await runMemoryUpdate(options)
    }),
  )

  applyMemoryContextOptions(
    applyWriteOptions(
      applyMemoryReviewOptions(applyMemoryClassificationOptions(
        cmd.command('write')
        .description('Advanced: write an Agentspace memory item with standardized metadata')
        .option('--mode <mode>', 'Memory mode: kickoff, resume, decision, blocker, closeout, rule')
        .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
        .option('--id <id>', 'Subject id (optional for project; defaults to current project id)')
        .option('--label <text>', 'Optional subject label/title')
        .option('--durability <durability>', 'Memory durability: short, durable, sticky')
        .option('--sticky-rank <n>', 'Sticky ordering rank (higher first)', (value) => Number.parseInt(String(value), 10))
        .option('--supersede <memoryId>', 'Supersede an older sticky memory id')
        .option('--kind <kind>', 'Memory kind')
        .requiredOption('--content <textOrFile>', 'Memory content text, or @file to read content from disk')
        .option('--importance <value>', 'Importance score (0-100)', (value) => Number.parseInt(String(value), 10))
        .option('--tag <value>', 'Repeatable tag', collectRepeatedOption, [])
        .option('--source-type <type>', 'Source type')
        .option('--source-id <id>', 'Source id')
        .option('--subject-type <type>', 'Subject type')
        .option('--subject-id <id>', 'Subject id')
        .option('--subject-title <text>', 'Subject title')
        .option('--task-id <id>', 'Linked kanban task id')
        .option('--kanban-task-id <id>', 'Linked kanban task id')
        .option('--sprint-id <id>', 'Linked sprint id')
        .option('--phase-id <id>', 'Linked phase id')
        .option('--utask-id <id>', 'Linked utask id')
        .option('--microtask-id <id>', 'Linked microtask id')
        .option('--issue-id <id>', 'Linked issue id')
        .option('--feedback-id <id>', 'Linked feedback id')
        .option('--next-action <text>', 'Recommended next action')
        .option('--next-read-ref <value>', 'Repeatable next read ref (string, JSON object/array, or @file.json)', collectRepeatedOption, [])
        .option('--source-ref <value>', 'Repeatable source ref (string, JSON object/array, or @file.json)', collectRepeatedOption, [])
        .option('--validation-state <text>', 'Validation state summary')
        .option('--pattern-name <text>', 'Reusable rule/pattern name')
        .option('--pattern-when <text>', 'When this rule applies')
        .option('--pattern-why <text>', 'Why this rule matters')
        .option('--pattern-evidence <text>', 'Pattern evidence or notes'),
      )).addHelpText(
        'after',
        '\nNotes:\n' +
          '  AI/automation default should stay on short memory (kickoff, resume, decision, closeout, blocker).\n' +
          '  Use --mode for common modes; for note, use --kind note --durability short|durable|sticky.\n' +
          '  In PowerShell, quote @file content pointers, for example --content \'@tmp/checkpoint.md\'.\n' +
          '  Durable `note` and sticky `rule` are operator-controlled surfaces; do not write them from agent loops unless explicitly requested.\n' +
          '  If the content is long-lived, prefer a short pointer plus --next-read-ref/--source-ref instead of pasting full documents.\n' +
          MEMORY_EVIDENCE_HELP_TEXT + '\n',
      ),
    ).action(async (options: MemoryWriteOptions) => {
      await runMemoryWrite(options)
    }),
  )

  applyMemoryContextOptions(
    applyWriteOptions(
      applyMemoryClassificationOptions(
        cmd.command('compact')
          .description('Build a reviewable compact pack from old short memory and optionally write a summary')
          .option('--older-than-days <n>', 'Only compact memories older than this many days (default: 30)', (value) => Number.parseInt(String(value), 10))
          .option('--keep-latest <n>', 'Always keep this many newest matching memories out of the compact source set (default: 20)', (value) => Number.parseInt(String(value), 10))
          .option('--max-items <n>', 'Maximum number of source memories to include in one compact pack (default: 20)', (value) => Number.parseInt(String(value), 10))
          .option('--kind <kind>', 'Optional source memory kind filter')
          .option('--durability <durability>', 'Source durability; V1 only allows short')
          .option('--target-kind <kind>', 'Summary memory kind to write when --write-summary is used (default: checkpoint)')
          .option('--target-durability <durability>', 'Summary memory durability: short or durable (default: durable)')
          .option('--content <text>', 'Reviewed compact summary content; defaults to deterministic draftSummary')
          .option('--write-summary', 'Write the compact summary as a new hosted memory item')
          .option('--mark-source', 'Mark source memories as compactedInto the written summary')
          .option('--prune-source', 'Delete source hosted memory items after writing the summary; requires --apply --confirm')
          .option('--subject <kind>', 'Subject kind for filters and written summary: project, ktask, sprint, phase, utask, issue, feedback')
          .option('--id <id>', 'Subject id filter / summary subject id')
          .option('--subject-type <type>', 'Subject type filter / summary subject type')
          .option('--subject-id <id>', 'Subject id filter / summary subject id')
          .option('--task-id <id>', 'Linked kanban task id')
          .option('--sprint-id <id>', 'Linked sprint id')
          .option('--phase-id <id>', 'Linked phase id')
          .option('--utask-id <id>', 'Linked utask id')
          .option('--issue-id <id>', 'Linked issue id')
          .option('--feedback-id <id>', 'Linked feedback id'),
      ),
    ).action(async (options: MemoryCompactOptions) => {
      await runMemoryCompact(options)
    }),
  )

  applyMemoryContextOptions(
    applyWriteOptions(
      applyMemoryClassificationOptions(
        cmd.command('prune')
          .description('Prune old hosted short memory items with a dry-run first')
          .option('--older-than-days <n>', 'Only prune memories older than this many days (default: 30)', (value) => Number.parseInt(String(value), 10))
          .option('--keep-latest <n>', 'Always keep this many newest matching memories (default: 20)', (value) => Number.parseInt(String(value), 10))
          .option('--max-delete <n>', 'Maximum number of hosted memory items to delete in one apply run', (value) => Number.parseInt(String(value), 10))
          .option('--include-synced', 'Deprecated no-op (server-first): retained for script compatibility; prune operates on hosted memory items')
          .option('--kind <kind>', 'Optional memory kind filter')
          .option('--durability <durability>', 'Retention target; V1 only allows short')
          .option('--subject <kind>', 'Subject kind: project, ktask, sprint, phase, utask, issue, feedback')
          .option('--id <id>', 'Subject id filter')
          .option('--subject-type <type>', 'Subject type filter')
          .option('--subject-id <id>', 'Subject id filter')
          .option('--task-id <id>', 'Linked kanban task id')
          .option('--sprint-id <id>', 'Linked sprint id')
          .option('--phase-id <id>', 'Linked phase id')
          .option('--utask-id <id>', 'Linked utask id')
          .option('--issue-id <id>', 'Linked issue id')
          .option('--feedback-id <id>', 'Linked feedback id'),
      ),
    ).action(async (options: MemoryPruneOptions) => {
      await runMemoryPrune(options)
    }),
  )

  applyMemoryContextOptions(
    applyWriteOptions(
      cmd.command('delete')
        .description('Advanced: delete a memory item by id')
        .requiredOption('--id <id>', 'Memory item id'),
    ).action(async (options: MemoryDeleteOptions) => {
      await runMemoryDelete(options)
    }),
  )

  cmd.addHelpText('before', `
Recommended path:
  1. mem brief
  2. mem synopsis
  3. mem search
  4. mem resume
  5. mem checkpoint

Advanced surface:
  mem summary, mem write, mem update, mem compact, mem prune, mem delete, mem doc *
`)

  cmd.addHelpText('after', buildOperatorCookbook({
    examples: [
      'aops-cli mem brief --subject project --json',
      'aops-cli mem list --subject project --json',
      'aops-cli mem synopsis --subject project --json',
      'aops-cli mem get --id <memory-id> --json',
      'aops-cli mem resume --subject sprint --id <sprint-id> --json',
      'aops-cli mem checkpoint --content "Slice 1 devam ediyor." --task-id <task-id> --apply --json',
      'aops-cli mem summary --content "Session summary." --apply --json',
      'aops-cli mem doc refs --subject project --json',
      'aops-cli mem doc answer --subject sprint --id <sprint-id> --q "What changed?" --ensure summary --json',
      'aops-cli mem write --kind kickoff --durability short --subject project --content "Yarin buradan devam et." --apply --json',
      'aops-cli mem write --kind resume --durability short --subject sprint --content "Buradan devam et." --next-read-ref @./next-read-ref.json --apply --json',
      "aops-cli mem write --kind resume --durability short --subject project --content '@tmp/checkpoint.md' --apply --json",
      'aops-cli mem write --kind resume --durability short --subject project --content "Yerel carry-forward" --apply --json',
      'aops-cli mem resume --subject project --json',
      'aops-cli mem write --kind rule --durability sticky --subject project --purpose howto --area adk-electron --content "ADK komutunu once manifest sync, sonra electron bridge ile bagla." --review-after-days 30 --sticky-rank 90 --apply --json',
      'aops-cli mem update --id <memory-id> --kind closeout --durability short --content "Guncel ozet" --apply --json',
      'aops-cli mem compact --older-than-days 30 --keep-latest 20 --json',
      'aops-cli mem compact --older-than-days 30 --keep-latest 20 --write-summary --mark-source --apply --json',
      'aops-cli mem prune --older-than-days 30 --keep-latest 20 --json',
      'aops-cli mem prune --older-than-days 30 --keep-latest 20 --apply --confirm --json',
      'aops-cli mem delete --id <memory-id> --apply --confirm --json',
      'aops-cli mem search --q "staged migration" --subject project --json',
      'aops-cli mem resume --subject project --q "current slice" --limit 5 --json',
      'aops-cli mem search --q "adk electron bridge" --purpose howto --area adk-electron --strict-classification --json',
    ],
    guide: GUIDE_PATHS.agentspace,
    notes: [
      '`mem` primary operator surface\'idir; `memory` legacy alias olarak korunur.',
      'memory neyin okunacagini soyler; Docman canonical icerigi verir; Projectman execution state PM uzerinden yonetilir.',
      'AI/automation varsayilani short memory olmalidir; durable `note` ve sticky `rule` yalnizca operator/human acikca isterse yazilmalidir.',
      '`--mode` kickoff/resume/decision/blocker/closeout/rule kisayollaridir; `note` icin `--kind note --durability short|durable|sticky` kullan.',
      "PowerShell icinde @file content pointerlarini tirnakla yaz: `--content '@tmp/checkpoint.md'`.",
      'Memory backend SERVER-FIRST hosted Agentspace memory-item ops uzerindendir (create/write/read hepsi hosted); local `.aops/agentspace/memory` source-of-truth DEGIL, yalnizca read-only file-search cache.',
      '`handoff` gorunumu canonical `resume` kayitlarinin alias\'idir.',
      '--content zorunludur; @file ile dosyadan okunur (or paste inline); uzun canonical icerik yerine --next-read-ref/--source-ref ile pointer ver.',
      'Soft TTL silme yapmaz; expired memory tutulur ama retrieval tarafinda asagi itilir.',
      '`mem compact` short memory kayitlarini reviewable pack ve opsiyonel durable summary haline getirir; durable/sticky source memory default compact edilmez.',
      '`mem prune` hosted short memory icin dry-run first retention yuzeyidir (list->remove orchestration); destructive silme --apply --confirm ister.',
      'memory search icinde --purpose/--area/--status varsayilan olarak retrieval hint\'idir; strict filtre icin --strict-classification kullan.',
      '`mem search|resume|synopsis --q` kisa alias olarak `--query` ile aynidir; genis project context icin `--limit` ile birlikte kullan.',
      'Canonical uzun anlatim gerekiyorsa tam metin yerine nextReadRefs/sourceRefs ile Docman pointer\'i ver.',
    ],
  }))

  return cmd
}
