import { readFileSync } from 'node:fs'

import { logError, logInfo, logSuccess, logWarn } from '@aopslab/xf-cli-ui'

import {
  invokeHostedToolWithApiState,
  requireApiState,
  resolveProjectScopeOptionsWithApiState,
  unwrapHostedToolResult,
  type AgentGatewayContextOptions,
} from '../../utils/agent-gateway.js'
import { compactPayload, isUuidLike, normalizeNonEmpty } from '../../utils/command.js'
import { readLocalMemoryEntries, resolveMemoryWorkspacePaths } from '../../utils/memory-workspace.js'
import {
  preferProjectNameBinding,
  resolveOwnerScopeIdFromBinding,
  resolveOwnerScopeIdFromProjectRecord,
} from '../../utils/project-context.js'
import { resolvePmContext, type PmContextOptions, type ResolvedPmContext } from './context.js'
import type { CliApiClientState } from '../../utils/api.js'

type GuardedWriteOptions = {
  preview?: boolean
  apply?: boolean
  confirm?: boolean
}

type PmMemoryCadenceOptions = {
  writeMemory?: boolean
  memoryMode?: string
  memoryContent?: string
  memoryNextAction?: string
  memoryValidationState?: string
}

export type PmTaskCreateOptions = PmContextOptions &
  GuardedWriteOptions &
  PmMemoryCadenceOptions & {
    title?: string
    board?: string
    column?: string
    description?: string
    position?: string | number
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmBoardCreateOptions = PmContextOptions &
  GuardedWriteOptions & {
    name?: string
    slug?: string
    description?: string
    column?: string[]
    appendColumn?: string[]
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmBoardListOptions = PmContextOptions & {
  name?: string
  slug?: string
  includeArchived?: boolean
  tenantId?: string
  locale?: string
  fallbackLocale?: string
}

export type PmBoardGetOptions = PmContextOptions & {
  id?: string
  name?: string
  slug?: string
  tenantId?: string
  locale?: string
  fallbackLocale?: string
}

export type PmBoardArchiveOptions = PmContextOptions &
  GuardedWriteOptions & {
    id?: string
    name?: string
    slug?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmBoardDeleteOptions = PmContextOptions &
  GuardedWriteOptions & {
    id?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmBoardBootstrapSetOptions = PmContextOptions &
  GuardedWriteOptions & {
    board?: string
    title?: string
    docId?: string
    docVersionId?: string
    promptId?: string
    promptVersionId?: string
    taskId?: string
    sprintId?: string
    reference?: string[]
    notes?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmBoardBootstrapGetOptions = PmContextOptions & {
  board?: string
  tenantId?: string
  locale?: string
  fallbackLocale?: string
}

export type PmBoardCloseoutOptions = PmContextOptions &
  GuardedWriteOptions &
  PmMemoryCadenceOptions & {
    board?: string
    task?: string
    sprint?: string
    content?: string
    nextAction?: string
    validationState?: string
    skipMemory?: boolean
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmBoardResumeOptions = PmContextOptions & {
  board?: string
  depth?: 'light' | 'deep'
  limit?: string | number
  candidateLimit?: string | number
  tenantId?: string
  locale?: string
  fallbackLocale?: string
}

export type PmBoardKickoffOptions = PmContextOptions &
  GuardedWriteOptions & {
    board?: string
    column?: string
    title?: string
    description?: string
    goal?: string
    sprintName?: string
    reference?: string[]
    scopeItem?: string[]
    validationItem?: string[]
    notes?: string
    memoryContent?: string
    memoryNextAction?: string
    memoryValidationState?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmTaskListOptions = PmContextOptions & {
  board?: string
  column?: string
  sprint?: string
  tenantId?: string
  locale?: string
  fallbackLocale?: string
}

export type PmTaskRefOptions = PmContextOptions &
  GuardedWriteOptions & {
    id?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmTaskSetStatusOptions = PmContextOptions &
  GuardedWriteOptions & {
    id?: string
    status?: string
    position?: string | number
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmSprintCreateOptions = PmContextOptions &
  GuardedWriteOptions &
  PmMemoryCadenceOptions & {
    task?: string
    name?: string
    goal?: string
    reference?: string[]
    scopeItem?: string[]
    validationItem?: string[]
    notes?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmSprintListOptions = PmContextOptions & {
  task?: string
  name?: string
  status?: string
  limit?: string | number
  summary?: boolean
  includeArchived?: boolean
  tenantId?: string
  locale?: string
  fallbackLocale?: string
}

export type PmSprintRefOptions = PmContextOptions &
  GuardedWriteOptions & {
    id?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmSprintArchiveOptions = PmSprintRefOptions

export type PmSprintUpdatePlanOptions = PmContextOptions &
  GuardedWriteOptions &
  PmMemoryCadenceOptions & {
    id?: string
    name?: string
    goal?: string
    reference?: string[]
    scopeItem?: string[]
    validationItem?: string[]
    notes?: string
    phasesJson?: string
    expectedUpdatedAt?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmPlanCreateOptions = PmSprintCreateOptions
export type PmPlanListOptions = PmSprintListOptions
export type PmPlanRefOptions = PmSprintRefOptions
export type PmPlanUpdateOptions = PmSprintUpdatePlanOptions

export type PmSprintSetStatusOptions = PmContextOptions &
  GuardedWriteOptions & {
    id?: string
    status?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmStatusAuditOptions = PmContextOptions & {
  board?: string
  task?: string
  sprint?: string
  tenantId?: string
  locale?: string
  fallbackLocale?: string
  // Internal test seam: override "now" (ms) for staleness age. Not wired to a CLI flag.
  nowMs?: number
}

export type PmStatusReconcileOptions = PmContextOptions &
  GuardedWriteOptions & {
    board?: string
    task?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmUtaskSetStatusOptions = PmContextOptions &
  GuardedWriteOptions & {
    sprint?: string
    id?: string
    status?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmIssueListOptions = PmContextOptions & {
  task?: string
  sprint?: string
  utask?: string
  reviewRequest?: string
  status?: string
  severity?: string
  source?: string
  tag?: string[]
  tenantId?: string
  locale?: string
  fallbackLocale?: string
}

export type PmIssueRefOptions = PmContextOptions &
  GuardedWriteOptions & {
    id?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmIssueCreateOptions = PmContextOptions &
  GuardedWriteOptions & {
    title?: string
    description?: string
    status?: string
    severity?: string
    source?: string
    task?: string
    sprint?: string
    utask?: string
    reviewRequest?: string
    notes?: string
    tag?: string[]
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmIssueUpdateOptions = PmContextOptions &
  GuardedWriteOptions & {
    id?: string
    title?: string
    description?: string
    status?: string
    severity?: string
    source?: string
    task?: string
    sprint?: string
    utask?: string
    reviewRequest?: string
    notes?: string
    tag?: string[]
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmFeedbackListOptions = PmContextOptions & {
  task?: string
  sprint?: string
  utask?: string
  status?: string
  type?: string
  severity?: string
  source?: string
  tag?: string[]
  tenantId?: string
  locale?: string
  fallbackLocale?: string
}

export type PmFeedbackRefOptions = PmContextOptions &
  GuardedWriteOptions & {
    id?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmFeedbackCreateOptions = PmContextOptions &
  GuardedWriteOptions & {
    title?: string
    description?: string
    status?: string
    type?: string
    severity?: string
    source?: string
    task?: string
    sprint?: string
    utask?: string
    suggestion?: string
    notes?: string
    tag?: string[]
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmFeedbackUpdateOptions = PmContextOptions &
  GuardedWriteOptions & {
    id?: string
    title?: string
    description?: string
    status?: string
    type?: string
    severity?: string
    source?: string
    task?: string
    sprint?: string
    utask?: string
    suggestion?: string
    notes?: string
    tag?: string[]
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmReviewRequestListOptions = PmContextOptions & {
  task?: string
  sprint?: string
  utask?: string
  status?: string
  priority?: string
  source?: string
  targetAgent?: string
  targetSlot?: string
  parent?: string
  root?: string
  tag?: string[]
  tenantId?: string
  locale?: string
  fallbackLocale?: string
}

export type PmReviewRequestRefOptions = PmContextOptions &
  GuardedWriteOptions & {
    id?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmReviewRequestCreateOptions = PmContextOptions &
  GuardedWriteOptions & {
    title?: string
    description?: string
    reviewScope?: string
    instructions?: string
    reference?: string[]
    status?: string
    priority?: string
    source?: string
    task?: string
    sprint?: string
    utask?: string
    parent?: string
    root?: string
    requestedBy?: string
    targetAgent?: string
    targetSlot?: string
    tag?: string[]
    notifyRoom?: string
    pingFrom?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmReviewRequestUpdateOptions = PmContextOptions &
  GuardedWriteOptions & {
    id?: string
    title?: string
    description?: string
    reviewScope?: string
    instructions?: string
    reference?: string[]
    status?: string
    priority?: string
    source?: string
    task?: string
    sprint?: string
    utask?: string
    parent?: string
    root?: string
    requestedBy?: string
    targetAgent?: string
    targetSlot?: string
    tag?: string[]
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmReviewRequestResultOptions = PmContextOptions &
  GuardedWriteOptions & {
    id?: string
    reviewer?: string
    outcome?: string
    summary?: string
    positive?: string[]
    concern?: string[]
    objection?: string[]
    reference?: string[]
    issue?: string[]
    basedOnSeqRange?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmUtaskCreateOptions = PmContextOptions &
  GuardedWriteOptions &
  PmMemoryCadenceOptions & {
    sprint?: string
    phase?: string
    title?: string
    status?: string
    notes?: string
    position?: string | number
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmUtaskUpdateOptions = PmContextOptions &
  GuardedWriteOptions &
  PmMemoryCadenceOptions & {
    sprint?: string
    id?: string
    title?: string
    status?: string
    notes?: string
    position?: string | number
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmUtaskDeleteOptions = PmContextOptions &
  GuardedWriteOptions & {
    sprint?: string
    id?: string
    idempotencyKey?: string
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

export type PmHandoffResumeOptions = PmContextOptions & {
  subject?: string
  id?: string
  label?: string
  taskId?: string
  sprintId?: string
  phaseId?: string
  utaskId?: string
  issueId?: string
  feedbackId?: string
  tag?: string[]
  query?: string
  goal?: string
  depth?: 'light' | 'deep'
  limit?: string | number
  candidateLimit?: string | number
  strictSubject?: boolean
  tenantId?: string
  locale?: string
  fallbackLocale?: string
}

export type PmHandoffWriteOptions = PmContextOptions &
  GuardedWriteOptions & {
    mode?: string
    subject?: string
    id?: string
    label?: string
    content?: string
    durability?: 'short' | 'durable' | 'sticky'
    importance?: string | number
    nextAction?: string
    nextReadRef?: string[]
    sourceRef?: string[]
    validationState?: string
    patternName?: string
    patternWhen?: string
    patternWhy?: string
    patternEvidence?: string
    taskId?: string
    sprintId?: string
    phaseId?: string
    utaskId?: string
    issueId?: string
    feedbackId?: string
    tag?: string[]
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  }

type ResolvedReference = {
  input: string
  id: string
  label?: string
  assumedId?: boolean
}

type EnrichedBoardColumnPlacement = {
  placement: Record<string, unknown>
  placementId?: string
  columnId?: string
  column?: Record<string, unknown> | null
}

type PmExecutionContext = {
  resolvedContext: ResolvedPmContext
  gatewayOptions: AgentGatewayContextOptions
  // Projectman is hosted-only: prepareExecution always resolves an API host, so apiState is
  // guaranteed present for every PM invoke.
  apiState: CliApiClientState
}

type PmFlowPreviewResult = {
  ok: true
  preview: true
  action: string
  board: Record<string, unknown>
  columns: Array<Record<string, unknown>>
  notes?: string[]
}

type SprintMicrotaskPlan = {
  id?: string
  title: string
  status: string
  position: number
  notes?: string
  parentIssueId?: string
}

type SprintPhasePlan = {
  id?: string
  name: string
  description?: string
  position: number
  microtasks: SprintMicrotaskPlan[]
}

type PmHandoffMode = 'kickoff' | 'resume' | 'decision' | 'blocker' | 'closeout' | 'rule'

type PmHandoffSubjectKey = 'project' | 'ktask' | 'sprint' | 'phase' | 'utask' | 'issue' | 'feedback'

type PmHandoffSubjectConfig = {
  key: PmHandoffSubjectKey
  subjectType: string
  defaultQuery: string
  defaultSourceTypes: string[]
}

const MICROTASK_STATUSES = new Set([
  'todo',
  'doing',
  'blocked',
  'paused',
  'in_review',
  'completed',
  'cancelled',
  'postponed',
])
const PM_HANDOFF_MODES = new Set<PmHandoffMode>(['kickoff', 'resume', 'decision', 'blocker', 'closeout', 'rule'])
const PM_HANDOFF_SUBJECTS: Record<PmHandoffSubjectKey, PmHandoffSubjectConfig> = {
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
    defaultSourceTypes: ['projectman.sprint', 'projectman.microtask', 'projectman.phase', 'projectman.kanban-task'],
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

const PM_HANDOFF_MODE_DEFAULTS: Record<PmHandoffMode, { kind: string; durability: 'short' | 'durable' | 'sticky'; tags: string[] }> = {
  kickoff: { kind: 'kickoff', durability: 'short', tags: ['phase:kickoff'] },
  resume: { kind: 'resume', durability: 'short', tags: ['phase:resume'] },
  decision: { kind: 'decision', durability: 'short', tags: ['phase:decision'] },
  blocker: { kind: 'constraint', durability: 'short', tags: ['phase:blocker'] },
  closeout: { kind: 'closeout', durability: 'short', tags: ['phase:closeout'] },
  rule: { kind: 'rule', durability: 'sticky', tags: ['phase:memory'] },
}

const DEFAULT_PM_BOARD_COLUMNS = Object.freeze([
  { name: 'Backlog', slug: 'backlog' },
  { name: 'Todo', slug: 'todo' },
  { name: 'Doing', slug: 'doing' },
  { name: 'Done', slug: 'done' },
])

const PM_BOARD_BOOTSTRAP_TAG = 'board-bootstrap'
const PM_BOARD_BOOTSTRAP_META_VERSION = 1
const PM_STATUS_TERMINAL_MICROTASK_STATUSES = new Set(['completed', 'done', 'cancelled'])
const PM_STATUS_COMPLETED_STATUSES = new Set(['completed', 'done'])
const PM_STATUS_TERMINAL_SPRINT_STATUSES = new Set(['completed', 'done', 'closed', 'cancelled'])
const PM_STATUS_DONE_TOKENS = new Set(['done', 'complete', 'completed', 'closed'])
const PM_STATUS_DOING_TOKENS = new Set(['doing', 'in-progress', 'in_progress', 'active'])
// feedback 844e881a: advisory staleness threshold for the both-stale case (task + sprint
// both non-terminal, no drift). Single internal constant; no CLI flag in this slice.
const PM_STATUS_STALE_REVIEW_THRESHOLD_DAYS = 7
const PM_STATUS_STALE_REVIEW_THRESHOLD_MS = PM_STATUS_STALE_REVIEW_THRESHOLD_DAYS * 24 * 60 * 60 * 1000
const PM_STATUS_AUDIT_CLASS_DEFINITIONS = [
  {
    class: 'task_done_sprint_open',
    description: 'Kanban task is in a done-like column while a linked sprint is still open or has open microtasks.',
  },
  {
    class: 'sprint_completed_task_not_done',
    description: 'Linked sprint is completed while the kanban task is not done-like.',
  },
  {
    class: 'task_progress_status_mismatch',
    description: 'Kanban task progress and workflow column disagree.',
  },
  {
    class: 'sprint_progress_status_mismatch',
    description: 'Sprint lifecycle status disagrees with nested microtask completion evidence.',
  },
  {
    class: 'stale_doing_with_terminal_sprint',
    description: 'Kanban task remains doing while linked sprint completion evidence is terminal.',
  },
  {
    class: 'stale_review_candidate',
    description: 'Non-terminal task and linked sprint(s) with no activity beyond the staleness threshold; advisory only (likely finished-but-unclosed work) — never auto-reconciled, inspect/close manually.',
  },
  {
    class: 'archived_nonterminal',
    description: 'Archived board/sprint visibility hides non-terminal work from active surfaces; advisory only, never auto-reconciled.',
  },
  {
    class: 'review_approved_pm_nonterminal',
    description: 'Optional future cross-check: approved review evidence exists while PM entities remain non-terminal.',
  },
] as const

type PmStatusAuditClass = (typeof PM_STATUS_AUDIT_CLASS_DEFINITIONS)[number]['class']
type PmStatusAuditSeverity = 'info' | 'warning' | 'error'
type PmTaskColumnKind = 'done' | 'doing' | 'todo' | 'backlog' | 'other'

type PmStatusAuditColumnInfo = {
  id?: string
  boardId?: string
  name?: string
  slug?: string
  archived?: boolean
  kind: PmTaskColumnKind
}

type PmStatusAuditTaskSummary = {
  id: string
  title?: string
  status?: string
  progress?: number
  boardId?: string
  column?: PmStatusAuditColumnInfo
  archived: boolean
  isDone: boolean
  isDoing: boolean
}

type PmStatusAuditSprintSummary = {
  id: string
  name?: string
  status?: string
  taskId?: string
  microtaskCount: number
  completedMicrotaskCount: number
  openMicrotaskCount: number
  computedProgress: number
  archived: boolean
  isCompleted: boolean
  isTerminal: boolean
  isOpenForCompletion: boolean
}

type PmStatusAuditFinding = {
  class: PmStatusAuditClass
  severity: PmStatusAuditSeverity
  message: string
  suggestion: string
  task?: Record<string, unknown>
  sprint?: Record<string, unknown>
  sprints?: Record<string, unknown>[]
  evidence?: Record<string, unknown>
}

type PmStatusHintContext = {
  tasks: Record<string, unknown>[]
  sprints: Record<string, unknown>[]
  columnIndex: Map<string, PmStatusAuditColumnInfo>
}

type PmBoardBootstrapRecord = {
  memoryId?: string
  boardId: string
  boardSlug: string
  title?: string
  docId?: string
  docVersionId?: string
  promptId?: string
  promptVersionId?: string
  activeTaskId?: string
  activeSprintId?: string
  references: string[]
  notes?: string
  createdAt?: string
  updatedAt?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeArrayValues(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) return undefined
  const normalized = values
    .map((value) => normalizeNonEmpty(value))
    .filter((value): value is string => Boolean(value))
  return normalized.length > 0 ? normalized : undefined
}

function uniqueStringValues(values: unknown[]): string[] {
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

function toArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((entry) => normalizeNonEmpty(entry))
        .filter((entry): entry is string => Boolean(entry))
    : []
}

function normalizeRefLike(value: string): Record<string, unknown> {
  const trimmed = value.trim()
  if (!trimmed) return {}
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return JSON.parse(trimmed) as Record<string, unknown>
  }
  return { ref: trimmed }
}

function normalizeExactLabel(value: unknown): string {
  return normalizeNonEmpty(value)?.toLowerCase() ?? ''
}

function slugifyPmBoardName(value: unknown, fallback = 'board'): string {
  const normalized = (normalizeNonEmpty(value) ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  if (!normalized) return fallback
  if (normalized.length <= 48) return normalized

  const parts = normalized.split('-').filter(Boolean)
  if (parts.length > 1) {
    const abbreviated = parts
      .map((part, index) => part.slice(0, index === 0 ? 8 : 4))
      .join('-')
      .replace(/(^-|-$)/g, '')
    if (abbreviated.length <= 48) return abbreviated

    const tighter = parts
      .map((part, index) => part.slice(0, index === 0 ? 6 : 3))
      .join('-')
      .replace(/(^-|-$)/g, '')
    if (tighter.length <= 48) return tighter
  }

  return normalized.slice(0, 48).replace(/-+$/g, '') || fallback
}

function slugifyPmBoardColumnName(boardName: unknown, columnName: unknown): string {
  return `${slugifyPmBoardName(boardName, 'board')}-${slugifyPmBoardName(columnName, 'column')}`
}

function normalizePmBoardColumns(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return uniqueStringValues(values)
}

function parseJsonArrayOption(value: unknown, label: string): unknown[] | undefined {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return undefined

  const raw = normalized.startsWith('@')
    ? readFileSync(normalized.slice(1).trim(), 'utf8')
    : normalized

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} must be a JSON array or @file.json array. ${message}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array or @file.json array.`)
  }
  return parsed
}

function parseJsonObjectOption(value: unknown, label: string): Record<string, unknown> | undefined {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return undefined

  const raw = normalized.startsWith('@')
    ? readFileSync(normalized.slice(1).trim(), 'utf8')
    : normalized

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} must be a JSON object or @file.json object. ${message}`)
  }

  if (!isRecord(parsed)) {
    throw new Error(`${label} must be a JSON object or @file.json object.`)
  }
  return parsed
}

function validateSprintPhasePlanInput(phases: unknown[], label: string): unknown[] {
  phases.forEach((phase, phaseIndex) => {
    if (!isRecord(phase)) {
      throw new Error(`${label} phase[${phaseIndex}] must be an object.`)
    }

    if (Object.prototype.hasOwnProperty.call(phase, 'status')) {
      throw new Error(
        `${label} phase[${phaseIndex}].status is not supported. Phase status is derived from nested microtask statuses; use microtask.status or sprint.update-microtask instead.`,
      )
    }

    const microtasks = phase.microtasks
    if (microtasks === undefined) return
    if (!Array.isArray(microtasks)) {
      throw new Error(`${label} phase[${phaseIndex}].microtasks must be an array when provided.`)
    }

    microtasks.forEach((microtask, microtaskIndex) => {
      if (!isRecord(microtask)) {
        throw new Error(`${label} phase[${phaseIndex}].microtasks[${microtaskIndex}] must be an object.`)
      }
      if (Object.prototype.hasOwnProperty.call(microtask, 'status')) {
        normalizeMicrotaskStatusInput(microtask.status)
      }
    })
  })

  return phases
}

function buildPmBoardPreviewColumns(boardName: string, columnNames: string[]): Array<Record<string, unknown>> {
  return columnNames
    .map((name) => normalizeNonEmpty(name))
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ name, slug: slugifyPmBoardColumnName(boardName, name) }))
    .map((column, index) => ({
      ...column,
      position: index,
    }))
}

function buildPmAppendedBoardColumns(columnNames: string[]): string[] {
  const columns = [...DEFAULT_PM_BOARD_COLUMNS]
  const matchedDefaultSlugs = new Set(columns.map((column) => column.slug))
  const extras = columnNames
    .map((name) => normalizeNonEmpty(name))
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ name, slug: slugifyPmBoardName(name, 'column') }))
    .filter((column) => !matchedDefaultSlugs.has(column.slug))

  return [...columns, ...extras].map((column) => column.name)
}

function buildPmBoardBootstrapTags(projectId: string | undefined, boardSlug: string): string[] {
  return uniqueStringValues([
    'phase:memory',
    PM_BOARD_BOOTSTRAP_TAG,
    `board:${boardSlug}`,
    projectId ? `project:${projectId}` : undefined,
  ])
}

function buildPmBoardBootstrapContent(record: PmBoardBootstrapRecord): string {
  const lines = [
    `Board bootstrap registry for ${record.title ?? record.boardSlug}.`,
    `Board: ${record.boardSlug} (${record.boardId})`,
  ]
  if (record.docId || record.docVersionId) {
    lines.push(`Docman: ${record.docId ?? '-'}${record.docVersionId ? ` / version ${record.docVersionId}` : ''}`)
  }
  if (record.promptId || record.promptVersionId) {
    lines.push(`Prompt: ${record.promptId ?? '-'}${record.promptVersionId ? ` / version ${record.promptVersionId}` : ''}`)
  }
  if (record.activeTaskId) {
    lines.push(`Active task: ${record.activeTaskId}`)
  }
  if (record.activeSprintId) {
    lines.push(`Active sprint: ${record.activeSprintId}`)
  }
  if (record.references.length > 0) {
    lines.push('References:')
    record.references.forEach((entry) => lines.push(`- ${entry}`))
  }
  if (record.notes) {
    lines.push('Notes:')
    lines.push(record.notes)
  }
  return lines.join('\n')
}

function normalizePmBoardBootstrapRecord(record: Record<string, unknown>): PmBoardBootstrapRecord | null {
  const meta = isRecord(record.meta) ? record.meta : {}
  const rawBootstrap = isRecord(meta.boardBootstrap) ? meta.boardBootstrap : {}
  const boardId = normalizeNonEmpty(rawBootstrap.boardId) ?? normalizeNonEmpty(meta.boardId)
  const boardSlug = normalizeNonEmpty(rawBootstrap.boardSlug) ?? normalizeNonEmpty(meta.boardSlug)
  if (!boardId || !boardSlug) return null

  return {
    memoryId: normalizeNonEmpty(record.id),
    boardId,
    boardSlug,
    title: normalizeNonEmpty(rawBootstrap.title) ?? normalizeNonEmpty(meta.subjectTitle),
    docId: normalizeNonEmpty(rawBootstrap.docId),
    docVersionId: normalizeNonEmpty(rawBootstrap.docVersionId),
    promptId: normalizeNonEmpty(rawBootstrap.promptId),
    promptVersionId: normalizeNonEmpty(rawBootstrap.promptVersionId),
    activeTaskId: normalizeNonEmpty(rawBootstrap.activeTaskId),
    activeSprintId: normalizeNonEmpty(rawBootstrap.activeSprintId),
    references: uniqueStringValues(toArray(rawBootstrap.references)),
    notes: normalizeNonEmpty(rawBootstrap.notes),
    createdAt: normalizeNonEmpty(record.createdAt),
    updatedAt: normalizeNonEmpty(record.updatedAt),
  }
}

function compareIsoTimestampsDesc(left?: string, right?: string): number {
  return (right ?? '').localeCompare(left ?? '')
}

function extractEntityId(record: unknown, keys: readonly string[] = ['id']): string | undefined {
  if (!isRecord(record)) return undefined
  for (const key of keys) {
    const value = normalizeNonEmpty(record[key])
    if (value) return value
  }
  return undefined
}

function extractEntityLabel(record: unknown): string | undefined {
  if (!isRecord(record)) return undefined
  return (
    normalizeNonEmpty(record.name) ??
    normalizeNonEmpty(record.title) ??
    normalizeNonEmpty(record.slug)
  )
}

function toRecordArray(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result.filter(isRecord)
  }
  if (!isRecord(result)) return []

  const candidates = [result.items, result.data, result.results, result.rows]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord)
    }
  }

  return []
}

function isArchiveMarked(record: Record<string, unknown>): boolean {
  return record.archived === true || Boolean(normalizeNonEmpty(record.archivedAt))
}

function archiveCounts(records: Record<string, unknown>[]): { activeCount: number; archivedCount: number } {
  const archivedCount = records.filter(isArchiveMarked).length
  return {
    activeCount: records.length - archivedCount,
    archivedCount,
  }
}

function unwrapResultData<T>(result: unknown): T | undefined {
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'data')) {
    return result.data as T
  }
  return result as T
}

function normalizeMicrotaskStatusInput(value: unknown): string {
  const normalized = normalizeNonEmpty(value)?.toLowerCase() ?? 'todo'
  if (!MICROTASK_STATUSES.has(normalized)) {
    throw new Error(
      `Invalid --status "${value}". Expected one of: todo, doing, blocked, paused, in_review, completed, cancelled, postponed.`,
    )
  }
  return normalized
}

function normalizeKanbanTaskStatusColumnInput(value: unknown): string {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized) {
    throw new Error('Missing required --status.')
  }
  if (normalized === 'completed' || normalized === 'complete') return 'done'
  if (normalized === 'in_progress' || normalized === 'active') return 'doing'
  return normalized
}

function isDoneLikeKanbanTaskStatusInput(value: unknown): boolean {
  const normalized = normalizeKanbanTaskStatusColumnInput(value)
  return normalized === 'done'
}

function normalizePmHandoffSubject(value: unknown): PmHandoffSubjectConfig {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  const alias = normalized === 'task' ? 'ktask' : normalized === 'microtask' ? 'utask' : normalized
  const config = alias ? PM_HANDOFF_SUBJECTS[alias as PmHandoffSubjectKey] : undefined
  if (!config) {
    throw new Error('Invalid --subject. Expected one of: project, ktask, sprint, phase, utask, issue, feedback.')
  }
  return config
}

function normalizePmHandoffMode(value: unknown): PmHandoffMode {
  const normalized = normalizeNonEmpty(value)?.toLowerCase() as PmHandoffMode | undefined
  if (!normalized || !PM_HANDOFF_MODES.has(normalized)) {
    throw new Error('Invalid --mode. Expected one of: kickoff, resume, decision, blocker, closeout, rule.')
  }
  return normalized
}

function resolvePmHandoffSubjectId(subject: PmHandoffSubjectConfig, options: {
  id?: unknown
  projectId?: unknown
}): string {
  const explicit = normalizeNonEmpty(options.id)
  if (explicit) return explicit
  if (subject.key === 'project') {
    const projectId = normalizeNonEmpty(options.projectId)
    if (projectId) return projectId
  }
  throw new Error('Missing required --id.')
}

function buildPmHandoffEntityLinks(subject: PmHandoffSubjectConfig, subjectId: string, options: {
  taskId?: unknown
  sprintId?: unknown
  phaseId?: unknown
  utaskId?: unknown
  issueId?: unknown
  feedbackId?: unknown
}): Record<string, string | undefined> {
  const links: Record<string, string | undefined> = {
    kanbanTaskId: normalizeNonEmpty(options.taskId),
    sprintId: normalizeNonEmpty(options.sprintId),
    phaseId: normalizeNonEmpty(options.phaseId),
    microtaskId: normalizeNonEmpty(options.utaskId),
    issueId: normalizeNonEmpty(options.issueId),
    feedbackId: normalizeNonEmpty(options.feedbackId),
  }

  if (subject.key === 'ktask') links.kanbanTaskId ??= subjectId
  if (subject.key === 'sprint') links.sprintId ??= subjectId
  if (subject.key === 'phase') links.phaseId ??= subjectId
  if (subject.key === 'utask') links.microtaskId ??= subjectId
  if (subject.key === 'issue') links.issueId ??= subjectId
  if (subject.key === 'feedback') links.feedbackId ??= subjectId
  return links
}

function buildPmHandoffSourceIds(subjectId: string, links: Record<string, string | undefined>): string[] {
  return uniqueStringValues([
    subjectId,
    links.kanbanTaskId,
    links.sprintId,
    links.phaseId,
    links.microtaskId,
    links.issueId,
    links.feedbackId,
  ])
}

type PmBoardLineage = {
  boardId: string
  boardSlug?: string
  boardLabel?: string
}

function normalizePmBoardLineageCandidate(value: unknown): PmBoardLineage | null {
  const boardId = extractEntityId(value, ['id', 'boardId'])
  if (!boardId) return null
  return {
    boardId,
    boardSlug: isRecord(value) ? normalizeNonEmpty(value.slug) : undefined,
    boardLabel: extractEntityLabel(value),
  }
}

function mergePmBoardLineageIntoMemoryShape(params: {
  tags: string[]
  meta: Record<string, unknown>
  lineage: PmBoardLineage | null
}): { tags: string[]; meta: Record<string, unknown> } {
  if (!params.lineage?.boardId) {
    return {
      tags: uniqueStringValues(params.tags),
      meta: params.meta,
    }
  }
  return {
    tags: uniqueStringValues([
      ...params.tags,
      params.lineage.boardSlug ? `board:${params.lineage.boardSlug}` : undefined,
    ]),
    meta: compactPayload({
      ...params.meta,
      boardId: params.lineage.boardId,
      boardSlug: params.lineage.boardSlug,
      boardLabel: params.lineage.boardLabel,
    }) as Record<string, unknown>,
  }
}

function normalizeRefPointer(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return normalizeNonEmpty(value)
  }
  if (!isRecord(value)) return undefined
  return (
    normalizeNonEmpty(value.ref) ??
    normalizeNonEmpty(value.uri) ??
    normalizeNonEmpty(value.path) ??
    normalizeNonEmpty(value.id)
  )
}

function collectRefPointers(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return uniqueStringValues(value.map((entry) => normalizeRefPointer(entry)))
}

function boardResumeMemoryMatchesLinks(
  memory: Record<string, unknown>,
  links: Record<string, string | undefined>,
): boolean {
  const sourceId = normalizeNonEmpty(memory.sourceId)
  if (
    (links.kanbanTaskId && sourceId === links.kanbanTaskId) ||
    (links.sprintId && sourceId === links.sprintId) ||
    (links.phaseId && sourceId === links.phaseId) ||
    (links.microtaskId && sourceId === links.microtaskId) ||
    (links.issueId && sourceId === links.issueId) ||
    (links.feedbackId && sourceId === links.feedbackId)
  ) {
    return true
  }

  const tags = new Set(toArray(memory.tags).map((entry) => entry.toLowerCase()))
  if (
    (links.kanbanTaskId && tags.has(`kanban-task:${links.kanbanTaskId}`.toLowerCase())) ||
    (links.sprintId && tags.has(`sprint:${links.sprintId}`.toLowerCase())) ||
    (links.phaseId && tags.has(`phase:${links.phaseId}`.toLowerCase())) ||
    (links.microtaskId && tags.has(`microtask:${links.microtaskId}`.toLowerCase())) ||
    (links.issueId && tags.has(`issue:${links.issueId}`.toLowerCase())) ||
    (links.feedbackId && tags.has(`feedback:${links.feedbackId}`.toLowerCase()))
  ) {
    return true
  }

  const meta = isRecord(memory.meta) ? memory.meta : {}
  return Boolean(
    (links.kanbanTaskId && normalizeNonEmpty(meta.kanbanTaskId) === links.kanbanTaskId) ||
    (links.sprintId && normalizeNonEmpty(meta.sprintId) === links.sprintId) ||
    (links.phaseId && normalizeNonEmpty(meta.phaseId) === links.phaseId) ||
    (links.microtaskId && normalizeNonEmpty(meta.microtaskId) === links.microtaskId) ||
    (links.issueId && normalizeNonEmpty(meta.issueId) === links.issueId) ||
    (links.feedbackId && normalizeNonEmpty(meta.feedbackId) === links.feedbackId)
  )
}

function buildScopedBoardResumeSummary(memories: Record<string, unknown>[]): string | undefined {
  const content = uniqueStringValues(
    memories
      .map((memory) => normalizeNonEmpty(memory.content))
      .filter((entry): entry is string => Boolean(entry)),
  ).slice(0, 2)
  return content.length > 0 ? content.join('\n\n') : undefined
}

function scopePmBoardResumePacket(
  packet: Record<string, unknown>,
  params: {
    links: Record<string, string | undefined>
    bootstrap?: PmBoardBootstrapRecord | null
  },
): Record<string, unknown> {
  const result = isRecord(packet.result) ? packet.result : {}
  const data = isRecord(result.data) ? result.data : result
  const relatedMemory = Array.isArray(data.relatedMemory) ? data.relatedMemory.filter(isRecord) : []
  if (relatedMemory.length === 0) {
    return packet
  }

  const scopedRelatedMemory = relatedMemory.filter((memory) => boardResumeMemoryMatchesLinks(memory, params.links))
  if (scopedRelatedMemory.length === 0 || scopedRelatedMemory.length === relatedMemory.length) {
    return packet
  }

  const scopedSummary =
    buildScopedBoardResumeSummary(scopedRelatedMemory) ??
    normalizeNonEmpty(data.resumeSummary) ??
    normalizeNonEmpty(isRecord(data.synopsis) ? data.synopsis.summary : undefined)
  const nextActions = uniqueStringValues(
    scopedRelatedMemory.map((memory) => {
      const meta = isRecord(memory.meta) ? memory.meta : {}
      return normalizeNonEmpty(meta.nextAction)
    }),
  )
  const recommendedRefs = uniqueStringValues([
    ...(params.bootstrap?.references ?? []),
    ...scopedRelatedMemory.flatMap((memory) => {
      const meta = isRecord(memory.meta) ? memory.meta : {}
      return [
        ...collectRefPointers(meta.nextReadRefs),
        ...collectRefPointers(meta.sourceRefs),
      ]
    }),
  ]).map((ref) => ({ ref }))

  const synopsis = isRecord(data.synopsis) ? { ...data.synopsis } : {}
  if (scopedSummary) synopsis.summary = scopedSummary
  if (nextActions.length > 0) {
    synopsis.currentFocus = nextActions[0]
    synopsis.openItems = nextActions
  }
  synopsis.sourceMemoryIds = uniqueStringValues(
    scopedRelatedMemory.map((memory) => normalizeNonEmpty(memory.id)),
  )

  return {
    ...packet,
    result: {
      ...result,
      ...(isRecord(result.data)
        ? {
            data: compactPayload({
              ...data,
              synopsis,
              relatedMemory: scopedRelatedMemory,
              resumeSummary: scopedSummary,
              currentFocus: nextActions[0] ?? normalizeNonEmpty(data.currentFocus),
              openItems: nextActions.length > 0 ? nextActions : data.openItems,
              nextActions: nextActions.length > 0 ? nextActions : data.nextActions,
              recommendedRefs: recommendedRefs.length > 0 ? recommendedRefs : data.recommendedRefs,
              scope: {
                applied: true,
                mode: 'active-window',
                relatedMemoryCount: scopedRelatedMemory.length,
                originalRelatedMemoryCount: relatedMemory.length,
              },
            }),
          }
        : compactPayload({
            ...data,
            synopsis,
            relatedMemory: scopedRelatedMemory,
            resumeSummary: scopedSummary,
            currentFocus: nextActions[0] ?? normalizeNonEmpty(data.currentFocus),
            openItems: nextActions.length > 0 ? nextActions : data.openItems,
            nextActions: nextActions.length > 0 ? nextActions : data.nextActions,
            recommendedRefs: recommendedRefs.length > 0 ? recommendedRefs : data.recommendedRefs,
            scope: {
              applied: true,
              mode: 'active-window',
              relatedMemoryCount: scopedRelatedMemory.length,
              originalRelatedMemoryCount: relatedMemory.length,
            },
          })),
    },
  }
}

function shouldWritePmMemory(options: PmMemoryCadenceOptions): boolean {
  return options.writeMemory === true || Boolean(normalizeNonEmpty(options.memoryMode))
}

function inferPmMemoryMode(
  requestedMode: unknown,
  fallbackMode: PmHandoffMode,
  currentStatus?: string,
): PmHandoffMode {
  const explicit = normalizeNonEmpty(requestedMode)
  if (explicit) {
    return normalizePmHandoffMode(explicit)
  }

  const normalizedStatus = normalizeNonEmpty(currentStatus)?.toLowerCase()
  if (normalizedStatus === 'blocked') return 'blocker'
  if (normalizedStatus === 'completed' || normalizedStatus === 'cancelled') return 'closeout'
  return fallbackMode
}

function normalizePmDecisionMemoryShape(params: {
  kind: string
  durability: 'short' | 'durable' | 'sticky'
  tags: string[]
}): { kind: string; durability: 'short' | 'durable' | 'sticky'; tags: string[] } {
  if (params.kind === 'decision') {
    return {
      kind: 'decision',
      durability: params.durability,
      tags: uniqueStringValues([...params.tags, 'phase:decision']),
    }
  }
  return {
    kind: params.kind,
    durability: params.durability,
    tags: uniqueStringValues(params.tags),
  }
}

function buildTaskKickoffMemoryContent(params: {
  title: string
  boardLabel?: string
  columnLabel?: string
  description?: string
}): string {
  const parts = [
    `Yeni kanban gorevi baslatildi: ${params.title}.`,
    `Board: ${params.boardLabel ?? 'belirtilmedi'}.`,
    `Kolon: ${params.columnLabel ?? 'belirtilmedi'}.`,
  ]
  if (params.description) parts.push(`Aciklama: ${params.description}.`)
  return parts.join(' ')
}

function buildSprintKickoffMemoryContent(params: {
  name: string
  goal: string
  scope?: string[]
  validationPlan?: string[]
  references?: string[]
  notes?: string
}): string {
  const parts = [`Sprint baslatildi: ${params.name}.`, `Hedef: ${params.goal}.`]
  if (params.scope && params.scope.length > 0) parts.push(`Kapsam: ${params.scope.join('; ')}.`)
  if (params.validationPlan && params.validationPlan.length > 0) {
    parts.push(`Validation: ${params.validationPlan.join('; ')}.`)
  }
  if (params.references && params.references.length > 0) parts.push(`Referanslar: ${params.references.join(', ')}.`)
  if (params.notes) parts.push(`Notlar: ${params.notes}.`)
  return parts.join(' ')
}

function buildUtaskMemoryContent(params: {
  mode: PmHandoffMode
  title: string
  sprintLabel?: string
  phaseLabel?: string
  status?: string
  notes?: string
}): string {
  const statusText = params.status ?? 'todo'
  const parts: string[] = []
  if (params.mode === 'kickoff') {
    parts.push(`Yeni utask acildi: ${params.title}.`)
  } else if (params.mode === 'blocker') {
    parts.push(`Utask blocker durumuna girdi: ${params.title}.`)
  } else if (params.mode === 'closeout') {
    parts.push(`Utask kapandi: ${params.title}.`)
  } else {
    parts.push(`Utask guncellendi: ${params.title}.`)
  }
  parts.push(`Sprint: ${params.sprintLabel ?? 'belirtilmedi'}.`)
  if (params.phaseLabel) parts.push(`Faz: ${params.phaseLabel}.`)
  parts.push(`Durum: ${statusText}.`)
  if (params.notes) parts.push(`Notlar: ${params.notes}.`)
  return parts.join(' ')
}

async function writePmMemorySideEffect(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions & GuardedWriteOptions & PmMemoryCadenceOptions & {
    tenantId?: string
    locale?: string
    fallbackLocale?: string
  },
  params: {
    mode: PmHandoffMode
    subject: PmHandoffSubjectConfig
    subjectId: string
    subjectTitle?: string
    content: string
    nextAction?: string
    validationState?: string
    links?: Record<string, string | undefined>
    board?: unknown
  },
): Promise<Record<string, unknown>> {
  if (options.preview === true) {
    return {
      ok: false,
      skipped: true,
      mode: params.mode,
      toolId: 'agentspace.memory-item.add-memory-item',
      reason: 'preview_mode',
    }
  }

  try {
    const links = params.links ?? buildPmHandoffEntityLinks(params.subject, params.subjectId, {})
    const modeDefaults = PM_HANDOFF_MODE_DEFAULTS[params.mode]
    const stickyScope = modeDefaults.durability === 'sticky' ? 'project' : undefined
    const tags = uniqueStringValues([
      ...modeDefaults.tags,
      execution.resolvedContext.projectId ? `project:${execution.resolvedContext.projectId}` : undefined,
      links.kanbanTaskId ? `kanban-task:${links.kanbanTaskId}` : undefined,
      links.sprintId ? `sprint:${links.sprintId}` : undefined,
      links.phaseId ? `phase:${links.phaseId}` : undefined,
      links.microtaskId ? `microtask:${links.microtaskId}` : undefined,
    ])
    const normalizedMemoryShape = normalizePmDecisionMemoryShape({
      kind: modeDefaults.kind,
      durability: modeDefaults.durability,
      tags,
    })
    const boardLineage = await resolvePmBoardLineage(execution, options, {
      board: params.board,
      links,
    })
    const meta = {
      subjectType: params.subject.subjectType,
      subjectId: params.subjectId,
      ...(stickyScope ? { stickyScope } : {}),
      ...(params.subjectTitle ? { subjectTitle: params.subjectTitle } : {}),
      ...(execution.resolvedContext.projectId ? { projectId: execution.resolvedContext.projectId } : {}),
      ...(links.kanbanTaskId ? { kanbanTaskId: links.kanbanTaskId } : {}),
      ...(links.sprintId ? { sprintId: links.sprintId } : {}),
      ...(links.phaseId ? { phaseId: links.phaseId } : {}),
      ...(links.microtaskId ? { microtaskId: links.microtaskId } : {}),
      ...(links.issueId ? { issueId: links.issueId } : {}),
      ...(links.feedbackId ? { feedbackId: links.feedbackId } : {}),
      ...(params.nextAction ? { nextAction: params.nextAction } : {}),
      ...(params.validationState ? { validationState: params.validationState } : {}),
    }
    const boardScopedShape = mergePmBoardLineageIntoMemoryShape({
      tags: normalizedMemoryShape.tags,
      meta,
      lineage: boardLineage,
    })

    const input = {
      data: {
        scopeId: resolveOwnerScopeIdFromBinding(execution.resolvedContext),
        kind: normalizedMemoryShape.kind,
        durability: normalizedMemoryShape.durability,
        content: params.content,
        tags: boardScopedShape.tags,
        sourceType: params.subject.subjectType,
        sourceId: params.subjectId,
        meta: boardScopedShape.meta,
      },
    }

    const payload = await invokeProjectmanTool(
      execution,
      {
        ...options,
        preview: false,
        apply: true,
        confirm: false,
      },
      {
        toolId: 'agentspace.memory-item.add-memory-item',
        input,
      },
    )

    return {
      ok: true,
      mode: params.mode,
      toolId: 'agentspace.memory-item.add-memory-item',
      result: unwrapHostedToolResult(payload),
    }
  } catch (error) {
    return {
      ok: false,
      mode: params.mode,
      toolId: 'agentspace.memory-item.add-memory-item',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function cloneSprintPhases(value: unknown): SprintPhasePlan[] {
  if (!Array.isArray(value)) return []
  return value.map((phase, phaseIndex) => {
    const record = isRecord(phase) ? phase : {}
    const rawMicrotasks = Array.isArray(record.microtasks) ? record.microtasks : []
    return {
      id: normalizeNonEmpty(record.id),
      name: normalizeNonEmpty(record.name) ?? `Main ${phaseIndex + 1}`,
      description: normalizeNonEmpty(record.description),
      position: parseOptionalInteger(record.position, 'phase position') ?? phaseIndex,
      microtasks: rawMicrotasks.map((microtask, microtaskIndex) => {
        const microtaskRecord = isRecord(microtask) ? microtask : {}
        return {
          id: normalizeNonEmpty(microtaskRecord.id),
          title: normalizeNonEmpty(microtaskRecord.title) ?? `Microtask ${microtaskIndex + 1}`,
          status: normalizeMicrotaskStatusInput(microtaskRecord.status),
          position: parseOptionalInteger(microtaskRecord.position, 'microtask position') ?? microtaskIndex,
          notes: normalizeNonEmpty(microtaskRecord.notes),
          parentIssueId: normalizeNonEmpty(microtaskRecord.parentIssueId),
        }
      }),
    }
  })
}

function summarizeSprintListRecord(sprint: Record<string, unknown>): Record<string, unknown> {
  const phases = cloneSprintPhases(sprint.phases)
  const microtasks = phases.flatMap((phase) => phase.microtasks)
  const openMicrotasks = microtasks.filter((microtask) => !['completed', 'done', 'cancelled'].includes(microtask.status))
  return compactPayload({
    id: normalizeNonEmpty(sprint.id),
    localId: normalizeNonEmpty(sprint.localId),
    remoteId: normalizeNonEmpty(sprint.remoteId),
    name: normalizeNonEmpty(sprint.name),
    status: normalizeNonEmpty(sprint.status),
    kanbanTaskId: normalizeNonEmpty(sprint.kanbanTaskId) ?? normalizeNonEmpty(sprint.kanbanTaskLocalId),
    goal: normalizeNonEmpty(sprint.goal),
    archivedAt: normalizeNonEmpty(sprint.archivedAt),
    archived: isArchiveMarked(sprint),
    phaseCount: phases.length,
    microtaskCount: microtasks.length,
    openMicrotaskCount: openMicrotasks.length,
    syncState: normalizeNonEmpty(sprint.syncState),
    updatedAt: normalizeNonEmpty(sprint.updatedAt),
  })
}

function normalizeAuditToken(value: unknown): string | undefined {
  return normalizeNonEmpty(value)?.toLowerCase().replace(/_/g, '-')
}

function auditTokenMatches(value: unknown, tokens: Set<string>): boolean {
  const normalized = normalizeAuditToken(value)
  if (!normalized) return false
  if (tokens.has(normalized) || tokens.has(normalized.replace(/-/g, '_'))) return true
  const segments = normalized.split(/[^a-z0-9]+/).filter(Boolean)
  return segments.some((segment) => tokens.has(segment)) || [...tokens].some((token) => normalized.endsWith(`-${token}`))
}

function classifyPmTaskColumn(values: unknown[]): PmTaskColumnKind {
  if (values.some((value) => auditTokenMatches(value, PM_STATUS_DONE_TOKENS))) return 'done'
  if (values.some((value) => auditTokenMatches(value, PM_STATUS_DOING_TOKENS))) return 'doing'
  if (values.some((value) => auditTokenMatches(value, new Set(['todo'])))) return 'todo'
  if (values.some((value) => auditTokenMatches(value, new Set(['backlog'])))) return 'backlog'
  return 'other'
}

function parseProgressPercent(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const raw = typeof value === 'string' ? value.trim().replace(/%$/, '') : value
  const parsed = typeof raw === 'number' ? raw : Number.parseFloat(String(raw))
  return Number.isFinite(parsed) ? parsed : undefined
}

function collectRecordAliases(record: Record<string, unknown>, keys: readonly string[]): string[] {
  return uniqueStringValues(keys.map((key) => record[key]))
}

function recordSelectorMatches(
  record: Record<string, unknown>,
  selector: unknown,
  params: {
    idKeys: readonly string[]
    labelKeys?: readonly string[]
  },
): boolean {
  const normalized = normalizeAuditToken(selector)
  if (!normalized) return true

  for (const value of collectRecordAliases(record, params.idKeys)) {
    const candidate = normalizeAuditToken(value)
    if (!candidate) continue
    if (candidate === normalized) return true
    if (normalized.length >= 8 && candidate.startsWith(normalized)) return true
  }

  for (const value of collectRecordAliases(record, params.labelKeys ?? [])) {
    if (normalizeExactLabel(value) === normalized) return true
  }

  return false
}

function firstRecordAlias(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  return collectRecordAliases(record, keys)[0]
}

function normalizeBoardColumnInfo(
  entry: Record<string, unknown>,
  fallbackBoardId?: string,
  boardArchived = false,
): PmStatusAuditColumnInfo {
  const id = normalizeNonEmpty(entry.id) ?? normalizeNonEmpty(entry.boardColumnId) ?? normalizeNonEmpty(entry.columnId)
  const name = normalizeNonEmpty(entry.name) ?? normalizeNonEmpty(entry.columnName) ?? normalizeNonEmpty(entry.title)
  const slug = normalizeNonEmpty(entry.slug) ?? normalizeNonEmpty(entry.columnSlug)
  const boardId = normalizeNonEmpty(entry.boardId) ?? normalizeNonEmpty(entry.boardLocalId) ?? fallbackBoardId
  return compactPayload({
    id,
    boardId,
    name,
    slug,
    archived: boardArchived || isArchiveMarked(entry),
    kind: classifyPmTaskColumn([slug, name, id]),
  }) as PmStatusAuditColumnInfo
}

function buildPmStatusAuditColumnIndex(
  boards: Record<string, unknown>[],
  boardColumnRows: Record<string, unknown>[],
  columnEntities: Record<string, unknown>[] = [],
): Map<string, PmStatusAuditColumnInfo> {
  const index = new Map<string, PmStatusAuditColumnInfo>()
  // issue 0107ec98: board-column rows are link records (boardId, columnId, position)
  // with no name/slug; the column name/slug live on the kanban-column entity. Map
  // columnId -> {name, slug} so a task's column resolves to done/doing/etc. instead
  // of always 'other' (which produced false sprint_completed_task_not_done findings).
  const columnDefById = new Map<string, { name?: string; slug?: string }>()
  for (const column of columnEntities) {
    const id = normalizeAuditToken(firstRecordAlias(column, ['id', 'localId', 'remoteId', 'columnId']))
    if (!id) continue
    columnDefById.set(id, { name: normalizeNonEmpty(column.name), slug: normalizeNonEmpty(column.slug) })
  }
  const enrichColumnRow = (row: Record<string, unknown>): Record<string, unknown> => {
    if (normalizeNonEmpty(row.name) && normalizeNonEmpty(row.slug)) return row
    const columnKey = normalizeAuditToken(firstRecordAlias(row, ['columnId', 'kanbanColumnId', 'column']))
    const def = columnKey ? columnDefById.get(columnKey) : undefined
    if (!def) return row
    return { ...row, name: normalizeNonEmpty(row.name) ?? def.name, slug: normalizeNonEmpty(row.slug) ?? def.slug }
  }
  const archivedBoardAliases = new Set<string>()
  for (const board of boards.filter(isArchiveMarked)) {
    for (const alias of collectRecordAliases(board, ['id', 'localId', 'remoteId', 'boardId', 'slug', 'name'])) {
      const normalized = normalizeAuditToken(alias)
      if (normalized) archivedBoardAliases.add(normalized)
    }
  }
  const addInfo = (boardAliases: string[], info: PmStatusAuditColumnInfo): void => {
    const columnAliases = uniqueStringValues([info.id, info.slug, info.name])
    for (const columnAlias of columnAliases) {
      const normalizedColumn = normalizeAuditToken(columnAlias)
      if (!normalizedColumn) continue
      if (!index.has(`*:${normalizedColumn}`)) index.set(`*:${normalizedColumn}`, info)
      for (const boardAlias of boardAliases) {
        const normalizedBoard = normalizeAuditToken(boardAlias)
        if (normalizedBoard) index.set(`${normalizedBoard}:${normalizedColumn}`, info)
      }
    }
  }

  for (const board of boards) {
    const boardId = firstRecordAlias(board, ['id', 'localId', 'remoteId', 'boardId'])
    const boardAliases = collectRecordAliases(board, ['id', 'localId', 'remoteId', 'boardId', 'slug', 'name'])
    const rawColumns = Array.isArray(board.columns) ? board.columns : []
    for (const rawColumn of rawColumns) {
      const columnRecord = isRecord(rawColumn) ? rawColumn : { name: rawColumn }
      addInfo(boardAliases, normalizeBoardColumnInfo(columnRecord, boardId, isArchiveMarked(board)))
    }
  }

  for (const row of boardColumnRows) {
    const boardAliases = collectRecordAliases(row, ['boardId', 'boardLocalId', 'board', 'boardSlug', 'boardName'])
    const boardArchived = boardAliases
      .map(normalizeAuditToken)
      .filter((entry): entry is string => Boolean(entry))
      .some((entry) => archivedBoardAliases.has(entry))
    const info = normalizeBoardColumnInfo(enrichColumnRow(row), undefined, boardArchived)
    addInfo(boardAliases, info)
  }

  return index
}

function resolvePmStatusTaskColumn(
  task: Record<string, unknown>,
  columnIndex: Map<string, PmStatusAuditColumnInfo>,
): PmStatusAuditColumnInfo {
  const boardAliases = collectRecordAliases(task, ['boardId', 'boardLocalId', 'board', 'boardSlug', 'boardName'])
  const columnAliases = collectRecordAliases(task, [
    'boardColumnId',
    'boardColumn',
    'columnId',
    'column',
    'columnSlug',
    'columnName',
  ])

  for (const boardAlias of boardAliases) {
    const normalizedBoard = normalizeAuditToken(boardAlias)
    if (!normalizedBoard) continue
    for (const columnAlias of columnAliases) {
      const normalizedColumn = normalizeAuditToken(columnAlias)
      const match = normalizedColumn ? columnIndex.get(`${normalizedBoard}:${normalizedColumn}`) : undefined
      if (match) return match
    }
  }

  for (const columnAlias of columnAliases) {
    const normalizedColumn = normalizeAuditToken(columnAlias)
    const match = normalizedColumn ? columnIndex.get(`*:${normalizedColumn}`) : undefined
    if (match) return match
  }

  const fallback = normalizeBoardColumnInfo({
    id: normalizeNonEmpty(task.boardColumnId) ?? normalizeNonEmpty(task.columnId),
    name: normalizeNonEmpty(task.columnName),
    slug: normalizeNonEmpty(task.columnSlug),
    boardId: normalizeNonEmpty(task.boardId) ?? normalizeNonEmpty(task.boardLocalId),
  })
  if (fallback.kind !== 'other') return fallback

  return {
    ...fallback,
    kind: classifyPmTaskColumn([task.status, task.workflowStatus]),
  }
}

function summarizePmStatusTask(
  task: Record<string, unknown>,
  columnIndex: Map<string, PmStatusAuditColumnInfo>,
): PmStatusAuditTaskSummary | null {
  const id = firstRecordAlias(task, ['id', 'localId', 'remoteId'])
  if (!id) return null
  const column = resolvePmStatusTaskColumn(task, columnIndex)
  const status = normalizeNonEmpty(task.status) ?? normalizeNonEmpty(task.workflowStatus)
  const progress = parseProgressPercent(task.progress)
  const isDone = column.kind === 'done' || auditTokenMatches(status, PM_STATUS_DONE_TOKENS)
  const isDoing = column.kind === 'doing' || auditTokenMatches(status, PM_STATUS_DOING_TOKENS)
  return {
    id,
    title: normalizeNonEmpty(task.title) ?? normalizeNonEmpty(task.name),
    status,
    progress,
    boardId: normalizeNonEmpty(task.boardId) ?? normalizeNonEmpty(task.boardLocalId),
    column,
    archived: column.archived === true,
    isDone,
    isDoing,
  }
}

function summarizePmStatusSprint(sprint: Record<string, unknown>): PmStatusAuditSprintSummary | null {
  const id = firstRecordAlias(sprint, ['id', 'localId', 'remoteId'])
  if (!id) return null
  const phases = cloneSprintPhases(sprint.phases)
  const microtasks = phases.flatMap((phase) => phase.microtasks)
  const completedMicrotaskCount = microtasks.filter((microtask) => PM_STATUS_COMPLETED_STATUSES.has(microtask.status)).length
  const openMicrotaskCount = microtasks.filter((microtask) => !PM_STATUS_TERMINAL_MICROTASK_STATUSES.has(microtask.status)).length
  const status = normalizeNonEmpty(sprint.status)?.toLowerCase()
  const isCompleted = status ? PM_STATUS_COMPLETED_STATUSES.has(status) : false
  const isTerminal = status ? PM_STATUS_TERMINAL_SPRINT_STATUSES.has(status) : false
  const computedProgress = microtasks.length > 0
    ? Math.round((completedMicrotaskCount / microtasks.length) * 100)
    : isCompleted
      ? 100
      : 0

  return {
    id,
    name: normalizeNonEmpty(sprint.name) ?? normalizeNonEmpty(sprint.title),
    status,
    taskId: firstRecordAlias(sprint, ['kanbanTaskId', 'kanbanTaskLocalId', 'kanbanTask', 'taskId', 'taskLocalId']),
    microtaskCount: microtasks.length,
    completedMicrotaskCount,
    openMicrotaskCount,
    computedProgress,
    archived: isArchiveMarked(sprint),
    isCompleted,
    isTerminal,
    isOpenForCompletion: !isCompleted || openMicrotaskCount > 0,
  }
}

function publicPmStatusTaskSummary(task: PmStatusAuditTaskSummary): Record<string, unknown> {
  return compactPayload({
    id: task.id,
    title: task.title,
    status: task.status,
    progress: task.progress,
    boardId: task.boardId,
    column: task.column,
    archived: task.archived,
  })
}

function publicPmStatusSprintSummary(sprint: PmStatusAuditSprintSummary): Record<string, unknown> {
  return compactPayload({
    id: sprint.id,
    name: sprint.name,
    status: sprint.status,
    taskId: sprint.taskId,
    microtaskCount: sprint.microtaskCount,
    completedMicrotaskCount: sprint.completedMicrotaskCount,
    openMicrotaskCount: sprint.openMicrotaskCount,
    computedProgress: sprint.computedProgress,
    archived: sprint.archived,
  })
}

function pmStatusTaskMatchesBoard(
  rawTask: Record<string, unknown>,
  task: PmStatusAuditTaskSummary,
  filters: { board?: string; boardId?: string },
): boolean {
  if (!filters.board && !filters.boardId) return true
  const selectors = uniqueStringValues([filters.board, filters.boardId])
  const taskBoardAliases = uniqueStringValues([
    ...collectRecordAliases(rawTask, ['boardId', 'boardLocalId', 'board', 'boardSlug', 'boardName']),
    task.boardId,
    task.column?.boardId,
  ]).map((entry) => normalizeAuditToken(entry)).filter((entry): entry is string => Boolean(entry))

  return selectors
    .map(normalizeAuditToken)
    .filter((entry): entry is string => Boolean(entry))
    .some((selector) =>
      taskBoardAliases.some((alias) =>
        alias === selector ||
        (selector.length >= 8 && alias.startsWith(selector)) ||
        (alias.length >= 8 && selector.startsWith(alias)),
      ),
    )
}

function addUniqueSprintForTask(
  sprintsByTaskId: Map<string, PmStatusAuditSprintSummary[]>,
  taskId: string,
  sprint: PmStatusAuditSprintSummary,
): void {
  const current = sprintsByTaskId.get(taskId) ?? []
  if (!current.some((entry) => entry.id === sprint.id)) current.push(sprint)
  sprintsByTaskId.set(taskId, current)
}

function addUniqueSprintSummary(target: PmStatusAuditSprintSummary[], sprint: PmStatusAuditSprintSummary): void {
  if (!target.some((entry) => entry.id === sprint.id)) target.push(sprint)
}

function collectPmStatusLinkedSprintsForTask(
  rawTask: Record<string, unknown>,
  task: PmStatusAuditTaskSummary,
  sprints: Record<string, unknown>[],
): PmStatusAuditSprintSummary[] {
  const taskAliases = new Set(
    uniqueStringValues([
      task.id,
      ...collectRecordAliases(rawTask, ['id', 'localId', 'remoteId', 'slug', 'title', 'name']),
    ]).map((entry) => normalizeAuditToken(entry)).filter((entry): entry is string => Boolean(entry)),
  )
  const explicitSprintAliases = new Set(
    collectRecordAliases(rawTask, ['sprintId', 'sprintLocalId', 'activeSprintId'])
      .map((entry) => normalizeAuditToken(entry))
      .filter((entry): entry is string => Boolean(entry)),
  )
  const linked: PmStatusAuditSprintSummary[] = []

  for (const rawSprint of sprints) {
    const sprint = summarizePmStatusSprint(rawSprint)
    if (!sprint) continue
    const sprintAliases = collectRecordAliases(rawSprint, ['id', 'localId', 'remoteId', 'slug', 'name', 'title'])
      .map((entry) => normalizeAuditToken(entry))
      .filter((entry): entry is string => Boolean(entry))
    if (sprintAliases.some((alias) => explicitSprintAliases.has(alias))) {
      addUniqueSprintSummary(linked, sprint)
      continue
    }

    const sprintTaskAliases = collectRecordAliases(rawSprint, ['kanbanTaskId', 'kanbanTaskLocalId', 'kanbanTask', 'taskId', 'taskLocalId'])
      .map((entry) => normalizeAuditToken(entry))
      .filter((entry): entry is string => Boolean(entry))
    if (sprintTaskAliases.some((alias) => taskAliases.has(alias))) {
      addUniqueSprintSummary(linked, sprint)
    }
  }

  return linked
}

async function readPmStatusHintContext(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  params: { boardId?: string } = {},
): Promise<PmStatusHintContext> {
  const taskInput: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext)
  const sprintInput: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext)
  const [taskPayload, sprintPayload, boards] = await Promise.all([
    invokeProjectmanReadTool(execution, options, {
      toolId: 'projectman.kanban-task.list',
      input: taskInput,
    }),
    invokeProjectmanReadTool(execution, options, {
      toolId: 'projectman.sprint.list',
      input: sprintInput,
    }),
    listProjectmanBoards(execution, options),
  ])

  // issue 0107ec98: kanban-board-column.list only returns the correct rows when
  // filtered by a board ID — a slug or an empty filter returns an incomplete set,
  // so the task's column row was missing from the index and fell back to 'other'.
  // Resolve the target board(s) from the already-fetched board list and fetch each
  // board's columns by its id.
  const selectorBoards = params.boardId
    ? boards.filter((board) =>
        recordSelectorMatches(board, params.boardId, {
          idKeys: ['id', 'localId', 'remoteId', 'boardId'],
          labelKeys: ['slug', 'name'],
        }),
      )
    : boards
  const targetBoards = selectorBoards.length > 0 ? selectorBoards : boards
  const boardColumnRows: Record<string, unknown>[] = []
  for (const board of targetBoards) {
    const boardId = firstRecordAlias(board, ['id', 'localId', 'remoteId', 'boardId'])
    if (!boardId) continue
    try {
      const boardColumnPayload = await invokeProjectmanReadTool(execution, options, {
        toolId: 'projectman.kanban-board-column.list',
        input: { board: boardId },
      })
      boardColumnRows.push(...toRecordArray(unwrapHostedToolResult(boardColumnPayload)))
    } catch {
      // Skip this board's columns; the audit degrades gracefully.
    }
  }

  // issue 0107ec98: fetch kanban-column entities so board-column link rows can be
  // enriched with the column name/slug (link rows carry only columnId).
  let columnEntities: Record<string, unknown>[] = []
  try {
    const columnPayload = await invokeProjectmanReadTool(execution, options, {
      toolId: 'projectman.kanban-column.list',
      input: buildOwnerScopedInput(execution.resolvedContext),
    })
    columnEntities = toRecordArray(unwrapHostedToolResult(columnPayload))
  } catch {
    columnEntities = []
  }

  return {
    tasks: toRecordArray(unwrapHostedToolResult(taskPayload)),
    sprints: toRecordArray(unwrapHostedToolResult(sprintPayload)),
    columnIndex: buildPmStatusAuditColumnIndex(boards, boardColumnRows, columnEntities),
  }
}

function replacePmStatusSprintRecord(
  sprints: Record<string, unknown>[],
  projectedSprint: Record<string, unknown>,
): Record<string, unknown>[] {
  const projectedId = firstRecordAlias(projectedSprint, ['id', 'localId', 'remoteId'])
  if (!projectedId) return [...sprints, projectedSprint]

  let replaced = false
  const next = sprints.map((entry) => {
    const entryId = firstRecordAlias(entry, ['id', 'localId', 'remoteId'])
    if (entryId === projectedId) {
      replaced = true
      return projectedSprint
    }
    return entry
  })
  if (!replaced) next.push(projectedSprint)
  return next
}

function findPmStatusTaskForSprint(
  tasks: Record<string, unknown>[],
  columnIndex: Map<string, PmStatusAuditColumnInfo>,
  rawSprint: Record<string, unknown>,
  sprint: PmStatusAuditSprintSummary,
): { rawTask: Record<string, unknown>; task: PmStatusAuditTaskSummary } | undefined {
  for (const rawTask of tasks) {
    const task = summarizePmStatusTask(rawTask, columnIndex)
    if (!task) continue
    const linkedSprints = collectPmStatusLinkedSprintsForTask(rawTask, task, [rawSprint])
    if (linkedSprints.some((entry) => entry.id === sprint.id)) {
      return { rawTask, task }
    }
  }

  const sprintTaskAliases = collectRecordAliases(rawSprint, ['kanbanTaskId', 'kanbanTaskLocalId', 'kanbanTask', 'taskId', 'taskLocalId'])
    .map((entry) => normalizeAuditToken(entry))
    .filter((entry): entry is string => Boolean(entry))
  if (sprintTaskAliases.length === 0) return undefined

  for (const rawTask of tasks) {
    const task = summarizePmStatusTask(rawTask, columnIndex)
    if (!task) continue
    const taskAliases = uniqueStringValues([
      task.id,
      ...collectRecordAliases(rawTask, ['id', 'localId', 'remoteId', 'slug', 'title', 'name']),
    ])
      .map((entry) => normalizeAuditToken(entry))
      .filter((entry): entry is string => Boolean(entry))
    if (taskAliases.some((alias) => sprintTaskAliases.includes(alias))) {
      return { rawTask, task }
    }
  }

  return undefined
}

function buildStatusHintUnavailable(error: unknown): Record<string, unknown> {
  const message = error instanceof Error ? error.message : String(error)
  return {
    class: 'status_hint_unavailable',
    severity: 'info',
    message: 'Could not inspect linked PM completion evidence for a status hint; the requested status change was not blocked.',
    error: message,
  }
}

async function buildTaskDoneStatusHint(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  params: {
    rawTask: Record<string, unknown>
    targetStatus: string
    boardId?: string
  },
): Promise<Record<string, unknown> | undefined> {
  if (!isDoneLikeKanbanTaskStatusInput(params.targetStatus)) return undefined

  try {
    const context = await readPmStatusHintContext(execution, options, { boardId: params.boardId })
    const task = summarizePmStatusTask(params.rawTask, context.columnIndex)
    if (!task) return undefined
    const linkedSprints = collectPmStatusLinkedSprintsForTask(params.rawTask, task, context.sprints)
    const openSprints = linkedSprints.filter((sprint) => sprint.isOpenForCompletion)
    if (openSprints.length === 0) return undefined

    return {
      class: 'task_done_sprint_open',
      severity: 'warning',
      action: 'task_to_done',
      message: 'Task is being moved to Done while linked sprint or microtask work remains open. No sprint or microtask status was auto-updated.',
      suggestion: 'Finish the linked sprint work first, or keep the task out of Done until the open sprint evidence is resolved.',
      task: publicPmStatusTaskSummary(task),
      linkedSprints: openSprints.map(publicPmStatusSprintSummary),
      guard: {
        linkedSprintCount: linkedSprints.length,
        openSprintCount: openSprints.length,
        noAutoSprintUpdate: true,
      },
    }
  } catch (error) {
    return buildStatusHintUnavailable(error)
  }
}

async function buildSprintCompletedStatusHint(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  params: {
    rawSprint: Record<string, unknown>
    targetStatus: string
    boardId?: string
  },
): Promise<Record<string, unknown> | undefined> {
  if (!PM_STATUS_COMPLETED_STATUSES.has(params.targetStatus)) return undefined

  try {
    const context = await readPmStatusHintContext(execution, options, { boardId: params.boardId })
    const projectedSprint = summarizePmStatusSprint(params.rawSprint)
    if (!projectedSprint) return undefined

    const linkedTask = findPmStatusTaskForSprint(context.tasks, context.columnIndex, params.rawSprint, projectedSprint)
    if (!linkedTask || linkedTask.task.isDone) return undefined

    const projectedSprints = replacePmStatusSprintRecord(context.sprints, params.rawSprint)
    const linkedSprints = collectPmStatusLinkedSprintsForTask(linkedTask.rawTask, linkedTask.task, projectedSprints)
    const completedSprints = linkedSprints.filter((sprint) => sprint.isCompleted && sprint.openMicrotaskCount === 0)
    const openSprints = linkedSprints.filter((sprint) => sprint.isOpenForCompletion)
    const allLinkedSprintsComplete =
      linkedSprints.length > 0 &&
      linkedSprints.every((sprint) => sprint.isCompleted && sprint.openMicrotaskCount === 0)
    if (!allLinkedSprintsComplete) return undefined

    return {
      class: 'sprint_completed_task_not_done',
      severity: 'info',
      action: 'task_done_eligible',
      message: 'All linked sprint evidence is complete while the kanban task is not Done. The task may be eligible for explicit guarded reconcile.',
      suggestion: 'Use pm status reconcile --task <task-id> to preview the task-to-Done move, then --apply only if the guard passes.',
      task: publicPmStatusTaskSummary(linkedTask.task),
      sprint: publicPmStatusSprintSummary(projectedSprint),
      linkedSprints: completedSprints.map(publicPmStatusSprintSummary),
      guard: {
        linkedSprintCount: linkedSprints.length,
        completedSprintCount: completedSprints.length,
        openSprintCount: openSprints.length,
        allLinkedSprintsComplete,
        noAutoTaskUpdate: true,
      },
    }
  } catch (error) {
    return buildStatusHintUnavailable(error)
  }
}

function selectSinglePmStatusTask(
  tasks: Record<string, unknown>[],
  columnIndex: Map<string, PmStatusAuditColumnInfo>,
  filters: { board?: string; boardId?: string; task?: string },
): { rawTask: Record<string, unknown>; task: PmStatusAuditTaskSummary } {
  const taskSelector = normalizeNonEmpty(filters.task)
  if (!taskSelector) {
    throw new Error('Missing required --task. Reconcile is item-scoped; board-wide/bulk mutation is not supported.')
  }

  const matches = tasks
    .map((rawTask) => ({ rawTask, task: summarizePmStatusTask(rawTask, columnIndex) }))
    .filter((entry): entry is { rawTask: Record<string, unknown>; task: PmStatusAuditTaskSummary } => Boolean(entry.task))
    .filter((entry) =>
      pmStatusTaskMatchesBoard(entry.rawTask, entry.task, filters) &&
      recordSelectorMatches(entry.rawTask, taskSelector, {
        idKeys: ['id', 'localId', 'remoteId', 'slug'],
        labelKeys: ['title', 'name'],
      }),
    )

  if (matches.length === 0) {
    throw new Error(`Task "${taskSelector}" was not found in the selected PM status scope.`)
  }
  if (matches.length > 1) {
    const candidates = matches
      .map((entry) => `${entry.task.title ?? '(untitled)'} (${entry.task.id})`)
      .join(', ')
    throw new Error(`Task "${taskSelector}" is ambiguous. Candidates: ${candidates}.`)
  }

  return matches[0]
}

function buildPmStatusReconcilePreview(params: {
  task: PmStatusAuditTaskSummary
  linkedSprints: PmStatusAuditSprintSummary[]
  targetColumn?: ResolvedReference
  apply: boolean
  preview: boolean
}): Record<string, unknown> {
  const archivedSprints = params.linkedSprints.filter((sprint) => sprint.archived)
  const activeLinkedSprints = params.linkedSprints.filter((sprint) => !sprint.archived)
  const archiveBlocked = params.task.archived || archivedSprints.length > 0
  const completedSprints = activeLinkedSprints.filter((sprint) => sprint.isCompleted && sprint.openMicrotaskCount === 0)
  const openSprints = activeLinkedSprints.filter((sprint) => sprint.isOpenForCompletion)
  const allLinkedSprintsComplete =
    activeLinkedSprints.length > 0 &&
    activeLinkedSprints.every((sprint) => sprint.isCompleted && sprint.openMicrotaskCount === 0)
  const moveToDoneEligible = !archiveBlocked && !params.task.isDone && allLinkedSprintsComplete
  // issue 06d57e0a: an already-Done task can still carry a stale progress (<100).
  // Reconcile should normalize it to 100 instead of refusing it as "already done".
  const progressNumber = typeof params.task.progress === 'number' ? params.task.progress : undefined
  const progressNormalizeEligible =
    !archiveBlocked && params.task.isDone && progressNumber !== undefined && progressNumber < 100
  const eligible = moveToDoneEligible || progressNormalizeEligible
  const action = moveToDoneEligible
    ? 'task_to_done'
    : progressNormalizeEligible
      ? 'normalize_progress'
      : 'task_to_done'
  const refusalReason = eligible
    ? undefined
    : archiveBlocked
      ? 'archived_record'
      : openSprints.length > 0
      ? 'linked_sprint_open'
      : activeLinkedSprints.length === 0 && !params.task.isDone
        ? 'no_linked_sprint_evidence'
        : params.task.isDone
          ? 'task_already_done_or_done_like'
          : !allLinkedSprintsComplete
            ? 'multi_sprint_guard_not_satisfied'
            : undefined

  return {
    ok: params.preview || eligible,
    preview: params.preview,
    applyRequested: params.apply,
    applied: false,
    eligible,
    refused: params.apply && !params.preview && !eligible,
    refusalReason,
    action,
    task: publicPmStatusTaskSummary(params.task),
    linkedSprints: params.linkedSprints.map(publicPmStatusSprintSummary),
    guard: {
      itemScoped: true,
      bulkMutation: false,
      linkedSprintCount: params.linkedSprints.length,
      activeLinkedSprintCount: activeLinkedSprints.length,
      archivedLinkedSprintCount: archivedSprints.length,
      completedSprintCount: completedSprints.length,
      openSprintCount: openSprints.length,
      allLinkedSprintsComplete,
      archivedRecordBlocked: archiveBlocked,
      noAutoReconcileArchived: archiveBlocked,
      requiresExplicitApply: true,
    },
    plannedActions: moveToDoneEligible
      ? [
          compactPayload({
            type: 'kanban-task.move-to-done',
            taskId: params.task.id,
            targetColumnId: params.targetColumn?.id,
            targetColumnLabel: params.targetColumn?.label,
            progress: 100,
          }),
        ]
      : progressNormalizeEligible
        ? [
            compactPayload({
              type: 'kanban-task.normalize-progress',
              taskId: params.task.id,
              progress: 100,
              fromProgress: progressNumber,
            }),
          ]
        : [],
  }
}

function incrementAuditClassCount(
  byClass: Record<string, number>,
  className: PmStatusAuditClass,
): void {
  byClass[className] = (byClass[className] ?? 0) + 1
}

function pushAuditFinding(
  findings: PmStatusAuditFinding[],
  finding: PmStatusAuditFinding,
): void {
  const taskId = normalizeNonEmpty(finding.task?.id)
  const sprintIds = uniqueStringValues([
    finding.sprint?.id,
    ...(finding.sprints ?? []).map((sprint) => sprint.id),
  ]).join(',')
  const key = `${finding.class}:${taskId ?? ''}:${sprintIds}:${finding.message}`
  const existing = findings.some((entry) => {
    const entryTaskId = normalizeNonEmpty(entry.task?.id)
    const entrySprintIds = uniqueStringValues([
      entry.sprint?.id,
      ...(entry.sprints ?? []).map((sprint) => sprint.id),
    ]).join(',')
    return `${entry.class}:${entryTaskId ?? ''}:${entrySprintIds}:${entry.message}` === key
  })
  if (!existing) findings.push(finding)
}

// Single source of truth for the sprint_progress_status_mismatch drift condition.
// Used by both the sprint-drift finding and the stale_review_candidate exclusion so the
// advisory never co-fires with a sprint drift class (feedback 844e881a, S2 re-review).
function sprintHasProgressStatusDrift(
  sprint: PmStatusAuditSprintSummary,
  rawSprints: Record<string, unknown>[],
): boolean {
  const storedProgress = parseProgressPercent(
    rawSprints.find((raw) => firstRecordAlias(raw, ['id', 'localId', 'remoteId']) === sprint.id)?.progress,
  )
  const completedWithOpenWork = sprint.isCompleted && sprint.openMicrotaskCount > 0
  const nonCompletedWithNoOpenWork = !sprint.isCompleted && sprint.microtaskCount > 0 && sprint.openMicrotaskCount === 0
  const storedProgressMismatch =
    storedProgress !== undefined &&
    ((sprint.isCompleted && storedProgress < 100) || (!sprint.isCompleted && storedProgress >= 100))
  return completedWithOpenWork || nonCompletedWithNoOpenWork || storedProgressMismatch
}

function isNonTerminalArchivedSprint(sprint: PmStatusAuditSprintSummary): boolean {
  return sprint.archived && (!sprint.isTerminal || sprint.openMicrotaskCount > 0)
}

function pushArchivedNonterminalFinding(
  findings: PmStatusAuditFinding[],
  params: {
    task?: PmStatusAuditTaskSummary
    sprint?: PmStatusAuditSprintSummary
    source: 'board' | 'sprint'
  },
): void {
  pushAuditFinding(findings, {
    class: 'archived_nonterminal',
    severity: 'info',
    task: params.task ? publicPmStatusTaskSummary(params.task) : undefined,
    sprint: params.sprint ? publicPmStatusSprintSummary(params.sprint) : undefined,
    message: params.source === 'board'
      ? 'Archived board contains non-terminal task work hidden from active PM surfaces.'
      : 'Archived sprint contains non-terminal work hidden from active PM surfaces.',
    suggestion: 'Advisory only: restore the record to active before reconciling, or leave it archived as an intentional visibility exception.',
    evidence: compactPayload({
      advisory: true,
      doneEligible: false,
      noAutoReconcile: true,
      archiveSource: params.source,
      archived: true,
      openMicrotaskCount: params.sprint?.openMicrotaskCount,
      microtaskCount: params.sprint?.microtaskCount,
    }),
  })
}

function summarizePmStatusAudit(
  tasks: Record<string, unknown>[],
  sprints: Record<string, unknown>[],
  columnIndex: Map<string, PmStatusAuditColumnInfo>,
  filters: { board?: string; boardId?: string; task?: string; sprint?: string },
  nowMs: number = Date.now(),
): Record<string, unknown> {
  const taskSummaries = tasks
    .map((task) => summarizePmStatusTask(task, columnIndex))
    .filter((task): task is PmStatusAuditTaskSummary => Boolean(task))
  const sprintSummaries = sprints
    .map(summarizePmStatusSprint)
    .filter((sprint): sprint is PmStatusAuditSprintSummary => Boolean(sprint))

  const taskByAlias = new Map<string, PmStatusAuditTaskSummary>()
  const taskById = new Map<string, PmStatusAuditTaskSummary>()
  for (const task of taskSummaries) {
    taskById.set(task.id, task)
  }
  for (const rawTask of tasks) {
    const task = summarizePmStatusTask(rawTask, columnIndex)
    if (!task) continue
    for (const alias of collectRecordAliases(rawTask, ['id', 'localId', 'remoteId', 'slug', 'title', 'name'])) {
      const normalized = normalizeAuditToken(alias)
      if (normalized) taskByAlias.set(normalized, task)
    }
  }

  const sprintByAlias = new Map<string, PmStatusAuditSprintSummary>()
  for (const rawSprint of sprints) {
    const sprint = summarizePmStatusSprint(rawSprint)
    if (!sprint) continue
    for (const alias of collectRecordAliases(rawSprint, ['id', 'localId', 'remoteId', 'slug', 'name', 'title'])) {
      const normalized = normalizeAuditToken(alias)
      if (normalized) sprintByAlias.set(normalized, sprint)
    }
  }

  const sprintsByTaskId = new Map<string, PmStatusAuditSprintSummary[]>()
  const taskBySprintId = new Map<string, PmStatusAuditTaskSummary>()

  for (const rawSprint of sprints) {
    const sprint = summarizePmStatusSprint(rawSprint)
    if (!sprint) continue
    const linkedAliases = collectRecordAliases(rawSprint, ['kanbanTaskId', 'kanbanTaskLocalId', 'kanbanTask', 'taskId', 'taskLocalId'])
    const linkedTask = linkedAliases
      .map((alias) => taskByAlias.get(normalizeAuditToken(alias) ?? ''))
      .find(Boolean)
    if (linkedTask) {
      addUniqueSprintForTask(sprintsByTaskId, linkedTask.id, sprint)
      taskBySprintId.set(sprint.id, linkedTask)
    }
  }

  for (const rawTask of tasks) {
    const task = summarizePmStatusTask(rawTask, columnIndex)
    if (!task) continue
    const linkedAliases = collectRecordAliases(rawTask, ['sprintId', 'sprintLocalId', 'activeSprintId'])
    for (const linkedAlias of linkedAliases) {
      const sprint = sprintByAlias.get(normalizeAuditToken(linkedAlias) ?? '')
      if (sprint) {
        addUniqueSprintForTask(sprintsByTaskId, task.id, sprint)
        taskBySprintId.set(sprint.id, task)
      }
    }
  }

  let selectedTaskIds = new Set(
    taskSummaries
      .filter((task) => {
        const raw = tasks.find((candidate) => firstRecordAlias(candidate, ['id', 'localId', 'remoteId']) === task.id) ?? {}
        return (
          pmStatusTaskMatchesBoard(raw, task, filters) &&
          recordSelectorMatches(raw, filters.task, {
            idKeys: ['id', 'localId', 'remoteId', 'slug'],
            labelKeys: ['title', 'name'],
          })
        )
      })
      .map((task) => task.id),
  )
  let selectedSprintIds = new Set(
    sprintSummaries
      .filter((sprint) => {
        const raw = sprints.find((candidate) => firstRecordAlias(candidate, ['id', 'localId', 'remoteId']) === sprint.id) ?? {}
        return recordSelectorMatches(raw, filters.sprint, {
          idKeys: ['id', 'localId', 'remoteId', 'slug'],
          labelKeys: ['name', 'title'],
        })
      })
      .map((sprint) => sprint.id),
  )

  if (filters.board || filters.task) {
    const linkedSprintIds = new Set<string>()
    for (const taskId of selectedTaskIds) {
      for (const sprint of sprintsByTaskId.get(taskId) ?? []) linkedSprintIds.add(sprint.id)
    }
    selectedSprintIds = new Set([...selectedSprintIds].filter((sprintId) => linkedSprintIds.has(sprintId)))
  }

  if (filters.sprint && !filters.task && !filters.board) {
    const linkedTaskIds = new Set<string>()
    for (const sprintId of selectedSprintIds) {
      const linkedTask = taskBySprintId.get(sprintId)
      if (linkedTask) linkedTaskIds.add(linkedTask.id)
    }
    if (linkedTaskIds.size > 0) selectedTaskIds = linkedTaskIds
  }

  const findings: PmStatusAuditFinding[] = []

  for (const task of taskSummaries.filter((entry) => selectedTaskIds.has(entry.id))) {
    const linkedSprints = (sprintsByTaskId.get(task.id) ?? []).filter((sprint) => selectedSprintIds.has(sprint.id))
    const activeLinkedSprints = linkedSprints.filter((sprint) => !sprint.archived)
    const archivedLinkedSprints = linkedSprints.filter((sprint) => sprint.archived)

    if (task.archived) {
      if (!task.isDone) {
        pushArchivedNonterminalFinding(findings, {
          task,
          source: 'board',
        })
      }
      continue
    }

    const openSprints = activeLinkedSprints.filter((sprint) => sprint.isOpenForCompletion)
    const completedSprints = activeLinkedSprints.filter((sprint) => sprint.isCompleted && sprint.openMicrotaskCount === 0)
    const allLinkedSprintsComplete =
      activeLinkedSprints.length > 0 &&
      activeLinkedSprints.every((sprint) => sprint.isCompleted && sprint.openMicrotaskCount === 0)

    if (task.isDone && openSprints.length > 0) {
      pushAuditFinding(findings, {
        class: 'task_done_sprint_open',
        severity: 'warning',
        task: publicPmStatusTaskSummary(task),
        sprints: openSprints.map(publicPmStatusSprintSummary),
        message: 'Task is done-like, but at least one linked sprint is not complete.',
        suggestion: 'Reopen the task or finish the linked sprint before treating the task as complete.',
        evidence: {
          openSprintCount: openSprints.length,
        },
      })
    }

    if (!task.isDone && completedSprints.length > 0) {
      pushAuditFinding(findings, {
        class: 'sprint_completed_task_not_done',
        severity: allLinkedSprintsComplete ? 'warning' : 'info',
        task: publicPmStatusTaskSummary(task),
        sprints: completedSprints.map(publicPmStatusSprintSummary),
        message: 'A linked sprint is complete, but the task is not in a done-like column.',
        suggestion: allLinkedSprintsComplete
          ? 'The task may be eligible for an explicit guarded reconcile to Done.'
          : 'Do not auto-close the task until every linked sprint is complete.',
        evidence: {
          doneEligible: allLinkedSprintsComplete,
          linkedSprintCount: activeLinkedSprints.length,
          archivedLinkedSprintCount: archivedLinkedSprints.length,
          completedSprintCount: completedSprints.length,
        },
      })
    }

    if ((task.isDone && task.progress !== undefined && task.progress < 100) || (!task.isDone && task.progress !== undefined && task.progress >= 100)) {
      pushAuditFinding(findings, {
        class: 'task_progress_status_mismatch',
        severity: 'warning',
        task: publicPmStatusTaskSummary(task),
        message: 'Task progress and kanban column disagree.',
        suggestion: 'Align task progress with the workflow column through an explicit guarded update.',
        evidence: {
          doneLike: task.isDone,
          progress: task.progress,
        },
      })
    }

    if (task.isDoing && completedSprints.length > 0) {
      pushAuditFinding(findings, {
        class: 'stale_doing_with_terminal_sprint',
        severity: allLinkedSprintsComplete ? 'warning' : 'info',
        task: publicPmStatusTaskSummary(task),
        sprints: completedSprints.map(publicPmStatusSprintSummary),
        message: 'Task is still doing while linked sprint completion evidence is terminal.',
        suggestion: allLinkedSprintsComplete
          ? 'Consider explicit guarded reconcile if no sibling sprint remains open.'
          : 'Inspect sibling sprints before moving the task.',
        evidence: {
          doneEligible: allLinkedSprintsComplete,
        },
      })
    }

    // feedback 844e881a (S2 re-review): both-stale advisory. Fires ONLY when there is no
    // existing task/sprint drift (so it never co-fires with another class) and every linked
    // sprint is genuinely in-progress (not completed, has open work). Age-gated; never
    // reconcile-eligible.
    // Genuinely in-progress = NON-TERMINAL (not completed/done/closed/cancelled) with open work.
    // !isTerminal (not just !isCompleted) so closed/cancelled sprints never count as in-progress (S2 re-review 67af489b).
    const inProgressLinkedSprints = activeLinkedSprints.filter((sprint) => !sprint.isTerminal && sprint.openMicrotaskCount > 0)
    const taskHasProgressDrift = typeof task.progress === 'number' && task.progress >= 100
    const linkedSprintsAllInProgressNoDrift =
      activeLinkedSprints.length > 0 &&
      inProgressLinkedSprints.length === activeLinkedSprints.length &&
      !activeLinkedSprints.some((sprint) => sprintHasProgressStatusDrift(sprint, sprints))
    if (!task.isDone && !taskHasProgressDrift && linkedSprintsAllInProgressNoDrift) {
      const rawTask = tasks.find((entry) => firstRecordAlias(entry, ['id', 'localId', 'remoteId']) === task.id)
      const activityValues = [
        normalizeNonEmpty(rawTask?.updatedAt),
        ...inProgressLinkedSprints.map((sprint) =>
          normalizeNonEmpty(
            sprints.find((entry) => firstRecordAlias(entry, ['id', 'localId', 'remoteId']) === sprint.id)?.updatedAt,
          ),
        ),
      ]
      const latestActivityMs = activityValues
        .map((value) => (value ? Date.parse(value) : Number.NaN))
        .filter((value) => Number.isFinite(value))
        .reduce((max, value) => (value > max ? value : max), Number.NEGATIVE_INFINITY)
      if (Number.isFinite(latestActivityMs) && nowMs - latestActivityMs > PM_STATUS_STALE_REVIEW_THRESHOLD_MS) {
        pushAuditFinding(findings, {
          class: 'stale_review_candidate',
          severity: 'warning',
          task: publicPmStatusTaskSummary(task),
          sprints: inProgressLinkedSprints.map(publicPmStatusSprintSummary),
          message: 'Task and linked sprint are both non-terminal with no recent activity; likely finished-but-unclosed work.',
          suggestion: 'Advisory only: inspect and close/reconcile or update the records manually. Not auto-eligible for reconcile.',
          evidence: {
            doneEligible: false,
            advisory: true,
            staleThresholdDays: PM_STATUS_STALE_REVIEW_THRESHOLD_DAYS,
            lastActivityAt: new Date(latestActivityMs).toISOString(),
            inactiveDays: Math.floor((nowMs - latestActivityMs) / (24 * 60 * 60 * 1000)),
          },
        })
      }
    }
  }

  for (const sprint of sprintSummaries.filter((entry) => selectedSprintIds.has(entry.id))) {
    if (sprint.archived) {
      if (isNonTerminalArchivedSprint(sprint)) {
        pushArchivedNonterminalFinding(findings, {
          sprint,
          source: 'sprint',
        })
      }
      continue
    }

    if (sprintHasProgressStatusDrift(sprint, sprints)) {
      const storedProgress = parseProgressPercent(sprints.find((raw) => firstRecordAlias(raw, ['id', 'localId', 'remoteId']) === sprint.id)?.progress)
      const linkedTask = taskBySprintId.get(sprint.id)
      pushAuditFinding(findings, {
        class: 'sprint_progress_status_mismatch',
        severity: 'warning',
        task: linkedTask ? publicPmStatusTaskSummary(linkedTask) : undefined,
        sprint: publicPmStatusSprintSummary(sprint),
        message: 'Sprint status and nested microtask completion evidence disagree.',
        suggestion: 'Align sprint status after reviewing nested microtask statuses.',
        evidence: compactPayload({
          status: sprint.status,
          computedProgress: sprint.computedProgress,
          storedProgress,
          openMicrotaskCount: sprint.openMicrotaskCount,
          microtaskCount: sprint.microtaskCount,
        }),
      })
    }
  }

  const byClass: Record<string, number> = Object.fromEntries(
    PM_STATUS_AUDIT_CLASS_DEFINITIONS.map((definition) => [definition.class, 0]),
  )
  for (const finding of findings) incrementAuditClassCount(byClass, finding.class)

  return {
    ok: true,
    readOnly: true,
    summary: {
      findingCount: findings.length,
      hasFindings: findings.length > 0,
      tasksAudited: selectedTaskIds.size,
      sprintsAudited: selectedSprintIds.size,
      byClass,
    },
    filters: compactPayload({
      board: filters.board,
      task: filters.task,
      sprint: filters.sprint,
    }),
    taxonomy: PM_STATUS_AUDIT_CLASS_DEFINITIONS.map((definition) => ({ ...definition })),
    reviewAudit: {
      enabled: false,
      class: 'review_approved_pm_nonterminal',
      reason: 'Slice 1 audits PM task/sprint entities only; review-result correlation is reserved for a later explicit read path.',
    },
    findings,
  }
}

function truncateAuditCell(value: unknown, width: number): string {
  const text = String(value ?? '')
  if (text.length <= width) return text
  return `${text.slice(0, Math.max(0, width - 1))}~`
}

function renderPmStatusAuditTable(audit: Record<string, unknown>): string {
  const findings = toRecordArray(audit.findings)
  if (findings.length === 0) return 'No PM status drift found.'

  const rows = findings.map((finding) => {
    const task = isRecord(finding.task) ? finding.task : {}
    const sprint = isRecord(finding.sprint) ? finding.sprint : null
    const sprints = toRecordArray(finding.sprints)
    const sprintLabels = sprint
      ? [normalizeNonEmpty(sprint.id) ?? '-']
      : sprints.map((entry) => normalizeNonEmpty(entry.id) ?? '-')
    return [
      truncateAuditCell(finding.class, 36),
      truncateAuditCell(finding.severity, 7),
      truncateAuditCell(normalizeNonEmpty(task.id) ?? '-', 12),
      truncateAuditCell(sprintLabels.join(','), 20),
      truncateAuditCell(finding.message, 72),
    ]
  })
  const headers = ['class', 'sev', 'task', 'sprint(s)', 'message']
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  )
  const formatRow = (row: string[]): string => row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join('  ')
  return [
    formatRow(headers),
    formatRow(widths.map((width) => '-'.repeat(width))),
    ...rows.map(formatRow),
  ].join('\n')
}

function parseOptionalInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const normalized = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new Error(`${label} must be a non-negative integer.`)
  }
  return normalized
}

function buildCommandEnvelope(params: {
  command: string
  toolId: string
  resolvedContext: Record<string, unknown>
  input: Record<string, unknown>
  payload: Record<string, unknown>
  sideEffects?: Record<string, unknown>
}): Record<string, unknown> {
  return {
    command: params.command,
    toolId: params.toolId,
    resolvedContext: params.resolvedContext,
    input: params.input,
    result: unwrapHostedToolResult(params.payload),
    ...(params.sideEffects ? { sideEffects: params.sideEffects } : {}),
  }
}

function emitCommandResult(
  options: { json?: boolean },
  params: {
    command: string
    toolId: string
    resolvedContext: Record<string, unknown>
    input: Record<string, unknown>
    payload: Record<string, unknown>
    sideEffects?: Record<string, unknown>
  },
): void {
  const envelope = buildCommandEnvelope(params)
  if (options.json) {
    console.log(JSON.stringify(envelope, null, 2))
    return
  }

  logSuccess(`${params.command} completed.`)
  logInfo(`Tool: ${params.toolId}`)
  if (params.sideEffects?.memory && isRecord(params.sideEffects.memory)) {
    const memorySideEffect = params.sideEffects.memory
    if (memorySideEffect.ok === true) {
      logInfo(`Memory side-effect completed (${String(memorySideEffect.mode ?? 'unknown')}).`)
    } else if (memorySideEffect.skipped === true) {
      logInfo(`Memory side-effect skipped (${String(memorySideEffect.reason ?? 'unspecified')}).`)
    } else if (memorySideEffect.error) {
      logInfo(`Memory side-effect failed: ${String(memorySideEffect.error)}`)
    }
  }
  if (params.sideEffects?.statusHint && isRecord(params.sideEffects.statusHint)) {
    const statusHint = params.sideEffects.statusHint
    const message = normalizeNonEmpty(statusHint.message) ?? 'PM status hint available.'
    if (statusHint.severity === 'warning' || statusHint.severity === 'error') {
      logWarn(message)
    } else {
      logInfo(message)
    }
  }
  console.log(JSON.stringify(envelope.result, null, 2))
}

function emitFlowCommandResult(
  options: { json?: boolean },
  params: {
    command: string
    toolId: string
    surface: string
    resolvedContext: Record<string, unknown>
    input: Record<string, unknown>
    result: Record<string, unknown>
  },
): void {
  const envelope = compactPayload({
    command: params.command,
    toolId: params.toolId,
    surface: params.surface,
    resolvedContext: params.resolvedContext,
    input: params.input,
    result: params.result,
  })

  if (options.json) {
    console.log(JSON.stringify(envelope, null, 2))
    return
  }

  if (params.result.preview === true) {
    logInfo(`${params.command} preview ready.`)
  } else {
    logSuccess(`${params.command} completed.`)
  }
  logInfo(`Surface: ${params.surface}`)
  console.log(JSON.stringify(params.result, null, 2))
}

function augmentInvokeErrorMessage(toolId: string, message: string): string {
  const normalized = String(message ?? '').toLowerCase()
  if (normalized.includes('apply_required')) {
    return `${message}\nRetry with --apply because ${toolId} is a guarded write tool.`
  }
  if (normalized.includes('confirmation_required')) {
    return `${message}\nRetry with --apply --confirm because ${toolId} is destructive.`
  }
  if (
    toolId === 'agentspace.memory-item.build-resume-pack' &&
    (normalized.includes('record not found') || normalized.includes('.not_found') || normalized.includes('not_found'))
  ) {
    return `${message}\nResume requires an existing tracked Projectman subject. pm handoff write stores memory notes, but it does not create the sprint, task, phase, or microtask record that pm handoff resume reads from.`
  }
  return message
}

function ensureWriteFlags(action: 'create' | 'update' | 'delete', options: GuardedWriteOptions): void {
  if (options.preview === true) return
  if ((action === 'create' || action === 'update') && options.apply !== true) {
    throw new Error('This command mutates data. Retry with --apply.')
  }
  if (action === 'delete') {
    if (options.apply !== true || options.confirm !== true) {
      throw new Error('This command deletes data. Retry with --apply --confirm.')
    }
  }
}

function buildResolvedContextEnvelope(
  resolvedContext: ResolvedPmContext,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    repoRoot: resolvedContext.repoRoot,
    configPath: resolvedContext.configPath,
    configFound: resolvedContext.configFound,
    scopeId: resolvedContext.scopeId ?? null,
    projectId: resolvedContext.projectId ?? null,
    projectName: resolvedContext.projectName ?? null,
    projectSlug: resolvedContext.projectSlug ?? null,
    // Projectman is server-first/hosted-only; the envelope reports the fixed transport so
    // downstream consumers/snapshots keep a stable, coherent value.
    authoringMode: 'hosted-only',
    ...extra,
  }
}

function buildOwnerScopedInput(
  resolvedContext: Pick<ResolvedPmContext, 'scopeId' | 'projectId'>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...extra }
  const scopeId = resolveOwnerScopeIdFromBinding(resolvedContext)
  if (scopeId) {
    input.scopeId = scopeId
    return input
  }

  const projectId = normalizeNonEmpty(resolvedContext.projectId)
  if (projectId) {
    input.project = projectId
    return input
  }

  throw new Error('Project owner context could not be resolved.')
}

function buildGatewayOptions(
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedPmContext,
): AgentGatewayContextOptions {
  return {
    ...options,
    scopeId: resolvedContext.scopeId,
    projectId: resolvedContext.projectId,
    projectName: resolvedContext.projectName,
    ...preferProjectNameBinding(resolvedContext),
  }
}

function isArchivedProject(project: Record<string, unknown>): boolean {
  const status = normalizeNonEmpty(project.status)?.toLowerCase()
  return status === 'archived' || status === 'deleted' || status === 'removed'
}

async function hydrateHostedProjectContext(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedPmContext,
): Promise<ResolvedPmContext> {
  const projectId = normalizeNonEmpty(resolvedContext.projectId)
  if (!projectId) {
    throw new Error(`Projectman project "${resolvedContext.projectSlug ?? '(unknown)'}" could not be resolved to a project id. Provide --project-id, or --project-slug/--project-name resolved against the server.`)
  }
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    toolId: 'agentspace.project.get-by-id',
    input: { id: projectId },
  })
  const project = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload))
  if (!isRecord(project)) {
    throw new Error(`Projectman project "${resolvedContext.projectSlug ?? projectId}" was not found on the server.`)
  }
  if (isArchivedProject(project)) {
    throw new Error(`Projectman project "${resolvedContext.projectSlug ?? projectId}" is archived/deleted; refusing to write.`)
  }
  return {
    ...resolvedContext,
    scopeId: resolveOwnerScopeIdFromProjectRecord(project, resolvedContext.scopeId),
    projectName: normalizeNonEmpty(project.name) ?? resolvedContext.projectName,
  }
}

/**
 * Emit a deterministic server-first-unsupported failure for a PM subcommand whose only
 * implementation was the now-removed repo-first transport and for which no hosted Projectman
 * op exists yet (board/sprint soft-archive). No local fallback. Tracked as a PM-issue candidate
 * (hosted soft-archive op: kanban-board.archive/unarchive + sprint.archive/unarchive).
 */
function assignIssueLikeLinks(
  input: Record<string, unknown>,
  params: {
    task?: unknown
    sprint?: unknown
    utask?: unknown
    reviewRequest?: unknown
  },
): void {
  const task = normalizeNonEmpty(params.task)
  const sprint = normalizeNonEmpty(params.sprint)
  const utask = normalizeNonEmpty(params.utask)
  const reviewRequest = normalizeNonEmpty(params.reviewRequest)
  if (task) input.kanbanTask = task
  if (sprint) input.sprint = sprint
  if (utask) input.microTask = utask
  if (reviewRequest) input.reviewRequest = reviewRequest
}

async function prepareExecution(
  options: AgentGatewayContextOptions & PmContextOptions,
  params: { requireProject?: boolean } = {},
): Promise<PmExecutionContext | null> {
  try {
    // Projectman is hosted-only: every PM command resolves an API host and verifies the
    // project server-side before any read/write. There is no repo-first fallback.
    const apiState = await requireApiState(options)
    if (!apiState) return null
    // Server-first slug/name resolution: with an API host in hand, resolve any
    // `--project-slug`/`--project-name` to an explicit project id BEFORE we resolve+verify the
    // PM context (the `--project-id` fast path is a no-op here).
    const scopedOptions = await resolveProjectScopeOptionsWithApiState(apiState, options)
    const baseContext = await resolvePmContext(scopedOptions, params)
    const resolvedContext = await hydrateHostedProjectContext(apiState, scopedOptions, baseContext)

    return {
      resolvedContext,
      gatewayOptions: buildGatewayOptions(scopedOptions, resolvedContext),
      apiState,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(message)
    process.exitCode = 1
    return null
  }
}

async function invokeProjectmanTool(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions & GuardedWriteOptions & { idempotencyKey?: string },
  params: {
    toolId: string
    input: Record<string, unknown>
  },
): Promise<Record<string, unknown>> {
  return invokeHostedToolWithApiState(execution.apiState, {
    ...execution.gatewayOptions,
    toolId: params.toolId,
    input: params.input,
    preview: options.preview,
    apply: options.apply,
    confirm: options.confirm,
    idempotencyKey: options.idempotencyKey,
  })
}

async function invokeProjectmanReadTool(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  params: {
    toolId: string
    input: Record<string, unknown>
  },
): Promise<Record<string, unknown>> {
  return invokeHostedToolWithApiState(execution.apiState, {
    ...execution.gatewayOptions,
    toolId: params.toolId,
    input: params.input,
    preview: false,
    apply: false,
    confirm: false,
    timeoutMs: options.timeoutMs,
  })
}

function isIncludeArchivedSchemaError(message: string): boolean {
  return /includeArchived|unknown.*arg|unknown.*input|unrecognized/i.test(message)
}

async function invokeProjectmanReadToolWithArchiveHint(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  params: {
    toolId: string
    input: Record<string, unknown>
  },
): Promise<Record<string, unknown>> {
  try {
    return await invokeProjectmanReadTool(execution, options, {
      toolId: params.toolId,
      input: {
        ...params.input,
        includeArchived: true,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isIncludeArchivedSchemaError(message)) {
      return invokeProjectmanReadTool(execution, options, params)
    }
    throw error
  }
}

async function listProjectmanBoards(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  filters: { name?: string; includeArchived?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  const buildInput = (includeArchived: boolean): Record<string, unknown> => {
    const input = buildOwnerScopedInput(execution.resolvedContext)
    if (filters.name) input.name = filters.name
    if (includeArchived) input.includeArchived = true
    return input
  }
  const includeArchived = filters.includeArchived === true
  try {
    const payload = await invokeProjectmanReadTool(execution, options, {
      toolId: 'projectman.kanban-board.list',
      input: buildInput(includeArchived),
    })
    return toRecordArray(unwrapHostedToolResult(payload))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (includeArchived && isIncludeArchivedSchemaError(message)) {
      const payload = await invokeProjectmanReadTool(execution, options, {
        toolId: 'projectman.kanban-board.list',
        input: buildInput(false),
      })
      return toRecordArray(unwrapHostedToolResult(payload))
    }
    throw error
  }
}

function findBoardByReference(
  boards: Record<string, unknown>[],
  params: { id?: string; name?: string; slug?: string },
): Record<string, unknown> | null {
  const id = normalizeNonEmpty(params.id)
  if (id) {
    return boards.find((record) => extractEntityId(record, ['id', 'boardId']) === id) ?? null
  }

  const name = normalizeNonEmpty(params.name)
  if (name) {
    return boards.find((record) => normalizeExactLabel(record.name) === normalizeExactLabel(name)) ?? null
  }

  const slug = normalizeNonEmpty(params.slug)
  if (slug) {
    return boards.find((record) => normalizeExactLabel(record.slug) === normalizeExactLabel(slug)) ?? null
  }

  return null
}

async function resolveBoardRecord(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  boardValue: string,
): Promise<Record<string, unknown>> {
  const trimmed = normalizeNonEmpty(boardValue)
  if (!trimmed) {
    throw new Error('Board is required.')
  }

  const boards = await listProjectmanBoards(execution, options, trimmed.includes(' ') ? { name: trimmed } : {})
  const board = findBoardByReference(boards, {
    id: isUuidLike(trimmed) ? trimmed : undefined,
    name: trimmed.includes(' ') ? trimmed : undefined,
    slug: trimmed.includes(' ') ? undefined : trimmed,
  })
  if (board) return board

  if (!trimmed.includes(' ')) {
    const fallback = findBoardByReference(boards, {
      name: trimmed,
      slug: trimmed,
    })
    if (fallback) return fallback
  }

  throw new Error(`Board "${trimmed}" was not found.`)
}

async function listProjectScopedMemoryItems(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  params: {
    kind?: string
    durability?: 'short' | 'durable' | 'sticky'
    limit?: number
  } = {},
): Promise<Record<string, unknown>[]> {
  const projectId = normalizeNonEmpty(execution.resolvedContext.projectId)
  const input = {
    filter: compactPayload({
      scopeId: resolveOwnerScopeIdFromBinding(execution.resolvedContext),
      scopeResolution: 'cascade',
      projectId,
      sourceType: projectId ? 'projectman.plan' : undefined,
      sourceId: projectId,
      kind: normalizeNonEmpty(params.kind),
      durability: params.durability,
    }),
    options: compactPayload({
      limit: params.limit ?? 100,
    }),
  }

  const payload = await invokeProjectmanReadTool(execution, options, {
    toolId: 'agentspace.memory-item.list-memory-items',
    input,
  })
  return toRecordArray(unwrapHostedToolResult(payload))
}

async function findPmBoardBootstrapMemory(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  boardSlug: string,
): Promise<PmBoardBootstrapRecord | null> {
  const memories = await listProjectScopedMemoryItems(execution, options, {
    kind: 'rule',
    durability: 'sticky',
    limit: 100,
  })

  const matches = memories
    .filter((record) => {
      const tags = new Set(toArray(record.tags).map((entry) => entry.toLowerCase()))
      return tags.has(PM_BOARD_BOOTSTRAP_TAG) && tags.has(`board:${boardSlug}`.toLowerCase())
    })
    .map((record) => normalizePmBoardBootstrapRecord(record))
    .filter((record): record is PmBoardBootstrapRecord => Boolean(record))
    .sort((left, right) => compareIsoTimestampsDesc(left.updatedAt ?? left.createdAt, right.updatedAt ?? right.createdAt))

  return matches[0] ?? null
}

function buildPmBoardBootstrapPayload(
  execution: PmExecutionContext,
  record: PmBoardBootstrapRecord,
): Record<string, unknown> {
  const projectId = normalizeNonEmpty(execution.resolvedContext.projectId)
  const meta = compactPayload({
    projectId,
    stickyScope: 'project',
    subjectType: 'projectman.plan',
    subjectId: projectId,
    subjectTitle: record.title ?? record.boardSlug,
    boardId: record.boardId,
    boardSlug: record.boardSlug,
    boardBootstrap: compactPayload({
      version: PM_BOARD_BOOTSTRAP_META_VERSION,
      boardId: record.boardId,
      boardSlug: record.boardSlug,
      title: record.title,
      docId: record.docId,
      docVersionId: record.docVersionId,
      promptId: record.promptId,
      promptVersionId: record.promptVersionId,
      activeTaskId: record.activeTaskId,
      activeSprintId: record.activeSprintId,
      references: record.references.length > 0 ? record.references : undefined,
      notes: record.notes,
    }),
  })

  return {
    kind: 'rule',
    durability: 'sticky',
    content: buildPmBoardBootstrapContent(record),
    tags: buildPmBoardBootstrapTags(projectId, record.boardSlug),
    sourceType: 'projectman.plan',
    sourceId: projectId,
    meta,
  }
}

async function persistPmBoardBootstrap(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions & GuardedWriteOptions & { idempotencyKey?: string },
  existing: PmBoardBootstrapRecord | null,
  record: PmBoardBootstrapRecord,
): Promise<{ action: 'created' | 'updated'; toolId: string; payload: Record<string, unknown> }> {
  const data = buildPmBoardBootstrapPayload(execution, record)
  if (existing?.memoryId) {
    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'agentspace.memory-item.update-memory-item',
      input: {
        id: existing.memoryId,
        patch: data,
      },
    })
    return {
      action: 'updated',
      toolId: 'agentspace.memory-item.update-memory-item',
      payload,
    }
  }

  const payload = await invokeProjectmanTool(execution, options, {
    toolId: 'agentspace.memory-item.add-memory-item',
    input: {
      data: {
        scopeId: resolveOwnerScopeIdFromBinding(execution.resolvedContext),
        ...data,
      },
    },
  })
  return {
    action: 'created',
    toolId: 'agentspace.memory-item.add-memory-item',
    payload,
  }
}

async function resolveBoardReference(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  boardValue: string,
): Promise<ResolvedReference> {
  const trimmed = normalizeNonEmpty(boardValue)
  if (!trimmed) {
    throw new Error('Board is required.')
  }
  if (isUuidLike(trimmed)) {
    return { input: trimmed, id: trimmed }
  }

  const boards = await listProjectmanBoards(execution, options, trimmed.includes(' ') ? { name: trimmed } : {})
  const exactMatches = boards.filter((record) =>
    normalizeExactLabel(record.name) === normalizeExactLabel(trimmed) ||
    normalizeExactLabel(record.slug) === normalizeExactLabel(trimmed),
  )

  if (exactMatches.length === 1) {
    const id = extractEntityId(exactMatches[0], ['id', 'boardId'])
    if (!id) {
      throw new Error(`Board "${trimmed}" matched a record without an id.`)
    }
    return {
      input: trimmed,
      id,
      label: extractEntityLabel(exactMatches[0]),
    }
  }

  if (exactMatches.length > 1) {
    const candidates = exactMatches
      .map((record) => `${extractEntityLabel(record) ?? '(unnamed)'} (${extractEntityId(record) ?? 'missing-id'})`)
      .join(', ')
    throw new Error(`Board "${trimmed}" is ambiguous. Candidates: ${candidates}.`)
  }

  if (trimmed.includes(' ')) {
    throw new Error(`Board "${trimmed}" was not found.`)
  }

  return { input: trimmed, id: trimmed, assumedId: true }
}

async function resolveBoardColumnReference(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  params: {
    boardId?: string
    columnValue: string
  },
): Promise<ResolvedReference> {
  const trimmed = normalizeNonEmpty(params.columnValue)
  if (!trimmed) {
    throw new Error('Column is required.')
  }
  if (isUuidLike(trimmed)) {
    return { input: trimmed, id: trimmed }
  }
  if (!params.boardId) {
    throw new Error('Board is required when resolving a column by exact name.')
  }

  const boardColumnsPayload = await invokeProjectmanReadTool(execution, options, {
    toolId: 'projectman.kanban-board-column.list',
    input: { board: params.boardId },
  })
  const columnLibraryPayload = await invokeProjectmanReadTool(execution, options, {
    toolId: 'projectman.kanban-column.list',
    input: trimmed.includes(' ') ? { name: trimmed } : { slug: trimmed },
  })

  const boardColumns = toRecordArray(unwrapHostedToolResult(boardColumnsPayload))
  const enrichedBoardColumns: EnrichedBoardColumnPlacement[] = await Promise.all(
    boardColumns.map(async (placement) => {
      const columnId = extractEntityId(placement, ['columnId', 'column'])
      if (!columnId) {
        return {
          placement,
          placementId: extractEntityId(placement, ['id', 'boardColumnId']),
        }
      }

      try {
        const payload = await invokeProjectmanReadTool(execution, options, {
          toolId: 'projectman.kanban-column.get',
          input: { id: columnId },
        })
        const result = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload))
        return {
          placement,
          placementId: extractEntityId(placement, ['id', 'boardColumnId']),
          columnId,
          column: isRecord(result) ? result : null,
        }
      } catch {
        return {
          placement,
          placementId: extractEntityId(placement, ['id', 'boardColumnId']),
          columnId,
          column: null,
        }
      }
    }),
  )
  let exactColumns = toRecordArray(unwrapHostedToolResult(columnLibraryPayload)).filter(
    (record) =>
      normalizeExactLabel(record.name) === normalizeExactLabel(trimmed) ||
      normalizeExactLabel(record.slug) === normalizeExactLabel(trimmed),
  )

  if (!trimmed.includes(' ') && exactColumns.length === 0) {
    const fallbackPayload = await invokeProjectmanReadTool(execution, options, {
      toolId: 'projectman.kanban-column.list',
      input: { name: trimmed },
    })
    exactColumns = toRecordArray(unwrapHostedToolResult(fallbackPayload)).filter(
      (record) =>
        normalizeExactLabel(record.name) === normalizeExactLabel(trimmed) ||
        normalizeExactLabel(record.slug) === normalizeExactLabel(trimmed),
    )
  }
  const exactColumnIds = new Set(
    exactColumns
      .map((record) => extractEntityId(record, ['id', 'columnId']))
      .filter((value): value is string => Boolean(value)),
  )

  const matchingPlacements = enrichedBoardColumns.filter((entry) => {
    const labelMatches = [
      entry.placement.name,
      entry.placement.title,
      entry.placement.slug,
      entry.placement.columnName,
      entry.placement.columnSlug,
      entry.column?.name,
      entry.column?.title,
      entry.column?.slug,
    ].some((value) => normalizeExactLabel(value) === normalizeExactLabel(trimmed))
    if (labelMatches) return true
    return entry.columnId ? exactColumnIds.has(entry.columnId) : false
  })

  if (matchingPlacements.length === 1) {
    const match = matchingPlacements[0]
    const id = match?.placementId ?? extractEntityId(match?.placement ?? {}, ['id', 'boardColumnId'])
    if (!id) {
      throw new Error(`Column "${trimmed}" matched a board placement without an id.`)
    }
    return {
      input: trimmed,
      id,
      label: extractEntityLabel(match.column ?? {}) ?? extractEntityLabel(match.placement) ?? extractEntityLabel(exactColumns[0] ?? {}) ?? trimmed,
    }
  }

  if (matchingPlacements.length > 1) {
    const candidates = matchingPlacements
      .map((entry) => `${entry.placementId ?? 'missing-id'}`)
      .join(', ')
    throw new Error(`Column "${trimmed}" is ambiguous on the selected board. Placements: ${candidates}.`)
  }

  if (trimmed.includes(' ')) {
    throw new Error(`Column "${trimmed}" was not found on the selected board.`)
  }

  return { input: trimmed, id: trimmed, assumedId: true }
}

async function getProjectmanRecord(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  toolId: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  try {
    const payload = await invokeProjectmanReadTool(execution, options, {
      toolId,
      input: { id },
    })
    const result = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload))
    return isRecord(result) ? result : null
  } catch {
    return null
  }
}

async function resolvePmBoardLineageFromTaskId(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  taskId: string,
): Promise<PmBoardLineage | null> {
  const task = await getProjectmanRecord(execution, options, 'projectman.kanban-task.get', taskId)
  const boardId = normalizeNonEmpty(task?.boardId ?? task?.board)
  if (!boardId) return null
  const board = await getProjectmanRecord(execution, options, 'projectman.kanban-board.get', boardId)
  return normalizePmBoardLineageCandidate(board) ?? {
    boardId,
    boardSlug: normalizeNonEmpty(task?.boardSlug),
    boardLabel: normalizeNonEmpty(task?.boardName),
  }
}

async function resolvePmBoardLineageFromSprintId(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  sprintId: string,
): Promise<PmBoardLineage | null> {
  const sprint = await getProjectmanRecord(execution, options, 'projectman.sprint.get', sprintId)
  const taskId = normalizeNonEmpty(sprint?.kanbanTaskId ?? sprint?.kanbanTask)
  return taskId ? resolvePmBoardLineageFromTaskId(execution, options, taskId) : null
}

async function listPmSprintRecords(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
): Promise<Record<string, unknown>[]> {
  const payload = await invokeProjectmanReadTool(execution, options, {
    toolId: 'projectman.sprint.list',
    input: buildOwnerScopedInput(execution.resolvedContext),
  })
  return toRecordArray(unwrapHostedToolResult(payload))
}

function sprintContainsPhaseOrMicrotask(sprint: Record<string, unknown>, trackedId: string): boolean {
  const phases = toRecordArray(sprint.phases)
  for (const phase of phases) {
    if (extractEntityId(phase, ['id']) === trackedId) return true
    const microtasks = toRecordArray(phase.microtasks)
    if (microtasks.some((entry) => extractEntityId(entry, ['id', 'microtaskId']) === trackedId)) return true
  }
  const topLevelMicrotasks = toRecordArray(sprint.microtasks)
  return topLevelMicrotasks.some((entry) => extractEntityId(entry, ['id', 'microtaskId']) === trackedId)
}

async function resolvePmBoardLineageFromTrackedSprintItem(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  trackedId: string,
): Promise<PmBoardLineage | null> {
  try {
    const sprints = await listPmSprintRecords(execution, options)
    const sprint = sprints.find((entry) => sprintContainsPhaseOrMicrotask(entry, trackedId))
    const sprintId = sprint ? extractEntityId(sprint, ['id', 'sprintId']) : undefined
    return sprintId ? resolvePmBoardLineageFromSprintId(execution, options, sprintId) : null
  } catch {
    return null
  }
}

async function resolvePmBoardLineageFromIssueId(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  issueId: string,
): Promise<PmBoardLineage | null> {
  const issue = await getProjectmanRecord(execution, options, 'projectman.issue.get', issueId)
  const taskId = normalizeNonEmpty(issue?.kanbanTaskId ?? issue?.kanbanTask)
  if (taskId) return resolvePmBoardLineageFromTaskId(execution, options, taskId)
  const sprintId = normalizeNonEmpty(issue?.sprintId ?? issue?.sprint)
  return sprintId ? resolvePmBoardLineageFromSprintId(execution, options, sprintId) : null
}

async function resolvePmBoardLineageFromFeedbackId(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  feedbackId: string,
): Promise<PmBoardLineage | null> {
  const feedback = await getProjectmanRecord(execution, options, 'projectman.feedback.get', feedbackId)
  const taskId = normalizeNonEmpty(feedback?.kanbanTaskId ?? feedback?.kanbanTask)
  if (taskId) return resolvePmBoardLineageFromTaskId(execution, options, taskId)
  const sprintId = normalizeNonEmpty(feedback?.sprintId ?? feedback?.sprint)
  return sprintId ? resolvePmBoardLineageFromSprintId(execution, options, sprintId) : null
}

async function resolvePmBoardLineage(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  params: {
    board?: unknown
    links?: Record<string, string | undefined>
  } = {},
): Promise<PmBoardLineage | null> {
  const explicit = normalizePmBoardLineageCandidate(params.board)
  if (explicit) return explicit

  const links = params.links ?? {}
  try {
    if (links.kanbanTaskId) return resolvePmBoardLineageFromTaskId(execution, options, links.kanbanTaskId)
    if (links.sprintId) return resolvePmBoardLineageFromSprintId(execution, options, links.sprintId)
    if (links.phaseId) return resolvePmBoardLineageFromTrackedSprintItem(execution, options, links.phaseId)
    if (links.microtaskId) return resolvePmBoardLineageFromTrackedSprintItem(execution, options, links.microtaskId)
    if (links.issueId) return resolvePmBoardLineageFromIssueId(execution, options, links.issueId)
    if (links.feedbackId) return resolvePmBoardLineageFromFeedbackId(execution, options, links.feedbackId)
    return null
  } catch {
    return null
  }
}

async function resolveTaskColumnSlug(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  task: Record<string, unknown>,
): Promise<string | undefined> {
  const boardId = normalizeNonEmpty(task.boardId)
  const placementId = normalizeNonEmpty(task.boardColumnId)
  if (!boardId || !placementId) return undefined

  const placementsPayload = await invokeProjectmanReadTool(execution, options, {
    toolId: 'projectman.kanban-board-column.list',
    input: { board: boardId },
  })
  const placements = toRecordArray(unwrapHostedToolResult(placementsPayload))
  const placement = placements.find((entry) => extractEntityId(entry, ['id', 'boardColumnId']) === placementId)
  const columnId = placement ? extractEntityId(placement, ['columnId', 'column']) : undefined
  if (!columnId) return undefined

  const columnPayload = await invokeProjectmanReadTool(execution, options, {
    toolId: 'projectman.kanban-column.get',
    input: { id: columnId },
  })
  const column = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(columnPayload))
  return normalizeNonEmpty(column?.slug)
}

async function isPmTaskOpen(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  task: Record<string, unknown>,
): Promise<boolean> {
  const progress = Number(task.progress)
  if (Number.isFinite(progress) && progress >= 100) return false
  try {
    return (await resolveTaskColumnSlug(execution, options, task)) !== 'done'
  } catch {
    return true
  }
}

function isPmSprintOpen(sprint: Record<string, unknown>): boolean {
  const status = normalizeNonEmpty(sprint.status)?.toLowerCase()
  return !status || !['completed', 'done', 'closed', 'cancelled'].includes(status)
}

async function buildPmResumePack(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  params: {
    subject: PmHandoffSubjectConfig
    subjectId: string
    subjectLabel?: string
    links?: Record<string, string | undefined>
    boardSlug?: string
    depth?: 'light' | 'deep'
    limit?: number
    candidateLimit?: number
  },
): Promise<Record<string, unknown>> {
  const projectId = normalizeNonEmpty(execution.resolvedContext.projectId)
  const retrievalTags = params.boardSlug ? [`board:${params.boardSlug}`] : undefined
  const input: Record<string, unknown> = {
    filter: compactPayload({
      scopeId: resolveOwnerScopeIdFromBinding(execution.resolvedContext),
      scopeResolution: 'cascade',
      projectId,
    }),
    retrieval: compactPayload({
      query: params.subject.defaultQuery,
      subject: compactPayload({
        type: params.subject.subjectType,
        id: params.subjectId,
        label: params.subjectLabel,
      }),
      sourceTypes: params.subject.defaultSourceTypes,
      sourceIds: buildPmHandoffSourceIds(params.subjectId, params.links ?? buildPmHandoffEntityLinks(params.subject, params.subjectId, {})),
      tags: retrievalTags,
      ...(params.candidateLimit !== undefined ? { candidateLimit: params.candidateLimit } : {}),
    }),
    options: compactPayload({
      depth: params.depth ?? 'light',
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    }),
  }
  const payload = await invokeProjectmanReadTool(execution, options, {
    toolId: 'agentspace.memory-item.build-resume-pack',
    input,
  })
  return compactPayload({
    input,
    result: unwrapHostedToolResult(payload),
  })
}

export function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  const normalized = normalizeNonEmpty(value)
  if (normalized) previous.push(normalized)
  return previous
}

export async function runPmTaskCreate(options: PmTaskCreateOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const title = normalizeNonEmpty(options.title)
    const board = normalizeNonEmpty(options.board)
    const column = normalizeNonEmpty(options.column)

    if (!title) throw new Error('Missing required --title.')
    if (!board) throw new Error('Missing required --board.')
    if (!column) throw new Error('Missing required --column.')

    const execution = await prepareExecution(options)
    if (!execution) return

    const boardRef = await resolveBoardReference(execution, options, board)
    const columnRef = await resolveBoardColumnReference(execution, options, {
      boardId: boardRef.id,
      columnValue: column,
    })

    const input: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext, {
      board: boardRef.id,
      boardColumn: columnRef.id,
      title,
    })

    const description = normalizeNonEmpty(options.description)
    const position = parseOptionalInteger(options.position, '--position')
    if (description) input.description = description
    if (position !== undefined) input.position = position

    if (options.preview === true) {
      emitCommandResult(options, {
        command: 'pm.ktask.create',
        toolId: 'projectman.kanban-task.create',
        resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
          board: boardRef,
          column: columnRef,
        }),
        input,
        payload: {
          ok: true,
          response: {
            data: {
              preview: true,
              action: 'create',
              message: 'Validated kanban task create input. Re-run with --apply to create the kanban task.',
              input,
            },
          },
        },
      })
      return
    }

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.kanban-task.create',
      input,
    })
    const result = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload))
    const taskId = normalizeNonEmpty(result?.id)
    const memorySideEffect =
      shouldWritePmMemory(options) && taskId
        ? await writePmMemorySideEffect(execution, options, {
            mode: inferPmMemoryMode(options.memoryMode, 'kickoff'),
            subject: PM_HANDOFF_SUBJECTS.ktask,
            subjectId: taskId,
            subjectTitle: normalizeNonEmpty(result?.title) ?? title,
            content:
              normalizeNonEmpty(options.memoryContent) ??
              buildTaskKickoffMemoryContent({
                title,
                boardLabel: boardRef.label ?? boardRef.input,
                columnLabel: columnRef.label ?? columnRef.input,
                description,
              }),
            nextAction: normalizeNonEmpty(options.memoryNextAction),
            validationState: normalizeNonEmpty(options.memoryValidationState),
            board: boardRef,
            links: {
              kanbanTaskId: taskId,
            },
          })
        : undefined

    emitCommandResult(options, {
      command: 'pm.ktask.create',
      toolId: 'projectman.kanban-task.create',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        board: boardRef,
        column: columnRef,
      }),
      input,
      payload,
      sideEffects: memorySideEffect ? { memory: memorySideEffect } : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm ktask create: ${augmentInvokeErrorMessage('projectman.kanban-task.create', message)}`)
    process.exitCode = 1
  }
}

export async function runPmBoardCreate(options: PmBoardCreateOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const name = normalizeNonEmpty(options.name)
    if (!name) throw new Error('Missing required --name.')
    const requestedColumns = normalizePmBoardColumns(options.column)
    const appendedColumns = normalizePmBoardColumns(options.appendColumn)
    if (requestedColumns.length > 0 && appendedColumns.length > 0) {
      throw new Error('Use either --column or --append-column, not both.')
    }

    const execution = await prepareExecution(options)
    if (!execution) return

    const slug = normalizeNonEmpty(options.slug) || slugifyPmBoardName(name)
    const description = normalizeNonEmpty(options.description)
    const resolvedColumns =
      requestedColumns.length > 0
        ? requestedColumns
        : appendedColumns.length > 0
          ? buildPmAppendedBoardColumns(appendedColumns)
          : []
    // Hosted board create goes through the explicit `kanban-board.bootstrap` op, which creates
    // the board plus its board-column links in one server call. Its input schema types `columns`
    // as a comma-separated string (string|null) — the server splits it into a name list — so the
    // wrapper must join the resolved names rather than send a raw array (a string[] is rejected
    // with `/columns must be string`). When omitted the server bootstraps Backlog/Todo/Doing/Done.
    // --append-column is pre-expanded into a full column list client-side, so the server always
    // receives the complete flat name list.
    const input = buildOwnerScopedInput(execution.resolvedContext, compactPayload({
      name,
      slug,
      description,
      columns: resolvedColumns.length > 0 ? resolvedColumns.join(',') : undefined,
    }))

    if (options.preview === true) {
      const result: PmFlowPreviewResult = compactPayload({
        ok: true,
        preview: true,
        action: 'create-board',
        board: compactPayload({
          name,
          slug,
          description,
        }),
        columns: buildPmBoardPreviewColumns(name, resolvedColumns.length > 0 ? resolvedColumns : DEFAULT_PM_BOARD_COLUMNS.map((column) => column.name)),
        notes:
          requestedColumns.length > 0
            ? ['Custom --column values replace the default board bootstrap columns.']
            : appendedColumns.length > 0
              ? ['Custom --append-column values extend the default Backlog, Todo, Doing, Done board bootstrap.']
              : ['No custom column values were supplied. The hosted bootstrap op will create Backlog, Todo, Doing, Done.'],
      }) as PmFlowPreviewResult

      emitFlowCommandResult(options, {
        command: 'pm.board.create',
        toolId: 'projectman.kanban-board.bootstrap',
        surface: '/api/agent/tools',
        resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
        input,
        result,
      })
      return
    }

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.kanban-board.bootstrap',
      input,
    })
    const result = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload))

    emitFlowCommandResult(options, {
      command: 'pm.board.create',
      toolId: 'projectman.kanban-board.bootstrap',
      surface: '/api/agent/tools',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      result: isRecord(result) ? result : { ok: Boolean(payload.ok), data: result },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm board create: ${augmentInvokeErrorMessage('projectman.kanban-board.bootstrap', message)}`)
    process.exitCode = 1
  }
}

export async function runPmBoardList(options: PmBoardListOptions = {}): Promise<void> {
  try {
    const execution = await prepareExecution(options)
    if (!execution) return

    const name = normalizeNonEmpty(options.name)
    const slug = normalizeNonEmpty(options.slug)
    const includeArchived = options.includeArchived === true
    const boards = await listProjectmanBoards(execution, options, {
      ...(name ? { name } : {}),
      includeArchived,
    })
    const filteredBoards = slug ? boards.filter((record) => normalizeExactLabel(record.slug) === normalizeExactLabel(slug)) : boards
    const counts = archiveCounts(filteredBoards)

    const result = {
      ok: true,
      data: filteredBoards,
      count: filteredBoards.length,
      ...counts,
      includeArchived,
    }

    emitFlowCommandResult(options, {
      command: 'pm.board.list',
      toolId: 'projectman.kanban-board.list',
      surface: '/api/agent/tools',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input: compactPayload(buildOwnerScopedInput(execution.resolvedContext, {
        ...(name ? { name } : {}),
        includeArchived: includeArchived ? true : undefined,
      })),
      result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm board list: ${augmentInvokeErrorMessage('projectman.kanban-board.list', message)}`)
    process.exitCode = 1
  }
}

export async function runPmBoardGet(options: PmBoardGetOptions = {}): Promise<void> {
  try {
    const boardId = normalizeNonEmpty(options.id)
    const boardName = normalizeNonEmpty(options.name)
    const boardSlug = normalizeNonEmpty(options.slug)
    if (!boardId && !boardName && !boardSlug) {
      throw new Error('Provide one board selector: --id, --name, or --slug.')
    }

    const execution = await prepareExecution(options)
    if (!execution) return

    const boards = await listProjectmanBoards(
      execution,
      options,
      boardName && !boardSlug && !boardId ? { name: boardName } : {},
    )
    const board = findBoardByReference(boards, {
      id: boardId,
      name: boardName,
      slug: boardSlug,
    })
    if (!board) {
      throw new Error('Board was not found with the supplied selector.')
    }

    const resolvedBoardId = extractEntityId(board, ['id', 'boardId'])
    if (!resolvedBoardId) {
      throw new Error('Resolved board is missing an id.')
    }

    const columnsPayload = await invokeProjectmanReadTool(execution, options, {
      toolId: 'projectman.kanban-board-column.list',
      input: { board: resolvedBoardId },
    })
    const boardColumns = toRecordArray(unwrapHostedToolResult(columnsPayload))
    const enrichedColumns = await Promise.all(
      boardColumns.map(async (placement) => {
        const columnId = extractEntityId(placement, ['columnId', 'column'])
        if (!columnId) return placement

        try {
          const payload = await invokeProjectmanReadTool(execution, options, {
            toolId: 'projectman.kanban-column.get',
            input: { id: columnId },
          })
          const column = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload))
          if (!isRecord(column)) return placement
          return compactPayload({
            ...placement,
            column,
            columnName: normalizeNonEmpty(column.name),
            columnSlug: normalizeNonEmpty(column.slug),
          })
        } catch {
          return placement
        }
      }),
    )
    const result = {
      ok: true,
      data: {
        ...board,
        columns: enrichedColumns,
      },
    }

    emitFlowCommandResult(options, {
      command: 'pm.board.get',
      toolId: 'projectman.kanban-board.list',
      surface: '/api/agent/tools',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        board: {
          id: resolvedBoardId,
          label: extractEntityLabel(board) ?? resolvedBoardId,
        },
      }),
      input: compactPayload({ id: boardId, name: boardName, slug: boardSlug }),
      result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm board get: ${message}`)
    process.exitCode = 1
  }
}

async function runPmBoardArchiveChange(
  action: 'archive' | 'unarchive',
  options: PmBoardArchiveOptions = {},
): Promise<void> {
  try {
    ensureWriteFlags('update', options)
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const input = { id }
    const toolId = `projectman.kanban-board.${action}`
    const payload = await invokeProjectmanTool(execution, options, {
      toolId,
      input,
    })

    emitCommandResult(options, {
      command: `pm.board.${action}`,
      toolId,
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        board: { id },
      }),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm board ${action}: ${augmentInvokeErrorMessage(`projectman.kanban-board.${action}`, message)}`)
    process.exitCode = 1
  }
}

export async function runPmBoardArchive(options: PmBoardArchiveOptions = {}): Promise<void> {
  await runPmBoardArchiveChange('archive', options)
}

export async function runPmBoardUnarchive(options: PmBoardArchiveOptions = {}): Promise<void> {
  await runPmBoardArchiveChange('unarchive', options)
}

export async function runPmBoardDelete(options: PmBoardDeleteOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('delete', options)
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const input = { id }
    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.kanban-board.delete',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.board.delete',
      toolId: 'projectman.kanban-board.delete',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        board: { id },
      }),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm board delete: ${augmentInvokeErrorMessage('projectman.kanban-board.delete', message)}`)
    process.exitCode = 1
  }
}

export async function runPmBoardBootstrapSet(options: PmBoardBootstrapSetOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const boardValue = normalizeNonEmpty(options.board)
    if (!boardValue) throw new Error('Missing required --board.')

    const execution = await prepareExecution(options)
    if (!execution) return

    const board = await resolveBoardRecord(execution, options, boardValue)
    const boardId = extractEntityId(board, ['id', 'boardId'])
    if (!boardId) throw new Error('Resolved board is missing an id.')
    const boardSlug = normalizeNonEmpty(board.slug) ?? slugifyPmBoardName(extractEntityLabel(board) ?? boardId)
    const existing = await findPmBoardBootstrapMemory(execution, options, boardSlug)
    const references = normalizeArrayValues(options.reference) ?? existing?.references ?? []
    const record: PmBoardBootstrapRecord = {
      memoryId: existing?.memoryId,
      boardId,
      boardSlug,
      title: normalizeNonEmpty(options.title) ?? existing?.title ?? extractEntityLabel(board) ?? boardSlug,
      docId: normalizeNonEmpty(options.docId) ?? existing?.docId,
      docVersionId: normalizeNonEmpty(options.docVersionId) ?? existing?.docVersionId,
      promptId: normalizeNonEmpty(options.promptId) ?? existing?.promptId,
      promptVersionId: normalizeNonEmpty(options.promptVersionId) ?? existing?.promptVersionId,
      activeTaskId: normalizeNonEmpty(options.taskId) ?? existing?.activeTaskId,
      activeSprintId: normalizeNonEmpty(options.sprintId) ?? existing?.activeSprintId,
      references: uniqueStringValues(references),
      notes: normalizeNonEmpty(options.notes) ?? existing?.notes,
    }

    if (options.preview === true) {
      emitFlowCommandResult(options, {
        command: 'pm.board.bootstrap.set',
        toolId: existing?.memoryId ? 'agentspace.memory-item.update-memory-item' : 'agentspace.memory-item.add-memory-item',
        surface: '/api/agent/tools',
        resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
          board: { id: boardId, label: extractEntityLabel(board) ?? boardSlug, slug: boardSlug },
        }),
        input: compactPayload({
          board: boardValue,
          title: record.title,
          docId: record.docId,
          docVersionId: record.docVersionId,
          promptId: record.promptId,
          promptVersionId: record.promptVersionId,
          taskId: record.activeTaskId,
          sprintId: record.activeSprintId,
          references: record.references,
          notes: record.notes,
        }),
        result: {
          ok: true,
          preview: true,
          action: existing?.memoryId ? 'update' : 'create',
          bootstrap: record,
        },
      })
      return
    }

    const persisted = await persistPmBoardBootstrap(execution, options, existing, record)
    const result = unwrapHostedToolResult(persisted.payload)
    emitFlowCommandResult(options, {
      command: 'pm.board.bootstrap.set',
      toolId: persisted.toolId,
      surface: '/api/agent/tools',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        board: { id: boardId, label: extractEntityLabel(board) ?? boardSlug, slug: boardSlug },
      }),
      input: compactPayload({
        board: boardValue,
        title: record.title,
        docId: record.docId,
        docVersionId: record.docVersionId,
        promptId: record.promptId,
        promptVersionId: record.promptVersionId,
        taskId: record.activeTaskId,
        sprintId: record.activeSprintId,
        references: record.references,
        notes: record.notes,
      }),
      result: {
        ok: true,
        action: persisted.action,
        memoryId: normalizeNonEmpty((result as Record<string, unknown>)?.id) ?? existing?.memoryId,
        bootstrap: record,
        hostedResult: result,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm board bootstrap set: ${message}`)
    process.exitCode = 1
  }
}

export async function runPmBoardBootstrapGet(options: PmBoardBootstrapGetOptions = {}): Promise<void> {
  try {
    const boardValue = normalizeNonEmpty(options.board)
    if (!boardValue) throw new Error('Missing required --board.')

    const execution = await prepareExecution(options)
    if (!execution) return

    const board = await resolveBoardRecord(execution, options, boardValue)
    const boardId = extractEntityId(board, ['id', 'boardId'])
    if (!boardId) throw new Error('Resolved board is missing an id.')
    const boardSlug = normalizeNonEmpty(board.slug) ?? slugifyPmBoardName(extractEntityLabel(board) ?? boardId)
    const bootstrap = await findPmBoardBootstrapMemory(execution, options, boardSlug)
    if (!bootstrap) {
      throw new Error(`Board bootstrap registry was not found for "${boardSlug}".`)
    }

    emitFlowCommandResult(options, {
      command: 'pm.board.bootstrap.get',
      toolId: 'agentspace.memory-item.list-memory-items',
      surface: '/api/agent/tools',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        board: { id: boardId, label: extractEntityLabel(board) ?? boardSlug, slug: boardSlug },
      }),
      input: { board: boardValue },
      result: {
        ok: true,
        board: compactPayload({
          id: boardId,
          name: extractEntityLabel(board),
          slug: boardSlug,
        }),
        bootstrap,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm board bootstrap get: ${message}`)
    process.exitCode = 1
  }
}

export async function runPmBoardResume(options: PmBoardResumeOptions = {}): Promise<void> {
  try {
    const boardValue = normalizeNonEmpty(options.board)
    if (!boardValue) throw new Error('Missing required --board.')

    const execution = await prepareExecution(options)
    if (!execution) return

    const board = await resolveBoardRecord(execution, options, boardValue)
    const boardId = extractEntityId(board, ['id', 'boardId'])
    if (!boardId) throw new Error('Resolved board is missing an id.')
    const boardSlug = normalizeNonEmpty(board.slug) ?? slugifyPmBoardName(extractEntityLabel(board) ?? boardId)
    const bootstrap = await findPmBoardBootstrapMemory(execution, options, boardSlug)
    if (!bootstrap) {
      throw new Error(`Board bootstrap registry was not found for "${boardSlug}".`)
    }

    const activeTask = bootstrap.activeTaskId
      ? await getProjectmanRecord(execution, options, 'projectman.kanban-task.get', bootstrap.activeTaskId)
      : null
    const openTask = activeTask && (await isPmTaskOpen(execution, options, activeTask)) ? activeTask : null
    const activeSprint = bootstrap.activeSprintId
      ? await getProjectmanRecord(execution, options, 'projectman.sprint.get', bootstrap.activeSprintId)
      : null
    const openSprint =
      activeSprint &&
      isPmSprintOpen(activeSprint) &&
      (!openTask || normalizeNonEmpty(activeSprint.kanbanTaskId) === normalizeNonEmpty(openTask.id) || !normalizeNonEmpty(activeSprint.kanbanTaskId))
        ? activeSprint
        : null

    const staleRefs = uniqueStringValues([
      bootstrap.activeTaskId && !openTask ? `task:${bootstrap.activeTaskId}` : undefined,
      bootstrap.activeSprintId && !openSprint ? `sprint:${bootstrap.activeSprintId}` : undefined,
    ])
    const resumeDepth = options.depth === 'deep' ? 'deep' : 'light'
    const resumeLimit = parseOptionalInteger(options.limit, '--limit')
    const candidateLimit = parseOptionalInteger(options.candidateLimit, '--candidate-limit')
    const subject =
      openSprint
        ? PM_HANDOFF_SUBJECTS.sprint
        : openTask
          ? PM_HANDOFF_SUBJECTS.ktask
          : undefined
    const subjectId = normalizeNonEmpty(openSprint?.id) ?? normalizeNonEmpty(openTask?.id)
    const subjectLabel = normalizeNonEmpty(openSprint?.name) ?? normalizeNonEmpty(openTask?.title)
    const links = {
      kanbanTaskId: normalizeNonEmpty(openTask?.id),
      sprintId: normalizeNonEmpty(openSprint?.id),
    }
    const resumePacket =
      subject && subjectId
        ? await buildPmResumePack(execution, options, {
            subject,
            subjectId,
            subjectLabel,
            links,
            boardSlug,
            depth: resumeDepth,
            limit: resumeLimit,
            candidateLimit,
          })
        : null
    const scopedResumePacket = resumePacket
      ? scopePmBoardResumePacket(resumePacket, {
          links,
          bootstrap,
        })
      : null

    emitFlowCommandResult(options, {
      command: 'pm.board.resume',
      toolId: scopedResumePacket ? 'agentspace.memory-item.build-resume-pack' : 'agentspace.memory-item.list-memory-items',
      surface: '/api/agent/tools',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        board: { id: boardId, label: extractEntityLabel(board) ?? boardSlug, slug: boardSlug },
      }),
      input: compactPayload({
        board: boardValue,
        depth: resumeDepth,
        limit: resumeLimit,
        candidateLimit,
      }),
      result: {
        ok: true,
        board: compactPayload({
          id: boardId,
          name: extractEntityLabel(board),
          slug: boardSlug,
        }),
        bootstrap,
        active: {
          task: openTask,
          sprint: openSprint,
          staleRefs,
        },
        resume: subject && subjectId
          ? {
              subject: {
                key: subject.key,
                type: subject.subjectType,
                id: subjectId,
                label: subjectLabel ?? null,
              },
              ...scopedResumePacket,
            }
          : null,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm board resume: ${message}`)
    process.exitCode = 1
  }
}

export async function runPmBoardCloseout(options: PmBoardCloseoutOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const boardValue = normalizeNonEmpty(options.board)
    if (!boardValue) throw new Error('Missing required --board.')
    const content = normalizeNonEmpty(options.content) ?? 'Board closeout completed.'

    const execution = await prepareExecution(options)
    if (!execution) return

    const board = await resolveBoardRecord(execution, options, boardValue)
    const boardId = extractEntityId(board, ['id', 'boardId'])
    if (!boardId) throw new Error('Resolved board is missing an id.')
    const boardSlug = normalizeNonEmpty(board.slug) ?? slugifyPmBoardName(extractEntityLabel(board) ?? boardId)
    const storedBootstrap = await findPmBoardBootstrapMemory(execution, options, boardSlug)
    const manualTaskId = normalizeNonEmpty(options.task)
    const manualSprintId = normalizeNonEmpty(options.sprint)
    const registryMissing = !storedBootstrap
    const bootstrap: PmBoardBootstrapRecord = storedBootstrap ?? {
      boardId,
      boardSlug,
      title: extractEntityLabel(board) ?? boardSlug,
      activeTaskId: manualTaskId,
      activeSprintId: manualSprintId,
      references: [],
    }

    if (options.preview === true) {
      let activeTaskOpen: boolean | undefined
      if (bootstrap.activeTaskId) {
        try {
          const task = await getProjectmanRecord(execution, options, 'projectman.kanban-task.get', bootstrap.activeTaskId)
          activeTaskOpen = task ? await isPmTaskOpen(execution, options, task) : false
        } catch {
          activeTaskOpen = undefined
        }
      }

      emitFlowCommandResult(options, {
        command: 'pm.board.closeout',
        toolId: 'agentspace.memory-item.update-memory-item',
        surface: '/api/agent/tools',
        resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
          board: { id: boardId, label: extractEntityLabel(board) ?? boardSlug, slug: boardSlug },
        }),
        input: compactPayload({
          board: boardValue,
          task: manualTaskId,
          sprint: manualSprintId,
          content,
          skipMemory: options.skipMemory ?? false,
        }),
        result: {
          ok: true,
          preview: true,
          registryMissing,
          fallbackMode: registryMissing ? 'manual' : undefined,
          board: compactPayload({
            id: boardId,
            name: extractEntityLabel(board),
            slug: boardSlug,
          }),
          wouldCloseTask: bootstrap.activeTaskId ?? null,
          wouldCloseSprint: bootstrap.activeSprintId ?? null,
          wouldWriteMemory: options.skipMemory !== true,
          taskOpen: activeTaskOpen,
          bootstrap: compactPayload({
            boardId,
            boardSlug,
            activeTaskId: bootstrap.activeTaskId,
            activeSprintId: bootstrap.activeSprintId,
          }),
          message: registryMissing
            ? 'Board kickoff registry was not found. Re-run with --apply for manual closeout; pass --task/--sprint to bind explicit active refs. Future resumable board windows should start with pm board kickoff.'
            : 'Validated board closeout input. Re-run with --apply to write closeout memory, close the active task, and clear bootstrap refs.',
        },
      })
      return
    }

    const sideEffects: Record<string, unknown> = {}

    // 1. Write closeout memory
    if (options.skipMemory !== true) {
      const subject = bootstrap.activeSprintId
        ? PM_HANDOFF_SUBJECTS.sprint
        : bootstrap.activeTaskId
          ? PM_HANDOFF_SUBJECTS.ktask
          : PM_HANDOFF_SUBJECTS.project
      const subjectId =
        normalizeNonEmpty(bootstrap.activeSprintId) ??
        normalizeNonEmpty(bootstrap.activeTaskId) ??
        normalizeNonEmpty(execution.resolvedContext.projectId) ??
        boardId
      const links = {
        kanbanTaskId: normalizeNonEmpty(bootstrap.activeTaskId),
        sprintId: normalizeNonEmpty(bootstrap.activeSprintId),
      }
      const memoryResult = await writePmMemorySideEffect(execution, options, {
        mode: 'closeout',
        subject,
        subjectId,
        subjectTitle: bootstrap.title ?? boardSlug,
        content,
        nextAction: normalizeNonEmpty(options.nextAction),
        validationState: normalizeNonEmpty(options.validationState),
        links,
        board,
      })
      sideEffects.closeoutMemory = memoryResult
    }

    // 2. Move active task to Done
    if (bootstrap.activeTaskId) {
      try {
        const task = await getProjectmanRecord(execution, options, 'projectman.kanban-task.get', bootstrap.activeTaskId)
        if (task && (await isPmTaskOpen(execution, options, task))) {
          const columnRef = await resolveBoardColumnReference(execution, options, {
            boardId,
            columnValue: 'done',
          })
          const movePayload = await invokeProjectmanTool(execution, options, {
            toolId: 'projectman.kanban-task.move',
            input: { id: bootstrap.activeTaskId, boardColumn: columnRef.id },
          })
          const progressPayload = await invokeProjectmanTool(execution, options, {
            toolId: 'projectman.kanban-task.update',
            input: { id: bootstrap.activeTaskId, progress: 100 },
          })
          sideEffects.taskClose = {
            ok: true,
            taskId: bootstrap.activeTaskId,
            move: unwrapHostedToolResult(movePayload),
            progressSync: unwrapHostedToolResult(progressPayload),
          }
        } else {
          sideEffects.taskClose = { ok: true, taskId: bootstrap.activeTaskId, skipped: true, reason: 'already_closed' }
        }
      } catch (error) {
        sideEffects.taskClose = {
          ok: false,
          taskId: bootstrap.activeTaskId,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    // 3. Clear bootstrap active refs when a lifecycle registry exists.
    if (storedBootstrap) {
      const updatedBootstrap: PmBoardBootstrapRecord = {
        ...storedBootstrap,
        activeTaskId: undefined,
        activeSprintId: undefined,
      }
      const bootstrapResult = await persistPmBoardBootstrap(execution, options, storedBootstrap, updatedBootstrap)
      sideEffects.bootstrapUpdate = {
        ok: true,
        action: bootstrapResult.action,
        cleared: ['activeTaskId', 'activeSprintId'],
      }
    } else {
      sideEffects.bootstrapUpdate = {
        ok: true,
        skipped: true,
        reason: 'no_bootstrap_registry',
        guidance: 'Use pm board kickoff at the start of resumable board windows so closeout can clear active refs atomically.',
      }
    }

    emitFlowCommandResult(options, {
      command: 'pm.board.closeout',
      toolId: 'agentspace.memory-item.update-memory-item',
      surface: '/api/agent/tools',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        board: { id: boardId, label: extractEntityLabel(board) ?? boardSlug, slug: boardSlug },
      }),
      input: compactPayload({
        board: boardValue,
        task: manualTaskId,
        sprint: manualSprintId,
        content,
        skipMemory: options.skipMemory ?? false,
      }),
      result: {
        ok: true,
        registryMissing,
        fallbackMode: registryMissing ? 'manual' : undefined,
        board: compactPayload({
          id: boardId,
          name: extractEntityLabel(board),
          slug: boardSlug,
        }),
        closedTask: bootstrap.activeTaskId ?? null,
        closedSprint: bootstrap.activeSprintId ?? null,
        sideEffects,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm board closeout: ${message}`)
    process.exitCode = 1
  }
}

export async function runPmBoardKickoff(options: PmBoardKickoffOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const boardValue = normalizeNonEmpty(options.board)
    const title = normalizeNonEmpty(options.title)
    const goal = normalizeNonEmpty(options.goal)
    if (!boardValue) throw new Error('Missing required --board.')
    if (!title) throw new Error('Missing required --title.')
    if (!goal) throw new Error('Missing required --goal.')

    const execution = await prepareExecution(options)
    if (!execution) return

    const board = await resolveBoardRecord(execution, options, boardValue)
    const boardId = extractEntityId(board, ['id', 'boardId'])
    if (!boardId) throw new Error('Resolved board is missing an id.')
    const boardSlug = normalizeNonEmpty(board.slug) ?? slugifyPmBoardName(extractEntityLabel(board) ?? boardId)
    const bootstrap = await findPmBoardBootstrapMemory(execution, options, boardSlug)

    const currentTask = bootstrap?.activeTaskId
      ? await getProjectmanRecord(execution, options, 'projectman.kanban-task.get', bootstrap.activeTaskId)
      : null
    const reusableTask = currentTask && (await isPmTaskOpen(execution, options, currentTask)) ? currentTask : null
    const currentSprint = bootstrap?.activeSprintId
      ? await getProjectmanRecord(execution, options, 'projectman.sprint.get', bootstrap.activeSprintId)
      : null
    const reusableSprint =
      reusableTask &&
      currentSprint &&
      isPmSprintOpen(currentSprint) &&
      (!normalizeNonEmpty(currentSprint.kanbanTaskId) || normalizeNonEmpty(currentSprint.kanbanTaskId) === normalizeNonEmpty(reusableTask.id))
        ? currentSprint
        : null

    const taskDescription = normalizeNonEmpty(options.description)
    const sprintName = normalizeNonEmpty(options.sprintName) ?? title
    const references = normalizeArrayValues(options.reference)
    const scope = normalizeArrayValues(options.scopeItem)
    const validationPlan = normalizeArrayValues(options.validationItem)
    const notes = normalizeNonEmpty(options.notes)

    if (options.preview === true) {
      const previewColumn =
        !reusableTask
          ? await resolveBoardColumnReference(execution, options, {
              boardId,
              columnValue: normalizeNonEmpty(options.column) ?? 'Todo',
            })
          : undefined
      emitFlowCommandResult(options, {
        command: 'pm.board.kickoff',
        toolId: 'projectman.sprint.create',
        surface: '/api/agent/tools',
        resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
          board: { id: boardId, label: extractEntityLabel(board) ?? boardSlug, slug: boardSlug },
        }),
        input: compactPayload({
          board: boardValue,
          column: normalizeNonEmpty(options.column) ?? 'Todo',
          title,
          description: taskDescription,
          goal,
          sprintName,
          references,
          scope,
          validationPlan,
          notes,
        }),
        result: {
          ok: true,
          preview: true,
          reused: {
            task: Boolean(reusableTask),
            sprint: Boolean(reusableSprint),
          },
          task: reusableTask ?? compactPayload({
            title,
            description: taskDescription,
            boardId,
            boardColumn: previewColumn?.id,
          }),
          sprint: reusableSprint ?? compactPayload({
            name: sprintName,
            goal,
            kanbanTaskId: normalizeNonEmpty(reusableTask?.id),
            references,
            scope,
            validationPlan,
            notes,
          }),
          bootstrap: compactPayload({
            boardId,
            boardSlug,
            activeTaskId: normalizeNonEmpty(reusableTask?.id),
            activeSprintId: normalizeNonEmpty(reusableSprint?.id),
          }),
        },
      })
      return
    }

    let taskResult = reusableTask
    let taskCreated = false
    let resolvedColumn: ResolvedReference | undefined
    if (!taskResult) {
      const columnRef = await resolveBoardColumnReference(execution, options, {
        boardId,
        columnValue: normalizeNonEmpty(options.column) ?? 'Todo',
      })
      resolvedColumn = columnRef
      const taskInput: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext, {
        board: boardId,
        boardColumn: columnRef.id,
        title,
      })
      if (taskDescription) taskInput.description = taskDescription
      const payload = await invokeProjectmanTool(execution, options, {
        toolId: 'projectman.kanban-task.create',
        input: taskInput,
      })
      taskResult = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload)) ?? null
      taskCreated = true
    }

    const taskId = normalizeNonEmpty(taskResult?.id)
    if (!taskId) throw new Error('Kickoff task could not be resolved.')

    let sprintResult = reusableSprint
    let sprintCreated = false
    if (!sprintResult) {
      const sprintInput: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext, {
        kanbanTask: taskId,
        name: sprintName,
        goal,
      })
      if (references) sprintInput.references = references
      if (scope) sprintInput.scope = scope
      if (validationPlan) sprintInput.validationPlan = validationPlan
      if (notes) sprintInput.notes = notes
      const payload = await invokeProjectmanTool(execution, options, {
        toolId: 'projectman.sprint.create',
        input: sprintInput,
      })
      sprintResult = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload)) ?? null
      sprintCreated = true
    }

    const sprintId = normalizeNonEmpty(sprintResult?.id)
    const memoryMode: PmHandoffMode = taskCreated || sprintCreated ? 'kickoff' : 'resume'
    const memorySideEffect =
      sprintId
        ? await writePmMemorySideEffect(execution, options, {
            mode: memoryMode,
            subject: PM_HANDOFF_SUBJECTS.sprint,
            subjectId: sprintId,
            subjectTitle: normalizeNonEmpty(sprintResult?.name) ?? sprintName,
            content:
              normalizeNonEmpty(options.memoryContent) ??
              buildSprintKickoffMemoryContent({
                name: normalizeNonEmpty(sprintResult?.name) ?? sprintName,
                goal,
                scope,
                validationPlan,
                references,
                notes,
              }),
            nextAction: normalizeNonEmpty(options.memoryNextAction),
            validationState: normalizeNonEmpty(options.memoryValidationState),
            board,
            links: {
              kanbanTaskId: taskId,
              sprintId,
            },
          })
        : await writePmMemorySideEffect(execution, options, {
            mode: memoryMode,
            subject: PM_HANDOFF_SUBJECTS.ktask,
            subjectId: taskId,
            subjectTitle: normalizeNonEmpty(taskResult?.title) ?? title,
            content:
              normalizeNonEmpty(options.memoryContent) ??
              buildTaskKickoffMemoryContent({
                title,
                boardLabel: extractEntityLabel(board) ?? boardSlug,
                columnLabel: resolvedColumn?.label ?? normalizeNonEmpty(options.column) ?? 'Todo',
                description: taskDescription,
              }),
            nextAction: normalizeNonEmpty(options.memoryNextAction),
            validationState: normalizeNonEmpty(options.memoryValidationState),
            board,
            links: {
              kanbanTaskId: taskId,
            },
          })

    const nextBootstrap: PmBoardBootstrapRecord = {
      memoryId: bootstrap?.memoryId,
      boardId,
      boardSlug,
      title: bootstrap?.title ?? extractEntityLabel(board) ?? boardSlug,
      docId: bootstrap?.docId,
      docVersionId: bootstrap?.docVersionId,
      promptId: bootstrap?.promptId,
      promptVersionId: bootstrap?.promptVersionId,
      activeTaskId: taskId,
      activeSprintId: sprintId,
      references: bootstrap?.references ?? [],
      notes: bootstrap?.notes,
    }

    await persistPmBoardBootstrap(execution, { ...options, apply: true }, bootstrap ?? null, nextBootstrap)

    emitFlowCommandResult(options, {
      command: 'pm.board.kickoff',
      toolId: 'projectman.sprint.create',
      surface: '/api/agent/tools',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        board: { id: boardId, label: extractEntityLabel(board) ?? boardSlug, slug: boardSlug },
      }),
      input: compactPayload({
        board: boardValue,
        column: normalizeNonEmpty(options.column) ?? 'Todo',
        title,
        description: taskDescription,
        goal,
        sprintName,
        references,
        scope,
        validationPlan,
        notes,
      }),
      result: {
        ok: true,
        reused: {
          task: taskCreated === false,
          sprint: sprintCreated === false,
        },
        task: taskResult,
        sprint: sprintResult,
        bootstrap: nextBootstrap,
        sideEffects: memorySideEffect ? { memory: memorySideEffect } : undefined,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm board kickoff: ${augmentInvokeErrorMessage('projectman.sprint.create', message)}`)
    process.exitCode = 1
  }
}

export async function runPmTaskList(options: PmTaskListOptions = {}): Promise<void> {
  try {
    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext)

    let boardRef: ResolvedReference | undefined
    const boardValue = normalizeNonEmpty(options.board)
    if (boardValue) {
      boardRef = await resolveBoardReference(execution, options, boardValue)
      input.board = boardRef.id
    }

    const columnValue = normalizeNonEmpty(options.column)
    if (columnValue) {
      const columnRef = await resolveBoardColumnReference(execution, options, {
        boardId: boardRef?.id,
        columnValue,
      })
      input.boardColumn = columnRef.id
    }

    const sprint = normalizeNonEmpty(options.sprint)
    if (sprint) input.sprint = sprint

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.kanban-task.list',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.ktask.list',
      toolId: 'projectman.kanban-task.list',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        board: boardRef ?? null,
      }),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm ktask list: ${augmentInvokeErrorMessage('projectman.kanban-task.list', message)}`)
    process.exitCode = 1
  }
}

export async function runPmTaskGet(options: PmTaskRefOptions = {}): Promise<void> {
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const input = { id }
    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.kanban-task.get',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.ktask.get',
      toolId: 'projectman.kanban-task.get',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm ktask get: ${augmentInvokeErrorMessage('projectman.kanban-task.get', message)}`)
    process.exitCode = 1
  }
}

export async function runPmTaskSetStatus(options: PmTaskSetStatusOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const id = normalizeNonEmpty(options.id)
    const status = normalizeKanbanTaskStatusColumnInput(options.status)
    const explicitPosition = parseOptionalInteger(options.position, '--position')
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    // Context read: always a real read, never the command's --preview/--apply.
    // Routing this through invokeProjectmanTool made it inherit preview=true under
    // `set-status --preview`, which returns a preview-shaped task without boardId
    // (so it failed with "does not expose boardId" even though `ktask get` shows it).
    const taskPayload = await invokeProjectmanReadTool(execution, options, {
      toolId: 'projectman.kanban-task.get',
      input: { id },
    })
    const task = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(taskPayload))
    if (!task) throw new Error(`Task "${id}" was not found.`)
    const boardId = normalizeNonEmpty(task?.boardId)
    if (!boardId) {
      throw new Error(`Task "${id}" does not expose boardId; cannot resolve target board column.`)
    }

    const columnRef = await resolveBoardColumnReference(execution, options, {
      boardId,
      columnValue: status,
    })
    const statusHint = await buildTaskDoneStatusHint(execution, options, {
      rawTask: task,
      targetStatus: status,
      boardId,
    })

    const input: Record<string, unknown> = {
      id,
      boardColumn: columnRef.id,
    }
    if (explicitPosition !== undefined) input.position = explicitPosition

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.kanban-task.move',
      input,
    })

    let progressPayload: Record<string, unknown> | undefined
    if (isDoneLikeKanbanTaskStatusInput(status)) {
      progressPayload = await invokeProjectmanTool(execution, options, {
        toolId: 'projectman.kanban-task.update',
        input: {
          id,
          progress: 100,
        },
      })
    }
    const sideEffects = compactPayload({
      ...(progressPayload ? { progressSync: unwrapHostedToolResult(progressPayload) } : {}),
      ...(statusHint ? { statusHint } : {}),
    })

    emitCommandResult(options, {
      command: 'pm.ktask.set-status',
      toolId: 'projectman.kanban-task.move',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        board: {
          id: boardId,
        },
        column: {
          input: status,
          id: columnRef.id,
          label: columnRef.label ?? status,
        },
      }),
      input,
      payload,
      sideEffects: Object.keys(sideEffects).length > 0 ? sideEffects : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm ktask set-status: ${augmentInvokeErrorMessage('projectman.kanban-task.move', message)}`)
    process.exitCode = 1
  }
}

export async function runPmTaskDelete(options: PmTaskRefOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('delete', options)
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const input = { id }
    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.kanban-task.delete',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.ktask.delete',
      toolId: 'projectman.kanban-task.delete',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm ktask delete: ${augmentInvokeErrorMessage('projectman.kanban-task.delete', message)}`)
    process.exitCode = 1
  }
}

export async function runPmSprintCreate(options: PmSprintCreateOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const task = normalizeNonEmpty(options.task)
    const name = normalizeNonEmpty(options.name)
    const goal = normalizeNonEmpty(options.goal)
    if (!task) throw new Error('Missing required --task.')
    if (!name) throw new Error('Missing required --name.')
    if (!goal) throw new Error('Missing required --goal.')

    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext, {
      kanbanTask: task,
      name,
      goal,
    })

    const references = normalizeArrayValues(options.reference)
    const scope = normalizeArrayValues(options.scopeItem)
    const validationPlan = normalizeArrayValues(options.validationItem)
    const notes = normalizeNonEmpty(options.notes)
    if (references) input.references = references
    if (scope) input.scope = scope
    if (validationPlan) input.validationPlan = validationPlan
    if (notes) input.notes = notes

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.sprint.create',
      input,
    })
    const result = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload))
    const sprintId = normalizeNonEmpty(result?.id)
    const memorySideEffect =
      shouldWritePmMemory(options) && sprintId
        ? await writePmMemorySideEffect(execution, options, {
            mode: inferPmMemoryMode(options.memoryMode, 'kickoff'),
            subject: PM_HANDOFF_SUBJECTS.sprint,
            subjectId: sprintId,
            subjectTitle: normalizeNonEmpty(result?.name) ?? name,
            content:
              normalizeNonEmpty(options.memoryContent) ??
              buildSprintKickoffMemoryContent({
                name,
                goal,
                scope,
                validationPlan,
                references,
                notes,
              }),
            nextAction: normalizeNonEmpty(options.memoryNextAction),
            validationState: normalizeNonEmpty(options.memoryValidationState),
            links: {
              kanbanTaskId: task,
              sprintId,
            },
          })
        : undefined

    emitCommandResult(options, {
      command: 'pm.sprint.create',
      toolId: 'projectman.sprint.create',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
      sideEffects: memorySideEffect ? { memory: memorySideEffect } : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm sprint create: ${augmentInvokeErrorMessage('projectman.sprint.create', message)}`)
    process.exitCode = 1
  }
}

export async function runPmSprintList(options: PmSprintListOptions = {}): Promise<void> {
  try {
    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext)
    const task = normalizeNonEmpty(options.task)
    const name = normalizeNonEmpty(options.name)
    const status = normalizeNonEmpty(options.status)
    const limit = parseOptionalInteger(options.limit, '--limit')
    if (task) input.kanbanTask = task
    if (name) input.name = name
    if (status) input.status = status
    if (limit !== undefined) input.limit = limit
    if (options.summary) input.summary = true
    if (options.includeArchived === true) input.includeArchived = true

    const rawPayload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.sprint.list',
      input,
    })
    const records = toRecordArray(unwrapHostedToolResult(rawPayload))
    const counts = archiveCounts(records)
    const visibleRecords = limit === undefined ? records : records.slice(0, limit)
    const data = options.summary ? visibleRecords.map(summarizeSprintListRecord) : visibleRecords
    const payload = {
      response: compactPayload({
        data,
        count: records.length,
        shown: data.length,
        hasMore: data.length < records.length,
        ...counts,
        includeArchived: options.includeArchived === true,
        filters: compactPayload({ task, name, status }),
        summary: options.summary ? true : undefined,
      }),
    }

    emitCommandResult(options, {
      command: 'pm.sprint.list',
      toolId: 'projectman.sprint.list',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm sprint list: ${augmentInvokeErrorMessage('projectman.sprint.list', message)}`)
    process.exitCode = 1
  }
}

export async function runPmStatusAudit(options: PmStatusAuditOptions = {}): Promise<void> {
  try {
    const execution = await prepareExecution(options)
    if (!execution) return

    const taskInput: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext)
    const sprintInput: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext)
    const boardValue = normalizeNonEmpty(options.board)
    const taskSelector = normalizeNonEmpty(options.task)
    const sprintSelector = normalizeNonEmpty(options.sprint)

    let boardRef: ResolvedReference | undefined
    if (boardValue) {
      boardRef = await resolveBoardReference(execution, options, boardValue)
    }

    const [taskPayload, sprintPayload, boards] = await Promise.all([
      invokeProjectmanReadTool(execution, options, {
        toolId: 'projectman.kanban-task.list',
        input: taskInput,
      }),
      invokeProjectmanReadToolWithArchiveHint(execution, options, {
        toolId: 'projectman.sprint.list',
        input: sprintInput,
      }),
      listProjectmanBoards(execution, options, { includeArchived: true }),
    ])

    // issue 0107ec98: kanban-board-column.list only returns the correct rows when
    // filtered by a board ID — a slug or an empty filter returns an incomplete set.
    // Fetch per board id (just the target board when --board is given, otherwise
    // every board) so the column index is complete.
    const columnSourceBoardIds = boardRef
      ? [boardRef.id]
      : boards
          .map((board) => firstRecordAlias(board, ['id', 'localId', 'remoteId', 'boardId']))
          .filter((id): id is string => Boolean(id))
    const boardColumnRows: Record<string, unknown>[] = []
    for (const sourceBoardId of columnSourceBoardIds) {
      try {
        const boardColumnPayload = await invokeProjectmanReadTool(execution, options, {
          toolId: 'projectman.kanban-board-column.list',
          input: { board: sourceBoardId },
        })
        boardColumnRows.push(...toRecordArray(unwrapHostedToolResult(boardColumnPayload)))
      } catch {
        // Skip this board's columns; the audit degrades gracefully.
      }
    }

    // issue 0107ec98: board-column rows are link records (columnId only); fetch the
    // kanban-column entities so the index resolves the column name/slug (done/doing/
    // etc.) instead of falling back to 'other' and raising false drift findings.
    let columnEntities: Record<string, unknown>[] = []
    try {
      const columnPayload = await invokeProjectmanReadTool(execution, options, {
        toolId: 'projectman.kanban-column.list',
        input: buildOwnerScopedInput(execution.resolvedContext),
      })
      columnEntities = toRecordArray(unwrapHostedToolResult(columnPayload))
    } catch {
      columnEntities = []
    }

    const tasks = toRecordArray(unwrapHostedToolResult(taskPayload))
    const sprints = toRecordArray(unwrapHostedToolResult(sprintPayload))
    const columnIndex = buildPmStatusAuditColumnIndex(boards, boardColumnRows, columnEntities)
    const audit = summarizePmStatusAudit(tasks, sprints, columnIndex, {
      board: boardValue,
      boardId: boardRef?.id,
      task: taskSelector,
      sprint: sprintSelector,
    }, options.nowMs)
    const table = renderPmStatusAuditTable(audit)
    const result = {
      ...audit,
      table,
    }
    const envelope = compactPayload({
      command: 'pm.status.audit',
      toolId: 'projectman.status.audit',
      surface: '/api/agent/tools',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        board: boardRef ?? null,
      }),
      input: compactPayload({
        taskInput,
        sprintInput,
        filters: compactPayload({
          board: boardValue,
          task: taskSelector,
          sprint: sprintSelector,
        }),
      }),
      result,
    })

    if (options.json) {
      console.log(JSON.stringify(envelope, null, 2))
      return
    }

    logSuccess('pm.status.audit completed.')
    logInfo('Read-only audit: no Projectman records were mutated.')
    console.log(table)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm status audit: ${augmentInvokeErrorMessage('projectman.status.audit', message)}`)
    process.exitCode = 1
  }
}

export async function runPmStatusReconcile(options: PmStatusReconcileOptions = {}): Promise<void> {
  try {
    const execution = await prepareExecution(options)
    if (!execution) return

    const taskInput: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext)
    const sprintInput: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext)
    const boardValue = normalizeNonEmpty(options.board)
    const taskSelector = normalizeNonEmpty(options.task)
    const applyRequested = options.apply === true
    const preview = options.preview === true || !applyRequested

    let boardRef: ResolvedReference | undefined
    if (boardValue) {
      boardRef = await resolveBoardReference(execution, options, boardValue)
    }

    const [taskPayload, sprintPayload, boards] = await Promise.all([
      invokeProjectmanReadTool(execution, options, {
        toolId: 'projectman.kanban-task.list',
        input: taskInput,
      }),
      invokeProjectmanReadToolWithArchiveHint(execution, options, {
        toolId: 'projectman.sprint.list',
        input: sprintInput,
      }),
      listProjectmanBoards(execution, options, { includeArchived: true }),
    ])

    let boardColumnRows: Record<string, unknown>[] = []
    try {
      const boardColumnPayload = await invokeProjectmanReadTool(execution, options, {
        toolId: 'projectman.kanban-board-column.list',
        input: boardRef ? { board: boardRef.id } : {},
      })
      boardColumnRows = toRecordArray(unwrapHostedToolResult(boardColumnPayload))
    } catch {
      boardColumnRows = []
    }

    // issue 0107ec98: enrich with kanban-column entities so the column name/slug
    // (and done/doing classification) resolve instead of falling back to 'other'.
    let columnEntities: Record<string, unknown>[] = []
    try {
      const columnPayload = await invokeProjectmanReadTool(execution, options, {
        toolId: 'projectman.kanban-column.list',
        input: buildOwnerScopedInput(execution.resolvedContext),
      })
      columnEntities = toRecordArray(unwrapHostedToolResult(columnPayload))
    } catch {
      columnEntities = []
    }

    const tasks = toRecordArray(unwrapHostedToolResult(taskPayload))
    const sprints = toRecordArray(unwrapHostedToolResult(sprintPayload))
    const columnIndex = buildPmStatusAuditColumnIndex(boards, boardColumnRows, columnEntities)
    const { rawTask, task } = selectSinglePmStatusTask(tasks, columnIndex, {
      board: boardValue,
      boardId: boardRef?.id,
      task: taskSelector,
    })
    const linkedSprints = collectPmStatusLinkedSprintsForTask(rawTask, task, sprints)
    const targetBoardId = task.column?.boardId ?? boardRef?.id ?? task.boardId
    const targetColumn = targetBoardId
      ? await resolveBoardColumnReference(execution, options, {
          boardId: targetBoardId,
          columnValue: 'done',
        })
      : undefined
    const previewResult = buildPmStatusReconcilePreview({
      task,
      linkedSprints,
      targetColumn,
      apply: applyRequested,
      preview,
    })

    let result: Record<string, unknown> = previewResult
    if (applyRequested && !preview) {
      if (previewResult.eligible !== true) {
        result = {
          ...previewResult,
          ok: false,
          applied: false,
          refused: true,
        }
      } else if (previewResult.action === 'normalize_progress') {
        // issue 06d57e0a: task already in the Done column; only normalize stale
        // progress to 100 (no column move) since the move path does not apply.
        const progressPayload = await invokeProjectmanTool(execution, options, {
          toolId: 'projectman.kanban-task.update',
          input: {
            id: task.id,
            progress: 100,
          },
        })
        const readbackPayload = await invokeProjectmanReadTool(execution, options, {
          toolId: 'projectman.kanban-task.get',
          input: { id: task.id },
        })
        result = {
          ...previewResult,
          ok: true,
          preview: false,
          applied: true,
          refused: false,
          mutation: {
            progress: unwrapHostedToolResult(progressPayload),
          },
          readback: unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(readbackPayload)),
        }
      } else {
        if (!targetColumn?.id) {
          throw new Error('Could not resolve Done column for the selected task.')
        }
        const moveInput = {
          id: task.id,
          boardColumn: targetColumn.id,
        }
        const progressInput = {
          id: task.id,
          progress: 100,
        }
        const movePayload = await invokeProjectmanTool(execution, options, {
          toolId: 'projectman.kanban-task.move',
          input: moveInput,
        })
        const progressPayload = await invokeProjectmanTool(execution, options, {
          toolId: 'projectman.kanban-task.update',
          input: progressInput,
        })
        const readbackPayload = await invokeProjectmanReadTool(execution, options, {
          toolId: 'projectman.kanban-task.get',
          input: { id: task.id },
        })
        result = {
          ...previewResult,
          ok: true,
          preview: false,
          applied: true,
          refused: false,
          mutation: {
            move: unwrapHostedToolResult(movePayload),
            progress: unwrapHostedToolResult(progressPayload),
          },
          readback: unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(readbackPayload)),
        }
      }
    }

    const envelope = compactPayload({
      command: 'pm.status.reconcile',
      toolId: 'projectman.status.reconcile',
      surface: '/api/agent/tools',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        board: boardRef ?? null,
      }),
      input: compactPayload({
        taskInput,
        sprintInput,
        filters: compactPayload({
          board: boardValue,
          task: taskSelector,
        }),
        apply: applyRequested,
        preview,
      }),
      result,
    })

    if (options.json) {
      console.log(JSON.stringify(envelope, null, 2))
    } else {
      if (result.applied === true) {
        logSuccess('pm.status.reconcile applied.')
      } else if (result.refused === true) {
        logWarn('pm.status.reconcile refused by guard.')
      } else {
        logInfo('pm.status.reconcile preview ready.')
      }
      console.log(JSON.stringify(result, null, 2))
    }

    if (applyRequested && !preview && result.ok === false) {
      process.exitCode = 1
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm status reconcile: ${augmentInvokeErrorMessage('projectman.status.reconcile', message)}`)
    process.exitCode = 1
  }
}

export async function runPmSprintGet(options: PmSprintRefOptions = {}): Promise<void> {
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const input = { id }
    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.sprint.get',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.sprint.get',
      toolId: 'projectman.sprint.get',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm sprint get: ${augmentInvokeErrorMessage('projectman.sprint.get', message)}`)
    process.exitCode = 1
  }
}

async function runPmSprintArchiveChange(
  action: 'archive' | 'unarchive',
  options: PmSprintArchiveOptions = {},
): Promise<void> {
  try {
    ensureWriteFlags('update', options)
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const input = { id }
    const toolId = `projectman.sprint.${action}`
    const payload = await invokeProjectmanTool(execution, options, {
      toolId,
      input,
    })

    emitCommandResult(options, {
      command: `pm.sprint.${action}`,
      toolId,
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm sprint ${action}: ${augmentInvokeErrorMessage(`projectman.sprint.${action}`, message)}`)
    process.exitCode = 1
  }
}

export async function runPmSprintArchive(options: PmSprintArchiveOptions = {}): Promise<void> {
  await runPmSprintArchiveChange('archive', options)
}

export async function runPmSprintUnarchive(options: PmSprintArchiveOptions = {}): Promise<void> {
  await runPmSprintArchiveChange('unarchive', options)
}

export async function runPmSprintSetStatus(options: PmSprintSetStatusOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')
    const targetStatus = normalizeNonEmpty(options.status)?.toLowerCase()
    if (!targetStatus) throw new Error('Missing required --status.')

    const validStatuses = new Set(['todo', 'doing', 'blocked', 'paused', 'in_review', 'completed', 'cancelled', 'postponed', 'done'])
    const resolvedStatus = targetStatus === 'done' || targetStatus === 'complete' ? 'completed' : targetStatus
    if (!validStatuses.has(targetStatus)) {
      throw new Error(`Invalid --status "${targetStatus}". Expected one of: ${[...validStatuses].join(', ')}.`)
    }

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const sprintPayload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.sprint.get',
      input: { id },
    })
    const sprint = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(sprintPayload))
    if (!sprint) throw new Error(`Sprint "${id}" was not found.`)

    const phases = cloneSprintPhases(sprint.phases)
    const microtaskCount = phases.reduce((sum, phase) => sum + phase.microtasks.length, 0)
    if (microtaskCount === 0) {
      throw new Error(
        `Sprint "${id}" has no microtasks. pm sprint set-status derives sprint status from microtasks; add at least one microtask first.`,
      )
    }

    for (const phase of phases) {
      for (const microtask of phase.microtasks) {
        microtask.status = resolvedStatus
      }
    }

    const input: Record<string, unknown> = {
      id,
      phases: phases.map((phase) => ({
        id: phase.id,
        name: phase.name,
        description: phase.description,
        position: phase.position,
        microtasks: phase.microtasks.map((microtask) => ({
          id: microtask.id,
          title: microtask.title,
          status: microtask.status,
          position: microtask.position,
          notes: microtask.notes,
          parentIssueId: microtask.parentIssueId,
        })),
      })),
    }
    const projectedSprint = {
      ...sprint,
      status: resolvedStatus,
      phases: input.phases,
    }
    const statusHint = await buildSprintCompletedStatusHint(execution, options, {
      rawSprint: projectedSprint,
      targetStatus: resolvedStatus,
    })
    const sideEffects = compactPayload({
      ...(statusHint ? { statusHint } : {}),
    })

    if (options.preview === true) {
      emitCommandResult(options, {
        command: 'pm.sprint.set-status',
        toolId: 'projectman.sprint.update-plan',
        resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
          targetStatus: resolvedStatus,
          microtasksUpdated: microtaskCount,
        }),
        input,
        payload: {
          ok: true,
          response: {
            data: {
              preview: true,
              action: 'set-status',
              targetStatus: resolvedStatus,
              microtasksUpdated: microtaskCount,
              input,
              message: 'Validated sprint status update. Re-run with --apply to persist the updated microtask statuses.',
            },
          },
        },
        sideEffects: Object.keys(sideEffects).length > 0 ? sideEffects : undefined,
      })
      return
    }

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.sprint.update-plan',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.sprint.set-status',
      toolId: 'projectman.sprint.update-plan',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        targetStatus: resolvedStatus,
        microtasksUpdated: microtaskCount,
      }),
      input,
      payload,
      sideEffects: Object.keys(sideEffects).length > 0 ? sideEffects : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm sprint set-status: ${augmentInvokeErrorMessage('projectman.sprint.update-plan', message)}`)
    process.exitCode = 1
  }
}

export async function runPmSprintDelete(options: PmSprintRefOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('delete', options)
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const input = { id }
    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.sprint.delete',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.sprint.delete',
      toolId: 'projectman.sprint.delete',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm sprint delete: ${augmentInvokeErrorMessage('projectman.sprint.delete', message)}`)
    process.exitCode = 1
  }
}

export async function runPmSprintUpdatePlan(options: PmSprintUpdatePlanOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const sprintId = normalizeNonEmpty(options.id)
    if (!sprintId) throw new Error('Missing required --id.')

    const name = normalizeNonEmpty(options.name)
    const goal = normalizeNonEmpty(options.goal)
    const references = normalizeArrayValues(options.reference)
    const scope = normalizeArrayValues(options.scopeItem)
    const validationPlan = normalizeArrayValues(options.validationItem)
    const notes = normalizeNonEmpty(options.notes)
    const phasesRaw = parseJsonArrayOption(options.phasesJson, '--phases-json')
    const phases = phasesRaw ? validateSprintPhasePlanInput(phasesRaw, '--phases-json') : undefined
    const expectedUpdatedAt = normalizeNonEmpty(options.expectedUpdatedAt)

    if (!name && !goal && !references && !scope && !validationPlan && !notes && !phases && !expectedUpdatedAt) {
      throw new Error('Provide at least one patch field: --name, --goal, --reference, --scope-item, --validation-item, --notes, --phases-json, or --expected-updated-at.')
    }

    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = { id: sprintId }
    if (name) input.name = name
    if (goal) input.goal = goal
    if (references) input.references = references
    if (scope) input.scope = scope
    if (validationPlan) input.validationPlan = validationPlan
    if (notes) input.notes = notes
    if (phases) input.phases = phases
    if (expectedUpdatedAt) input.expectedUpdatedAt = expectedUpdatedAt

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.sprint.update-plan',
      input,
    })
    const result = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload))
    const memorySideEffect =
      shouldWritePmMemory(options)
        ? await writePmMemorySideEffect(execution, options, {
            mode: inferPmMemoryMode(options.memoryMode, 'resume'),
            subject: PM_HANDOFF_SUBJECTS.sprint,
            subjectId: sprintId,
            subjectTitle: normalizeNonEmpty(result?.name) ?? name ?? sprintId,
            content:
              normalizeNonEmpty(options.memoryContent) ??
              `Sprint plani guncellendi: ${normalizeNonEmpty(result?.name) ?? name ?? sprintId}.`,
            nextAction: normalizeNonEmpty(options.memoryNextAction),
            validationState: normalizeNonEmpty(options.memoryValidationState),
            links: {
              sprintId,
            },
          })
        : undefined

    emitCommandResult(options, {
      command: 'pm.sprint.update-plan',
      toolId: 'projectman.sprint.update-plan',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        sprint: {
          id: sprintId,
          label: normalizeNonEmpty(result?.name) ?? name ?? sprintId,
        },
      }),
      input,
      payload,
      sideEffects: memorySideEffect ? { memory: memorySideEffect } : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm sprint update-plan: ${augmentInvokeErrorMessage('projectman.sprint.update-plan', message)}`)
    process.exitCode = 1
  }
}

export async function runPmPlanCreate(options: PmPlanCreateOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const task = normalizeNonEmpty(options.task)
    const name = normalizeNonEmpty(options.name)
    const goal = normalizeNonEmpty(options.goal)
    if (!task) throw new Error('Missing required --task.')
    if (!name) throw new Error('Missing required --name.')
    if (!goal) throw new Error('Missing required --goal.')

    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext, {
      kanbanTask: task,
      name,
      goal,
    })

    const references = normalizeArrayValues(options.reference)
    const scope = normalizeArrayValues(options.scopeItem)
    const validationPlan = normalizeArrayValues(options.validationItem)
    const notes = normalizeNonEmpty(options.notes)
    if (references) input.references = references
    if (scope) input.scope = scope
    if (validationPlan) input.validationPlan = validationPlan
    if (notes) input.notes = notes

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.implementation-plan.create',
      input,
    })
    const result = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload))
    const planId = normalizeNonEmpty(result?.id)
    const memorySideEffect =
      shouldWritePmMemory(options) && planId
        ? await writePmMemorySideEffect(execution, options, {
            mode: inferPmMemoryMode(options.memoryMode, 'kickoff'),
            subject: PM_HANDOFF_SUBJECTS.sprint,
            subjectId: planId,
            subjectTitle: normalizeNonEmpty(result?.name) ?? name,
            content:
              normalizeNonEmpty(options.memoryContent) ??
              buildSprintKickoffMemoryContent({
                name,
                goal,
                scope,
                validationPlan,
                references,
                notes,
              }),
            nextAction: normalizeNonEmpty(options.memoryNextAction),
            validationState: normalizeNonEmpty(options.memoryValidationState),
            links: {
              kanbanTaskId: task,
              sprintId: planId,
            },
          })
        : undefined

    emitCommandResult(options, {
      command: 'plan.create',
      toolId: 'projectman.implementation-plan.create',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        implementationPlan: compactPayload({
          id: planId ?? null,
          source: 'projectman.sprint',
        }),
      }),
      input,
      payload,
      sideEffects: memorySideEffect ? { memory: memorySideEffect } : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute plan create: ${augmentInvokeErrorMessage('projectman.implementation-plan.create', message)}`)
    process.exitCode = 1
  }
}

export async function runPmPlanList(options: PmPlanListOptions = {}): Promise<void> {
  try {
    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext)
    const task = normalizeNonEmpty(options.task)
    const name = normalizeNonEmpty(options.name)
    const status = normalizeNonEmpty(options.status)
    const limit = parseOptionalInteger(options.limit, '--limit')
    if (task) input.kanbanTask = task
    if (name) input.name = name
    if (options.includeArchived === true) input.includeArchived = true

    const rawPayload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.implementation-plan.list',
      input,
    })
    let records = toRecordArray(unwrapHostedToolResult(rawPayload))
    if (status) {
      records = records.filter((record) => normalizeExactLabel(record.status) === normalizeExactLabel(status))
    }
    const counts = archiveCounts(records)
    const visibleRecords = limit === undefined ? records : records.slice(0, limit)
    const data = options.summary ? visibleRecords.map(summarizeSprintListRecord) : visibleRecords
    const payload = {
      response: compactPayload({
        data,
        count: records.length,
        shown: data.length,
        hasMore: data.length < records.length,
        ...counts,
        includeArchived: options.includeArchived === true,
        filters: compactPayload({ task, name, status }),
        summary: options.summary ? true : undefined,
        source: 'projectman.sprint',
      }),
    }

    emitCommandResult(options, {
      command: 'plan.list',
      toolId: 'projectman.implementation-plan.list',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute plan list: ${augmentInvokeErrorMessage('projectman.implementation-plan.list', message)}`)
    process.exitCode = 1
  }
}

export async function runPmPlanGet(options: PmPlanRefOptions = {}): Promise<void> {
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const input = { id }
    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.implementation-plan.get',
      input,
    })

    emitCommandResult(options, {
      command: 'plan.get',
      toolId: 'projectman.implementation-plan.get',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        implementationPlan: compactPayload({
          id,
          source: 'projectman.sprint',
        }),
      }),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute plan get: ${augmentInvokeErrorMessage('projectman.implementation-plan.get', message)}`)
    process.exitCode = 1
  }
}

export async function runPmPlanUpdate(options: PmPlanUpdateOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('update', options)
    const planId = normalizeNonEmpty(options.id)
    if (!planId) throw new Error('Missing required --id.')

    const name = normalizeNonEmpty(options.name)
    const goal = normalizeNonEmpty(options.goal)
    const references = normalizeArrayValues(options.reference)
    const scope = normalizeArrayValues(options.scopeItem)
    const validationPlan = normalizeArrayValues(options.validationItem)
    const notes = normalizeNonEmpty(options.notes)
    const phasesRaw = parseJsonArrayOption(options.phasesJson, '--phases-json')
    const phases = phasesRaw ? validateSprintPhasePlanInput(phasesRaw, '--phases-json') : undefined
    const expectedUpdatedAt = normalizeNonEmpty(options.expectedUpdatedAt)

    if (!name && !goal && !references && !scope && !validationPlan && !notes && !phases && !expectedUpdatedAt) {
      throw new Error('Provide at least one patch field: --name, --goal, --reference, --scope-item, --validation-item, --notes, --phases-json, or --expected-updated-at.')
    }

    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = { id: planId }
    if (name) input.name = name
    if (goal) input.goal = goal
    if (references) input.references = references
    if (scope) input.scope = scope
    if (validationPlan) input.validationPlan = validationPlan
    if (notes) input.notes = notes
    if (phases) input.phases = phases
    if (expectedUpdatedAt) input.expectedUpdatedAt = expectedUpdatedAt

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.implementation-plan.update',
      input,
    })
    const result = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload))
    const memorySideEffect =
      shouldWritePmMemory(options)
        ? await writePmMemorySideEffect(execution, options, {
            mode: inferPmMemoryMode(options.memoryMode, 'resume'),
            subject: PM_HANDOFF_SUBJECTS.sprint,
            subjectId: planId,
            subjectTitle: normalizeNonEmpty(result?.name) ?? name ?? planId,
            content:
              normalizeNonEmpty(options.memoryContent) ??
              `Implementation plan guncellendi: ${normalizeNonEmpty(result?.name) ?? name ?? planId}.`,
            nextAction: normalizeNonEmpty(options.memoryNextAction),
            validationState: normalizeNonEmpty(options.memoryValidationState),
            links: {
              sprintId: planId,
            },
          })
        : undefined

    emitCommandResult(options, {
      command: 'plan.update',
      toolId: 'projectman.implementation-plan.update',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        implementationPlan: compactPayload({
          id: planId,
          label: normalizeNonEmpty(result?.name) ?? name ?? planId,
          source: 'projectman.sprint',
        }),
      }),
      input,
      payload,
      sideEffects: memorySideEffect ? { memory: memorySideEffect } : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute plan update: ${augmentInvokeErrorMessage('projectman.implementation-plan.update', message)}`)
    process.exitCode = 1
  }
}

export async function runPmUtaskCreate(options: PmUtaskCreateOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const sprintId = normalizeNonEmpty(options.sprint)
    const phaseInput = normalizeNonEmpty(options.phase) ?? 'Main'
    const title = normalizeNonEmpty(options.title)
    const notes = normalizeNonEmpty(options.notes)
    const status = normalizeMicrotaskStatusInput(options.status)
    const explicitPosition = parseOptionalInteger(options.position, '--position')

    if (!sprintId) throw new Error('Missing required --sprint.')
    if (!title) throw new Error('Missing required --title.')

    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = {
      id: sprintId,
      phase: phaseInput,
      title,
      status,
    }
    if (notes) input.notes = notes
    if (explicitPosition !== undefined) input.position = explicitPosition

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.sprint.add-microtask',
      input,
    })

    const result = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload))
    const resultPhases = cloneSprintPhases(result?.phases)
    const resultTargetPhase =
      resultPhases.find((phase) => normalizeNonEmpty(phase.id) === phaseInput) ??
      resultPhases.find((phase) => normalizeExactLabel(phase.name) === normalizeExactLabel(phaseInput))
    const createdMicrotask =
      resultTargetPhase?.microtasks.find((microtask) => normalizeExactLabel(microtask.title) === normalizeExactLabel(title)) ?? null
    const createdMicrotaskId = normalizeNonEmpty(createdMicrotask?.id)
    const resolvedMemoryMode =
      shouldWritePmMemory(options) && createdMicrotaskId
        ? inferPmMemoryMode(options.memoryMode, 'kickoff', createdMicrotask?.status)
        : undefined
    const memorySideEffect =
      shouldWritePmMemory(options) && createdMicrotaskId
        ? await writePmMemorySideEffect(execution, options, {
            mode: resolvedMemoryMode ?? 'kickoff',
            subject: PM_HANDOFF_SUBJECTS.utask,
            subjectId: createdMicrotaskId,
            subjectTitle: createdMicrotask?.title ?? title,
            content:
              normalizeNonEmpty(options.memoryContent) ??
              buildUtaskMemoryContent({
                mode: resolvedMemoryMode ?? 'kickoff',
                title: createdMicrotask?.title ?? title,
                sprintLabel: normalizeNonEmpty(result?.name) ?? sprintId,
                phaseLabel: resultTargetPhase?.name ?? phaseInput,
                status: createdMicrotask?.status ?? status,
                notes,
              }),
            nextAction: normalizeNonEmpty(options.memoryNextAction),
            validationState: normalizeNonEmpty(options.memoryValidationState),
            links: {
              sprintId,
              phaseId: resultTargetPhase?.id,
              microtaskId: createdMicrotaskId,
            },
          })
        : undefined

    emitCommandResult(options, {
      command: 'pm.utask.create',
      toolId: 'projectman.sprint.add-microtask',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        sprint: {
          input: sprintId,
          id: sprintId,
          label: normalizeNonEmpty(result?.name) ?? sprintId,
        },
        phase: {
          input: phaseInput,
          id: resultTargetPhase?.id ?? null,
          label: resultTargetPhase?.name ?? phaseInput,
        },
        utask: createdMicrotask
          ? {
              id: createdMicrotask.id ?? null,
              title: createdMicrotask.title,
              status: createdMicrotask.status,
              parentIssueId: createdMicrotask.parentIssueId,
            }
          : null,
      }),
      input,
      payload,
      sideEffects: memorySideEffect ? { memory: memorySideEffect } : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm utask create: ${augmentInvokeErrorMessage('projectman.sprint.add-microtask', message)}`)
    process.exitCode = 1
  }
}

export async function runPmUtaskUpdate(options: PmUtaskUpdateOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const sprintId = normalizeNonEmpty(options.sprint)
    const microtaskId = normalizeNonEmpty(options.id)
    const title = normalizeNonEmpty(options.title)
    const notes = normalizeNonEmpty(options.notes)
    const explicitPosition = parseOptionalInteger(options.position, '--position')
    const status = options.status === undefined ? undefined : normalizeMicrotaskStatusInput(options.status)

    if (!sprintId) throw new Error('Missing required --sprint.')
    if (!microtaskId) throw new Error('Missing required --id.')
    if (!title && notes === undefined && explicitPosition === undefined && status === undefined) {
      throw new Error('Provide at least one patch field: --title, --status, --notes, or --position.')
    }

    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = {
      id: sprintId,
      microTask: microtaskId,
    }
    if (title) input.title = title
    if (notes !== undefined) input.notes = notes
    if (explicitPosition !== undefined) input.position = explicitPosition
    if (status) input.status = status

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.sprint.update-microtask',
      input,
    })

    const result = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload))
    const resultPhases = cloneSprintPhases(result?.phases)
    const updatedMicrotask =
      resultPhases.flatMap((phase) => phase.microtasks).find((microtask) => normalizeNonEmpty(microtask.id) === microtaskId) ?? null
    const updatedPhase = resultPhases.find((phase) =>
      phase.microtasks.some((microtask) => normalizeNonEmpty(microtask.id) === microtaskId),
    )
    const resolvedMemoryMode = shouldWritePmMemory(options)
      ? inferPmMemoryMode(options.memoryMode, 'resume', updatedMicrotask?.status ?? status)
      : undefined
    const memorySideEffect = shouldWritePmMemory(options)
      ? await writePmMemorySideEffect(execution, options, {
          mode: resolvedMemoryMode ?? 'resume',
          subject: PM_HANDOFF_SUBJECTS.utask,
          subjectId: microtaskId,
          subjectTitle: updatedMicrotask?.title ?? title ?? microtaskId,
          content:
            normalizeNonEmpty(options.memoryContent) ??
            buildUtaskMemoryContent({
              mode: resolvedMemoryMode ?? 'resume',
              title: updatedMicrotask?.title ?? title ?? microtaskId,
              sprintLabel: normalizeNonEmpty(result?.name) ?? sprintId,
              phaseLabel: updatedPhase?.name,
              status: updatedMicrotask?.status ?? status,
              notes: updatedMicrotask?.notes ?? notes,
            }),
          nextAction: normalizeNonEmpty(options.memoryNextAction),
          validationState: normalizeNonEmpty(options.memoryValidationState),
          links: {
            sprintId,
            phaseId: updatedPhase?.id,
            microtaskId,
          },
        })
      : undefined

    emitCommandResult(options, {
      command: 'pm.utask.update',
      toolId: 'projectman.sprint.update-microtask',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        sprint: {
          input: sprintId,
          id: sprintId,
          label: normalizeNonEmpty(result?.name) ?? sprintId,
        },
        utask: updatedMicrotask
          ? {
              id: updatedMicrotask.id ?? null,
              title: updatedMicrotask.title,
              status: updatedMicrotask.status,
              parentIssueId: updatedMicrotask.parentIssueId,
            }
          : {
              id: microtaskId,
              title: title ?? null,
              status: status ?? null,
            },
      }),
      input,
      payload,
      sideEffects: memorySideEffect ? { memory: memorySideEffect } : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm utask update: ${augmentInvokeErrorMessage('projectman.sprint.update-microtask', message)}`)
    process.exitCode = 1
  }
}

export async function runPmUtaskSetStatus(options: PmUtaskSetStatusOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const sprintId = normalizeNonEmpty(options.sprint)
    const microtaskId = normalizeNonEmpty(options.id)
    const status = normalizeMicrotaskStatusInput(options.status)

    if (!sprintId) throw new Error('Missing required --sprint.')
    if (!microtaskId) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = {
      id: sprintId,
      microTask: microtaskId,
      status,
    }

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.sprint.update-microtask-status',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.utask.set-status',
      toolId: 'projectman.sprint.update-microtask-status',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        sprint: {
          input: sprintId,
          id: sprintId,
        },
        utask: {
          id: microtaskId,
          status,
        },
      }),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(
      `Failed to execute pm utask set-status: ${augmentInvokeErrorMessage('projectman.sprint.update-microtask-status', message)}`,
    )
    process.exitCode = 1
  }
}

export async function runPmUtaskDelete(options: PmUtaskDeleteOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('delete', options)
    const sprintId = normalizeNonEmpty(options.sprint)
    const microtaskId = normalizeNonEmpty(options.id)

    if (!sprintId) throw new Error('Missing required --sprint.')
    if (!microtaskId) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = {
      id: sprintId,
      microTask: microtaskId,
    }

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.sprint.delete-microtask',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.utask.delete',
      toolId: 'projectman.sprint.delete-microtask',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        sprint: {
          input: sprintId,
          id: sprintId,
        },
        utask: {
          id: microtaskId,
        },
      }),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm utask delete: ${augmentInvokeErrorMessage('projectman.sprint.delete-microtask', message)}`)
    process.exitCode = 1
  }
}

export async function runPmIssueList(options: PmIssueListOptions = {}): Promise<void> {
  try {
    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext)
    assignIssueLikeLinks(input, {
      task: options.task,
      sprint: options.sprint,
      utask: options.utask,
      reviewRequest: options.reviewRequest,
    })

    const status = normalizeNonEmpty(options.status)
    const severity = normalizeNonEmpty(options.severity)
    const source = normalizeNonEmpty(options.source)
    const tags = normalizeArrayValues(options.tag)
    if (status) input.status = status
    if (severity) input.severity = severity
    if (source) input.source = source
    if (tags) input.tags = tags

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.issue.list',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.issue.list',
      toolId: 'projectman.issue.list',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm issue list: ${augmentInvokeErrorMessage('projectman.issue.list', message)}`)
    process.exitCode = 1
  }
}

export async function runPmIssueGet(options: PmIssueRefOptions = {}): Promise<void> {
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const input = { id }
    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.issue.get',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.issue.get',
      toolId: 'projectman.issue.get',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm issue get: ${augmentInvokeErrorMessage('projectman.issue.get', message)}`)
    process.exitCode = 1
  }
}

export async function runPmIssueCreate(options: PmIssueCreateOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const title = normalizeNonEmpty(options.title)
    if (!title) throw new Error('Missing required --title.')

    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext, {
      title,
    })
    const description = normalizeNonEmpty(options.description)
    const status = normalizeNonEmpty(options.status)
    const severity = normalizeNonEmpty(options.severity)
    const source = normalizeNonEmpty(options.source)
    const notes = normalizeNonEmpty(options.notes)
    const tags = normalizeArrayValues(options.tag)
    if (description) input.description = description
    if (status) input.status = status
    if (severity) input.severity = severity
    if (source) input.source = source
    if (notes) input.notes = notes
    if (tags) input.tags = tags
    assignIssueLikeLinks(input, {
      task: options.task,
      sprint: options.sprint,
      utask: options.utask,
      reviewRequest: options.reviewRequest,
    })

    if (options.preview === true) {
      emitCommandResult(options, {
        command: 'pm.issue.create',
        toolId: 'projectman.issue.create',
        resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
        input,
        payload: {
          ok: true,
          response: {
            data: {
              preview: true,
              action: 'create',
              message: 'Validated issue create input. Re-run with --apply to create the issue.',
              input,
            },
          },
        },
      })
      return
    }

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.issue.create',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.issue.create',
      toolId: 'projectman.issue.create',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm issue create: ${augmentInvokeErrorMessage('projectman.issue.create', message)}`)
    process.exitCode = 1
  }
}

export async function runPmIssueUpdate(options: PmIssueUpdateOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const title = normalizeNonEmpty(options.title)
    const description = normalizeNonEmpty(options.description)
    const status = normalizeNonEmpty(options.status)
    const severity = normalizeNonEmpty(options.severity)
    const source = normalizeNonEmpty(options.source)
    const notes = normalizeNonEmpty(options.notes)
    const tags = normalizeArrayValues(options.tag)
    const task = normalizeNonEmpty(options.task)
    const sprint = normalizeNonEmpty(options.sprint)
    const utask = normalizeNonEmpty(options.utask)
    const reviewRequest = normalizeNonEmpty(options.reviewRequest)

    if (!title && !description && !status && !severity && !source && !notes && !tags && !task && !sprint && !utask && !reviewRequest) {
      throw new Error('Provide at least one patch field: --title, --description, --status, --severity, --source, --task, --sprint, --utask, --review-request, --notes, or --tag.')
    }

    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = { id }
    if (title) input.title = title
    if (description) input.description = description
    if (status) input.status = status
    if (severity) input.severity = severity
    if (source) input.source = source
    if (notes) input.notes = notes
    if (tags) input.tags = tags
    assignIssueLikeLinks(input, { task, sprint, utask, reviewRequest })

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.issue.update',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.issue.update',
      toolId: 'projectman.issue.update',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm issue update: ${augmentInvokeErrorMessage('projectman.issue.update', message)}`)
    process.exitCode = 1
  }
}

export async function runPmIssueDelete(options: PmIssueRefOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('delete', options)
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const input = { id }
    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.issue.delete',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.issue.delete',
      toolId: 'projectman.issue.delete',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm issue delete: ${augmentInvokeErrorMessage('projectman.issue.delete', message)}`)
    process.exitCode = 1
  }
}

export async function runPmFeedbackList(options: PmFeedbackListOptions = {}): Promise<void> {
  try {
    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext)
    assignIssueLikeLinks(input, {
      task: options.task,
      sprint: options.sprint,
      utask: options.utask,
    })

    const status = normalizeNonEmpty(options.status)
    const type = normalizeNonEmpty(options.type)
    const severity = normalizeNonEmpty(options.severity)
    const source = normalizeNonEmpty(options.source)
    const tags = normalizeArrayValues(options.tag)
    if (status) input.status = status
    if (type) input.type = type
    if (severity) input.severity = severity
    if (source) input.source = source
    if (tags) input.tags = tags

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.feedback.list',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.feedback.list',
      toolId: 'projectman.feedback.list',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm feedback list: ${augmentInvokeErrorMessage('projectman.feedback.list', message)}`)
    process.exitCode = 1
  }
}

export async function runPmFeedbackGet(options: PmFeedbackRefOptions = {}): Promise<void> {
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const input = { id }
    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.feedback.get',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.feedback.get',
      toolId: 'projectman.feedback.get',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm feedback get: ${augmentInvokeErrorMessage('projectman.feedback.get', message)}`)
    process.exitCode = 1
  }
}

export async function runPmFeedbackCreate(options: PmFeedbackCreateOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const title = normalizeNonEmpty(options.title)
    if (!title) throw new Error('Missing required --title.')

    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext, {
      title,
    })
    const description = normalizeNonEmpty(options.description)
    const status = normalizeNonEmpty(options.status)
    const type = normalizeNonEmpty(options.type)
    const severity = normalizeNonEmpty(options.severity)
    const source = normalizeNonEmpty(options.source)
    const suggestion = normalizeNonEmpty(options.suggestion)
    const notes = normalizeNonEmpty(options.notes)
    const tags = normalizeArrayValues(options.tag)
    if (description) input.description = description
    if (status) input.status = status
    if (type) input.type = type
    if (severity) input.severity = severity
    if (source) input.source = source
    if (suggestion) input.suggestion = suggestion
    if (notes) input.notes = notes
    if (tags) input.tags = tags
    assignIssueLikeLinks(input, {
      task: options.task,
      sprint: options.sprint,
      utask: options.utask,
    })

    if (options.preview === true) {
      emitCommandResult(options, {
        command: 'pm.feedback.create',
        toolId: 'projectman.feedback.create',
        resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
        input,
        payload: {
          ok: true,
          response: {
            data: {
              preview: true,
              action: 'create',
              message: 'Validated feedback create input. Re-run with --apply to create the feedback.',
              input,
            },
          },
        },
      })
      return
    }

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.feedback.create',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.feedback.create',
      toolId: 'projectman.feedback.create',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm feedback create: ${augmentInvokeErrorMessage('projectman.feedback.create', message)}`)
    process.exitCode = 1
  }
}

export async function runPmFeedbackUpdate(options: PmFeedbackUpdateOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const title = normalizeNonEmpty(options.title)
    const description = normalizeNonEmpty(options.description)
    const status = normalizeNonEmpty(options.status)
    const type = normalizeNonEmpty(options.type)
    const severity = normalizeNonEmpty(options.severity)
    const source = normalizeNonEmpty(options.source)
    const suggestion = normalizeNonEmpty(options.suggestion)
    const notes = normalizeNonEmpty(options.notes)
    const tags = normalizeArrayValues(options.tag)
    const task = normalizeNonEmpty(options.task)
    const sprint = normalizeNonEmpty(options.sprint)
    const utask = normalizeNonEmpty(options.utask)

    if (!title && !description && !status && !type && !severity && !source && !suggestion && !notes && !tags && !task && !sprint && !utask) {
      throw new Error('Provide at least one patch field: --title, --description, --status, --type, --severity, --source, --task, --sprint, --utask, --suggestion, --notes, or --tag.')
    }

    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = { id }
    if (title) input.title = title
    if (description) input.description = description
    if (status) input.status = status
    if (type) input.type = type
    if (severity) input.severity = severity
    if (source) input.source = source
    if (suggestion) input.suggestion = suggestion
    if (notes) input.notes = notes
    if (tags) input.tags = tags
    assignIssueLikeLinks(input, { task, sprint, utask })

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.feedback.update',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.feedback.update',
      toolId: 'projectman.feedback.update',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm feedback update: ${augmentInvokeErrorMessage('projectman.feedback.update', message)}`)
    process.exitCode = 1
  }
}

export async function runPmFeedbackDelete(options: PmFeedbackRefOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('delete', options)
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const input = { id }
    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.feedback.delete',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.feedback.delete',
      toolId: 'projectman.feedback.delete',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm feedback delete: ${augmentInvokeErrorMessage('projectman.feedback.delete', message)}`)
    process.exitCode = 1
  }
}

export async function runPmReviewRequestList(options: PmReviewRequestListOptions = {}): Promise<void> {
  try {
    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext)
    assignIssueLikeLinks(input, {
      task: options.task,
      sprint: options.sprint,
      utask: options.utask,
    })

    const status = normalizeNonEmpty(options.status)
    const priority = normalizeNonEmpty(options.priority)
    const source = normalizeNonEmpty(options.source)
    const targetAgent = normalizeNonEmpty(options.targetAgent)
    const targetSlot = normalizeNonEmpty(options.targetSlot)
    const parent = normalizeNonEmpty(options.parent)
    const root = normalizeNonEmpty(options.root)
    const tags = normalizeArrayValues(options.tag)
    if (status) input.status = status
    if (priority) input.priority = priority
    if (source) input.source = source
    if (targetAgent) input.targetAgent = targetAgent
    if (targetSlot) input.targetSlot = targetSlot
    if (parent) input.parentReviewRequest = parent
    if (root) input.rootReviewRequest = root
    if (tags) input.tags = tags

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.review-request.list',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.review-request.list',
      toolId: 'projectman.review-request.list',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm review-request list: ${augmentInvokeErrorMessage('projectman.review-request.list', message)}`)
    process.exitCode = 1
  }
}

// Resolve a review-request reference to its full id. A full uuid passes through
// untouched; anything else (the 8-char short id printed by `list`/`create`, or
// any uuid prefix) is matched against the scoped review-request list by id
// prefix. `review-request.get` resolves against a Postgres uuid column, so a
// non-uuid value would otherwise throw a uuid-cast error that surfaces as an
// opaque API 500 — resolving here keeps `get` consistent with the rest of the
// CLI (short ids accepted everywhere) and yields a clean not-found / ambiguous
// error instead.
async function resolveReviewRequestId(
  execution: PmExecutionContext,
  options: AgentGatewayContextOptions,
  ref: string,
): Promise<string> {
  const prefix = ref.trim().toLowerCase()
  const payload = await invokeProjectmanReadTool(execution, options, {
    toolId: 'projectman.review-request.list',
    input: buildOwnerScopedInput(execution.resolvedContext),
  })
  const records = toRecordArray(unwrapHostedToolResult(payload))
  const matches = records.filter((record) => {
    const id = typeof record.id === 'string' ? record.id.toLowerCase() : ''
    return id === prefix || id.startsWith(prefix)
  })
  if (matches.length === 1) {
    const id = extractEntityId(matches[0], ['id'])
    if (!id) throw new Error(`Review request "${ref}" matched a record without an id.`)
    return id
  }
  if (matches.length === 0) {
    throw new Error(`Review request "${ref}" was not found: no review-request id starts with this prefix in the current project. Run \`aops-cli pm review-request list\` to see available ids.`)
  }
  const candidates = matches
    .slice(0, 8)
    .map((record) => {
      const id = extractEntityId(record, ['id']) ?? 'missing-id'
      const title = typeof record.title === 'string' && record.title ? record.title : 'untitled'
      return `${id} (${title})`
    })
    .join(', ')
  throw new Error(`Review request "${ref}" is ambiguous: ${matches.length} ids start with this prefix. Use the full id. Candidates: ${candidates}.`)
}

export async function runPmReviewRequestGet(options: PmReviewRequestRefOptions = {}): Promise<void> {
  try {
    const ref = normalizeNonEmpty(options.id)
    if (!ref) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    // Accept the short id (uuid prefix) printed by list/create, not just the
    // full uuid: resolve it before calling review-request.get, which resolves
    // against a uuid column directly (a non-uuid would surface as an API 500).
    const id = isUuidLike(ref)
      ? ref
      : await resolveReviewRequestId(execution, options, ref)

    const input = { id }
    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.review-request.get',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.review-request.get',
      toolId: 'projectman.review-request.get',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm review-request get: ${augmentInvokeErrorMessage('projectman.review-request.get', message)}`)
    process.exitCode = 1
  }
}

export async function runPmReviewRequestCreate(options: PmReviewRequestCreateOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const title = normalizeNonEmpty(options.title)
    if (!title) throw new Error('Missing required --title.')

    const notifyRoom = normalizeNonEmpty(options.notifyRoom)
    const pingFrom = normalizeNonEmpty(options.pingFrom)
    if (notifyRoom && !pingFrom) {
      throw new Error('--notify-room requires --ping-from <agent-id> (the agent the wake message is posted as).')
    }

    const execution = await prepareExecution(options)
    if (!execution) return

    const input: Record<string, unknown> = buildOwnerScopedInput(execution.resolvedContext, { title })
    assignIssueLikeLinks(input, {
      task: options.task,
      sprint: options.sprint,
      utask: options.utask,
    })

    const description = normalizeNonEmpty(options.description)
    const reviewScope = normalizeNonEmpty(options.reviewScope)
    const instructions = normalizeNonEmpty(options.instructions)
    const status = normalizeNonEmpty(options.status)
    const priority = normalizeNonEmpty(options.priority)
    const source = normalizeNonEmpty(options.source)
    const parent = normalizeNonEmpty(options.parent)
    const root = normalizeNonEmpty(options.root)
    const requestedBy = normalizeNonEmpty(options.requestedBy)
    const targetAgent = normalizeNonEmpty(options.targetAgent)
    const targetSlot = normalizeNonEmpty(options.targetSlot)
    const references = normalizeArrayValues(options.reference)
    const tags = normalizeArrayValues(options.tag)

    if (description) input.description = description
    if (reviewScope) input.reviewScope = reviewScope
    if (instructions) input.instructions = instructions
    if (references) input.references = references
    if (status) input.status = status
    if (priority) input.priority = priority
    if (source) input.source = source
    if (parent) input.parentReviewRequest = parent
    if (root) input.rootReviewRequest = root
    if (requestedBy) input.requestedBy = requestedBy
    if (targetAgent) input.targetAgent = targetAgent
    if (targetSlot) input.targetSlot = targetSlot
    if (tags) input.tags = tags
    if (options.idempotencyKey) input.idempotencyKey = normalizeNonEmpty(options.idempotencyKey)

    if (options.preview === true) {
      emitCommandResult(options, {
        command: 'pm.review-request.create',
        toolId: 'projectman.review-request.create',
        resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
        input,
        payload: {
          ok: true,
          response: {
            data: {
              preview: true,
              action: parent ? 'create-re-review-request' : 'create',
              message: 'Validated review-request create input. Re-run with --apply to create the review request.',
              input,
            },
          },
        },
      })
      return
    }

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.review-request.create',
      input,
    })

    let reviewPing: Record<string, unknown> | undefined
    if (notifyRoom) {
      // Best-effort wake: the RR already exists, so a failed ping must NOT fail the command.
      const created = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload)) ?? {}
      const rrId = normalizeNonEmpty(created.id) ?? normalizeNonEmpty(created.localId)
      const rrTitle = normalizeNonEmpty(created.title) ?? title
      const rrScope = normalizeNonEmpty(created.reviewScope) ?? normalizeNonEmpty(options.reviewScope) ?? '—'
      const scopeId = resolveOwnerScopeIdFromBinding(execution.resolvedContext)
      const wakeText =
        `REVIEW READY — RR ${rrId ?? '(unknown)'}: ${rrTitle}. Scope: ${rrScope}. ` +
        `Read: aops-cli pm review-request get --id ${rrId ?? '<rr-id>'} --json`
      try {
        const apiState = await requireApiState(options)
        if (!apiState) {
          reviewPing = { roomId: notifyRoom, status: 'failed', error: 'No API state (authenticate / configure host first).' }
        } else if (!scopeId) {
          reviewPing = { roomId: notifyRoom, status: 'failed', error: 'No scopeId resolved for the chat message; bind project context or pass --project-id.' }
        } else {
          const pingPayload = await invokeHostedToolWithApiState(apiState, {
            ...execution.gatewayOptions,
            toolId: 'agentspace.chat-message.send',
            input: {
              data: compactPayload({
                scopeId,
                roomId: notifyRoom,
                authorAgentId: pingFrom,
                text: wakeText,
              }),
            },
            apply: true,
          })
          const sent = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(pingPayload)) ?? {}
          const messageSeq = typeof sent.seq === 'number' ? sent.seq : undefined
          reviewPing = compactPayload({ roomId: notifyRoom, status: 'sent', messageSeq })
        }
      } catch (error) {
        const pingMessage = error instanceof Error ? error.message : String(error)
        reviewPing = { roomId: notifyRoom, status: 'failed', error: pingMessage }
      }
      if (reviewPing.status === 'failed') {
        logWarn(`Review ping to room ${notifyRoom} failed (RR was still created): ${String(reviewPing.error)}`)
      }
    }

    emitCommandResult(options, {
      command: 'pm.review-request.create',
      toolId: 'projectman.review-request.create',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
      sideEffects: reviewPing ? { reviewPing } : undefined,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm review-request create: ${augmentInvokeErrorMessage('projectman.review-request.create', message)}`)
    process.exitCode = 1
  }
}

export async function runPmReviewRequestUpdate(options: PmReviewRequestUpdateOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const input: Record<string, unknown> = { id }
    const title = normalizeNonEmpty(options.title)
    const description = normalizeNonEmpty(options.description)
    const reviewScope = normalizeNonEmpty(options.reviewScope)
    const instructions = normalizeNonEmpty(options.instructions)
    const priority = normalizeNonEmpty(options.priority)
    const source = normalizeNonEmpty(options.source)
    const task = normalizeNonEmpty(options.task)
    const sprint = normalizeNonEmpty(options.sprint)
    const utask = normalizeNonEmpty(options.utask)
    const requestedBy = normalizeNonEmpty(options.requestedBy)
    const targetAgent = normalizeNonEmpty(options.targetAgent)
    const targetSlot = normalizeNonEmpty(options.targetSlot)
    const references = normalizeArrayValues(options.reference)
    const tags = normalizeArrayValues(options.tag)

    if (!title && !description && !reviewScope && !instructions && !priority && !source && !task && !sprint && !utask && !requestedBy && !targetAgent && !targetSlot && !references && !tags) {
      throw new Error('Provide at least one patch field for review-request update.')
    }

    if (title) input.title = title
    if (description) input.description = description
    if (reviewScope) input.reviewScope = reviewScope
    if (instructions) input.instructions = instructions
    if (references) input.references = references
    if (priority) input.priority = priority
    if (source) input.source = source
    if (requestedBy) input.requestedBy = requestedBy
    if (targetAgent) input.targetAgent = targetAgent
    if (targetSlot) input.targetSlot = targetSlot
    if (tags) input.tags = tags
    assignIssueLikeLinks(input, { task, sprint, utask })

    const execution = await prepareExecution(options)
    if (!execution) return

    if (options.preview === true) {
      emitCommandResult(options, {
        command: 'pm.review-request.update',
        toolId: 'projectman.review-request.update',
        resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
        input,
        payload: {
          ok: true,
          response: {
            data: {
              preview: true,
              action: 'update',
              message: 'Validated review-request update input. Re-run with --apply to patch the review request.',
              input,
            },
          },
        },
      })
      return
    }

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.review-request.update',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.review-request.update',
      toolId: 'projectman.review-request.update',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm review-request update: ${augmentInvokeErrorMessage('projectman.review-request.update', message)}`)
    process.exitCode = 1
  }
}

export type PmResumeBriefOptions = PmContextOptions &
  AgentGatewayContextOptions & {
    for?: string
    limit?: number | string
    withChat?: boolean
    json?: boolean
  }

function listDataFromPayload(payload: Record<string, unknown>): Record<string, unknown>[] {
  const direct = (payload as { data?: unknown }).data
  if (Array.isArray(direct)) return direct as Record<string, unknown>[]
  const response = (payload as { response?: { data?: unknown } }).response
  return Array.isArray(response?.data) ? (response.data as Record<string, unknown>[]) : []
}

function briefLine(value: unknown, maxLength = 140): string {
  const text = typeof value === 'string' ? value.trim() : ''
  const line = text.split('\n')[0]?.trim() ?? ''
  return line.length <= maxLength ? line : `${line.slice(0, maxLength - 3)}...`
}

function briefShortId(value: unknown): string {
  return String(value ?? '').slice(0, 8)
}

export async function runPmResumeBrief(options: PmResumeBriefOptions = {}): Promise<void> {
  try {
    const agentId = normalizeNonEmpty(options.for)
    if (!agentId) throw new Error('Provide --for <agent-id>.')
    const rawLimit = typeof options.limit === 'string' ? Number(options.limit) : options.limit
    const limit = typeof rawLimit === 'number' && Number.isFinite(rawLimit) && rawLimit > 0 ? Math.trunc(rawLimit) : 5

    const execution = await prepareExecution(options, { requireProject: true })
    if (!execution) return
    const { resolvedContext } = execution

    const ownerInput = () => buildOwnerScopedInput(resolvedContext)
    const [boardsPayload, tasksPayload, sprintsPayload, rrPayload, issuesPayload, feedbackPayload] = await Promise.all([
      invokeProjectmanTool(execution, options, { toolId: 'projectman.kanban-board.list', input: ownerInput() }),
      invokeProjectmanTool(execution, options, { toolId: 'projectman.kanban-task.list', input: ownerInput() }),
      invokeProjectmanTool(execution, options, { toolId: 'projectman.sprint.list', input: ownerInput() }),
      invokeProjectmanTool(execution, options, { toolId: 'projectman.review-request.list', input: { ...ownerInput(), targetAgent: agentId } }),
      invokeProjectmanTool(execution, options, { toolId: 'projectman.issue.list', input: { ...ownerInput(), status: 'open' } }),
      invokeProjectmanTool(execution, options, { toolId: 'projectman.feedback.list', input: { ...ownerInput(), status: 'new' } }),
    ])

    const boards = listDataFromPayload(boardsPayload)
    const tasks = listDataFromPayload(tasksPayload)
    const sprints = listDataFromPayload(sprintsPayload)
    const reviewRequests = listDataFromPayload(rrPayload)
    const issues = listDataFromPayload(issuesPayload)
    const feedback = listDataFromPayload(feedbackPayload)

    const tasksById = new Map(tasks.map((task) => [String(task.localId ?? task.id ?? ''), task]))
    const windows = sprints
      .filter((sprint) => !['completed', 'archived'].includes(String(sprint.status ?? '')))
      .map((sprint) => {
        const task = tasksById.get(String(sprint.kanbanTaskId ?? ''))
        const progress = isRecord(sprint.progress) ? sprint.progress : undefined
        return compactPayload({
          sprintId: sprint.localId ?? sprint.id,
          sprintName: sprint.name,
          sprintStatus: sprint.status,
          taskId: sprint.kanbanTaskId,
          taskTitle: task?.title,
          progress: progress ? `${progress.completed ?? 0}/${progress.total ?? 0} microtasks` : undefined,
        })
      })

    const reviewQueue = reviewRequests
      .filter((rr) => !['completed', 'approved', 'accepted', 'closed', 'rejected', 'withdrawn'].includes(String(rr.status ?? '')))
      .map((rr) => compactPayload({
        id: rr.localId ?? rr.id,
        shortId: briefShortId(rr.localId ?? rr.id),
        status: rr.status,
        title: rr.title,
        reviewScope: rr.reviewScope,
        requestedBy: rr.requestedBy,
        requestedAt: rr.requestedAt,
      }))

    const memoryPaths = resolveMemoryWorkspacePaths(resolvedContext)
    const memoryEntries = await readLocalMemoryEntries(memoryPaths.localItemsDir).catch(() => [])
    const durableMemories = memoryEntries
      .filter((entry) => entry.durability === 'durable')
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
      .slice(0, limit)
      .map((entry) => compactPayload({
        createdAt: entry.createdAt,
        kind: entry.kind,
        summary: briefLine(entry.content),
        nextAction: normalizeNonEmpty(entry.nextAction),
      }))

    let chat: Record<string, unknown> | undefined
    if (options.withChat === true) {
      try {
        const apiState = await requireApiState(options)
        if (apiState) {
          const payload = await invokeHostedToolWithApiState(apiState, {
            ...execution.gatewayOptions,
            toolId: 'agentspace.chat.catchup',
            input: { data: { agentId } },
          })
          const result = unwrapHostedToolResult(payload)
          const data = unwrapResultData<Record<string, unknown>>(result)
          const rooms = Array.isArray(data?.rooms) ? (data.rooms as Record<string, unknown>[]) : []
          chat = compactPayload({
            unreadCount: data?.unreadCount ?? 0,
            rooms: rooms
              .filter((entry) => Number((entry as { unreadCount?: number }).unreadCount ?? 0) > 0)
              .map((entry) => {
                const room = isRecord(entry.room) ? entry.room : {}
                return compactPayload({
                  roomId: room.id,
                  slug: room.slug,
                  title: room.title,
                  unreadCount: entry.unreadCount,
                })
              }),
            hint: `aops-cli chat catchup --for ${agentId} --peek --summary --json`,
          })
        }
      } catch (error) {
        chat = { status: 'unavailable', message: briefLine(error instanceof Error ? error.message : String(error), 200) }
      }
    }

    const markdownLines: string[] = [
      `# AOPS Resume Brief — ${resolvedContext.projectName ?? resolvedContext.projectId ?? 'project'} (for ${agentId})`,
      '',
      `Generated: ${new Date().toISOString()}`,
      '',
      `## Active windows (${windows.length})`,
      ...(windows.length > 0
        ? windows.slice(0, limit).map((window) => `- ${window.sprintName ?? window.sprintId} [${window.sprintStatus ?? 'active'}]${window.taskTitle ? ` — task: ${window.taskTitle}` : ''}${window.progress ? ` (${window.progress})` : ''}`)
        : ['- (none)']),
      '',
      `## Review queue for ${agentId} (${reviewQueue.length})`,
      ...(reviewQueue.length > 0
        ? reviewQueue.slice(0, limit).map((rr) => `- ${rr.shortId} [${rr.status}] ${briefLine(rr.title)}${rr.reviewScope ? ` — scope: ${rr.reviewScope}` : ''}`)
        : ['- (none)']),
      '',
      `## Open issues (${issues.length})`,
      ...issues.slice(0, limit).map((issue) => `- ${briefShortId(issue.localId ?? issue.id)} [${issue.severity ?? 'n/a'}] ${briefLine(issue.title)}`),
      ...(issues.length === 0 ? ['- (none)'] : []),
      '',
      `## New feedback (${feedback.length})`,
      ...feedback.slice(0, limit).map((entry) => `- ${briefShortId(entry.localId ?? entry.id)} [${entry.severity ?? 'n/a'}] ${briefLine(entry.title)}`),
      ...(feedback.length === 0 ? ['- (none)'] : []),
      '',
      `## Recent durable memory (${durableMemories.length})`,
      ...(durableMemories.length > 0
        ? durableMemories.map((entry) => `- [${String(entry.createdAt ?? '').slice(0, 10)}] ${entry.summary}${entry.nextAction ? ` — next: ${briefLine(entry.nextAction, 100)}` : ''}`)
        : ['- (none)']),
      ...(chat
        ? ['', `## Hosted chat unread${chat.status === 'unavailable' ? ' (unavailable)' : ` (${chat.unreadCount ?? 0})`}`,
          ...(Array.isArray(chat.rooms) && chat.rooms.length > 0
            ? (chat.rooms as Record<string, unknown>[]).map((room) => `- ${room.slug ?? room.roomId}: ${room.unreadCount} unread`)
            : [chat.status === 'unavailable' ? `- ${chat.message}` : '- (none)'])]
        : []),
      '',
      '## Resume prompt',
      '```text',
      `You are ${agentId}, resuming work on project ${resolvedContext.projectName ?? resolvedContext.projectId ?? ''} (repo ${resolvedContext.repoRoot}).`,
      `1. Review queue first: aops-cli pm review-request list --target-agent ${agentId} --json`,
      `2. Memory: aops-cli mem resume --subject project --json`,
      `3. Chat: aops-cli chat catchup --for ${agentId} --peek --summary --json`,
      '```',
    ]
    const markdown = markdownLines.join('\n')

    const brief = compactPayload({
      generatedAt: new Date().toISOString(),
      agentId,
      project: compactPayload({
        projectId: resolvedContext.projectId,
        projectName: resolvedContext.projectName,
        repoRoot: resolvedContext.repoRoot,
      }),
      boards: boards.length,
      windows,
      reviewQueue,
      openIssueCount: issues.length,
      openIssues: issues.slice(0, limit).map((issue) => compactPayload({
        id: issue.localId ?? issue.id, severity: issue.severity, title: issue.title,
      })),
      newFeedbackCount: feedback.length,
      newFeedback: feedback.slice(0, limit).map((entry) => compactPayload({
        id: entry.localId ?? entry.id, severity: entry.severity, title: entry.title,
      })),
      durableMemories,
      chat,
      markdown,
    })

    if (options.json) {
      emitCommandResult(options, {
        command: 'pm.resume-brief',
        toolId: 'projectman.resume-brief',
        resolvedContext: buildResolvedContextEnvelope(resolvedContext),
        input: compactPayload({ for: agentId, limit, withChat: options.withChat || undefined }),
        payload: { ok: true, data: brief },
      })
      return
    }
    console.log(markdown)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm resume: ${message}`)
    process.exitCode = 1
  }
}

export async function runPmReviewRequestResult(options: PmReviewRequestResultOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const id = normalizeNonEmpty(options.id)
    const reviewer = normalizeNonEmpty(options.reviewer)
    const outcome = normalizeNonEmpty(options.outcome)
    const summary = normalizeNonEmpty(options.summary)
    if (!id) throw new Error('Missing required --id.')
    if (!reviewer) throw new Error('Missing required --reviewer.')
    if (!outcome) throw new Error('Missing required --outcome.')
    if (!summary) throw new Error('Missing required --summary.')

    // Guarded write by id: fail fast on unresolvable owner scope (e.g. config-less CWD)
    // instead of reporting a misleading record-not-found from a wrong-scope lookup.
    const execution = await prepareExecution(options, { requireProject: true })
    if (!execution) return

    const input = compactPayload({
      id,
      reviewer,
      outcome,
      summary,
      positives: normalizeArrayValues(options.positive),
      concerns: normalizeArrayValues(options.concern),
      objections: normalizeArrayValues(options.objection),
      references: normalizeArrayValues(options.reference),
      issueIds: normalizeArrayValues(options.issue),
      basedOnSeqRange: parseJsonObjectOption(options.basedOnSeqRange, '--based-on-seq-range'),
      idempotencyKey: normalizeNonEmpty(options.idempotencyKey),
    })

    if (options.preview === true) {
      emitCommandResult(options, {
        command: 'pm.review-request.result',
        toolId: 'projectman.review-request.add-result',
        resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
        input,
        payload: {
          ok: true,
          response: {
            data: {
              preview: true,
              action: 'append-review-result',
              message: 'Validated review result input. Re-run with --apply to append the review result.',
              input,
            },
          },
        },
      })
      return
    }

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.review-request.add-result',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.review-request.result',
      toolId: 'projectman.review-request.add-result',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm review-request result: ${augmentInvokeErrorMessage('projectman.review-request.add-result', message)}`)
    process.exitCode = 1
  }
}

export async function runPmReviewRequestDelete(options: PmReviewRequestRefOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('delete', options)
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Missing required --id.')

    const execution = await prepareExecution(options, { requireProject: false })
    if (!execution) return

    const input = { id }
    if (options.preview === true) {
      emitCommandResult(options, {
        command: 'pm.review-request.delete',
        toolId: 'projectman.review-request.delete',
        resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
        input,
        payload: {
          ok: true,
          response: {
            data: {
              preview: true,
              action: 'delete',
              message: 'Validated review-request delete input. Re-run with --apply --confirm to delete the review request.',
              input,
            },
          },
        },
      })
      return
    }

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'projectman.review-request.delete',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.review-request.delete',
      toolId: 'projectman.review-request.delete',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm review-request delete: ${augmentInvokeErrorMessage('projectman.review-request.delete', message)}`)
    process.exitCode = 1
  }
}

export async function runPmHandoffResume(options: PmHandoffResumeOptions = {}): Promise<void> {
  try {
    const subject = normalizePmHandoffSubject(options.subject)
    const execution = await prepareExecution(options)
    if (!execution) return

    const subjectId = resolvePmHandoffSubjectId(subject, {
      id: options.id,
      projectId: execution.resolvedContext.projectId,
    })
    const subjectLabel = normalizeNonEmpty(options.label)
    const links = buildPmHandoffEntityLinks(subject, subjectId, options)
    const query = normalizeNonEmpty(options.query) ?? subject.defaultQuery
    const goal = normalizeNonEmpty(options.goal)
    const depth = options.depth === 'deep' ? 'deep' : 'light'
    const limit = parseOptionalInteger(options.limit, '--limit')
    const candidateLimit = parseOptionalInteger(options.candidateLimit, '--candidate-limit')

    const filter = buildOwnerScopedInput(execution.resolvedContext, {
      scopeResolution: 'cascade',
    })
    const projectId = normalizeNonEmpty(execution.resolvedContext.projectId)
    if (projectId) {
      filter.projectId = projectId
    }

    const input: Record<string, unknown> = {
      filter,
      retrieval: {
        query,
        ...(goal ? { goal } : {}),
        subject: {
          type: subject.subjectType,
          id: subjectId,
          ...(subjectLabel ? { label: subjectLabel } : {}),
        },
        sourceTypes: subject.defaultSourceTypes,
        sourceIds: buildPmHandoffSourceIds(subjectId, links),
        tags: uniqueStringValues(toArray(options.tag)),
        ...(candidateLimit !== undefined ? { candidateLimit } : {}),
      },
      options: {
        depth,
        ...(limit !== undefined ? { limit } : {}),
        ...(options.strictSubject === true ? { strictSubject: true } : {}),
      },
    }

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'agentspace.memory-item.build-resume-pack',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.handoff.resume',
      toolId: 'agentspace.memory-item.build-resume-pack',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        subject: {
          key: subject.key,
          type: subject.subjectType,
          id: subjectId,
          label: subjectLabel ?? null,
        },
        links,
      }),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm handoff resume: ${augmentInvokeErrorMessage('agentspace.memory-item.build-resume-pack', message)}`)
    process.exitCode = 1
  }
}

export async function runPmHandoffWrite(options: PmHandoffWriteOptions = {}): Promise<void> {
  try {
    ensureWriteFlags('create', options)
    const mode = normalizePmHandoffMode(options.mode)
    const subject = normalizePmHandoffSubject(options.subject)
    const content = normalizeNonEmpty(options.content)
    if (!content) throw new Error('Missing required --content.')

    const execution = await prepareExecution(options)
    if (!execution) return

    const subjectId = resolvePmHandoffSubjectId(subject, {
      id: options.id,
      projectId: execution.resolvedContext.projectId,
    })
    const subjectTitle = normalizeNonEmpty(options.label)
    const links = buildPmHandoffEntityLinks(subject, subjectId, options)
    const modeDefaults = PM_HANDOFF_MODE_DEFAULTS[mode]
    const durability =
      options.durability === 'short' || options.durability === 'durable' || options.durability === 'sticky'
        ? options.durability
        : modeDefaults.durability
    const importance = parseOptionalInteger(options.importance, '--importance')
    const stickyScope = durability === 'sticky' ? 'project' : undefined

    const tags = uniqueStringValues([
      ...modeDefaults.tags,
      ...toArray(options.tag),
      execution.resolvedContext.projectId ? `project:${execution.resolvedContext.projectId}` : undefined,
      links.kanbanTaskId ? `kanban-task:${links.kanbanTaskId}` : undefined,
      links.sprintId ? `sprint:${links.sprintId}` : undefined,
      links.phaseId ? `phase:${links.phaseId}` : undefined,
      links.microtaskId ? `microtask:${links.microtaskId}` : undefined,
      normalizeNonEmpty(options.patternName) ? `pattern:${normalizeNonEmpty(options.patternName)}` : undefined,
    ])

    const baseMeta: Record<string, unknown> = {
      subjectType: subject.subjectType,
      subjectId,
      ...(stickyScope ? { stickyScope } : {}),
      ...(subjectTitle ? { subjectTitle } : {}),
      ...(execution.resolvedContext.projectId ? { projectId: execution.resolvedContext.projectId } : {}),
      ...(links.kanbanTaskId ? { kanbanTaskId: links.kanbanTaskId } : {}),
      ...(links.sprintId ? { sprintId: links.sprintId } : {}),
      ...(links.phaseId ? { phaseId: links.phaseId } : {}),
      ...(links.microtaskId ? { microtaskId: links.microtaskId } : {}),
      ...(links.issueId ? { issueId: links.issueId } : {}),
      ...(links.feedbackId ? { feedbackId: links.feedbackId } : {}),
    }

    const nextAction = normalizeNonEmpty(options.nextAction)
    const validationState = normalizeNonEmpty(options.validationState)
    const patternName = normalizeNonEmpty(options.patternName)
    const patternWhen = normalizeNonEmpty(options.patternWhen)
    const patternWhy = normalizeNonEmpty(options.patternWhy)
    const patternEvidence = normalizeNonEmpty(options.patternEvidence)
    const nextReadRefs = normalizeArrayValues(options.nextReadRef)?.map((entry) => normalizeRefLike(entry))
    const sourceRefs = normalizeArrayValues(options.sourceRef)?.map((entry) => normalizeRefLike(entry))
    if (nextAction) baseMeta.nextAction = nextAction
    if (validationState) baseMeta.validationState = validationState
    if (nextReadRefs && nextReadRefs.length > 0) baseMeta.nextReadRefs = nextReadRefs
    if (sourceRefs && sourceRefs.length > 0) baseMeta.sourceRefs = sourceRefs
    if (patternName) baseMeta.patternName = patternName
    if (patternWhen) baseMeta.patternWhen = patternWhen
    if (patternWhy) baseMeta.patternWhy = patternWhy
    if (patternEvidence) baseMeta.patternEvidence = patternEvidence
    const boardLineage = await resolvePmBoardLineage(execution, options, { links })
    const boardScopedShape = mergePmBoardLineageIntoMemoryShape({
      tags,
      meta: baseMeta,
      lineage: boardLineage,
    })

    const input: Record<string, unknown> = {
      data: {
        scopeId: resolveOwnerScopeIdFromBinding(execution.resolvedContext),
        kind: modeDefaults.kind,
        durability,
        content,
        tags: boardScopedShape.tags,
        sourceType: subject.subjectType,
        sourceId: subjectId,
        meta: boardScopedShape.meta,
        ...(importance !== undefined ? { importance } : {}),
      },
    }

    const payload = await invokeProjectmanTool(execution, options, {
      toolId: 'agentspace.memory-item.add-memory-item',
      input,
    })

    emitCommandResult(options, {
      command: 'pm.handoff.write',
      toolId: 'agentspace.memory-item.add-memory-item',
      resolvedContext: buildResolvedContextEnvelope(execution.resolvedContext, {
        mode,
        subject: {
          key: subject.key,
          type: subject.subjectType,
          id: subjectId,
          label: subjectTitle ?? null,
        },
        links,
      }),
      input,
      payload,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to execute pm handoff write: ${augmentInvokeErrorMessage('agentspace.memory-item.add-memory-item', message)}`)
    process.exitCode = 1
  }
}
