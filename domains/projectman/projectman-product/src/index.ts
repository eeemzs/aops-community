import { runProjectmanKitOperationByTypedId } from '@aopslab/domain-kit-projectman'

export type ProjectmanFlowAction =
  | 'create-board'
  | 'apply-template'
  | 'create-template'
  | 'update-template'
  | 'delete-template'
  | 'create-column'
  | 'create-task'
  | 'update-task'
  | 'move-task'
  | 'reposition-task'
  | 'create-sprint'
  | 'create-sprint-microtask'
  | 'update-sprint-plan'
  | 'update-sprint-microtask-status'
  | 'create-issue'
  | 'update-issue'
  | 'create-feedback'
  | 'update-feedback'
  | 'convert-feedback-to-issue'
  | 'convert-feedback-to-task'

export type ProjectmanBoardFlowColumnInput = {
  name?: unknown
  slug?: unknown
  position?: unknown
}

export type ProjectmanScopeInput = {
  scopeId?: unknown
  projectId?: unknown
  project?: unknown
}

export type CreateProjectmanBoardFlowInput = ProjectmanScopeInput & {
  projectId?: unknown
  project?: unknown
  name?: unknown
  slug?: unknown
  description?: unknown
  columns?: unknown
  createdBy?: unknown
  updatedBy?: unknown
  sourceCreatedAt?: unknown
  sourceUpdatedAt?: unknown
}

export type ApplyProjectmanTemplateFlowInput = ProjectmanScopeInput & {
  projectId?: unknown
  project?: unknown
  templateId?: unknown
  kanbanTemplate?: unknown
  id?: unknown
}

export type CreateProjectmanTemplateFlowInput = ProjectmanScopeInput & {
  name?: unknown
  description?: unknown
  definition?: unknown
}

export type UpdateProjectmanTemplateFlowInput = ProjectmanScopeInput & {
  templateId?: unknown
  kanbanTemplate?: unknown
  id?: unknown
  name?: unknown
  description?: unknown
  definition?: unknown
}

export type DeleteProjectmanTemplateFlowInput = ProjectmanScopeInput & {
  templateId?: unknown
  kanbanTemplate?: unknown
  id?: unknown
}

export type CreateProjectmanBoardColumnFlowInput = ProjectmanScopeInput & {
  boardId?: unknown
  board?: unknown
  name?: unknown
  slug?: unknown
}

export type CreateProjectmanTaskFlowInput = ProjectmanScopeInput & {
  projectId?: unknown
  project?: unknown
  boardId?: unknown
  board?: unknown
  boardColumnId?: unknown
  boardColumn?: unknown
  title?: unknown
  description?: unknown
  createdBy?: unknown
  updatedBy?: unknown
}

export type UpdateProjectmanTaskFlowInput = ProjectmanScopeInput & {
  taskId?: unknown
  kanbanTask?: unknown
  title?: unknown
  description?: unknown
  progress?: unknown
  updatedBy?: unknown
}

export type MoveProjectmanTaskFlowInput = ProjectmanScopeInput & {
  taskId?: unknown
  kanbanTask?: unknown
  boardColumnId?: unknown
  boardColumn?: unknown
}

export type RepositionProjectmanTaskFlowInput = ProjectmanScopeInput & {
  taskId?: unknown
  kanbanTask?: unknown
  boardColumnId?: unknown
  boardColumn?: unknown
  orderedIds?: unknown
  sourceBoardColumnId?: unknown
  sourceBoardColumn?: unknown
  sourceOrderedIds?: unknown
}

export type CreateProjectmanSprintFlowInput = ProjectmanScopeInput & {
  projectId?: unknown
  project?: unknown
  kanbanTaskId?: unknown
  kanbanTask?: unknown
  name?: unknown
  goal?: unknown
  references?: unknown
  scope?: unknown
  validationPlan?: unknown
  notes?: unknown
  phases?: unknown
  createdBy?: unknown
  updatedBy?: unknown
}

export type UpdateProjectmanSprintPlanFlowInput = ProjectmanScopeInput & {
  projectId?: unknown
  project?: unknown
  sprintId?: unknown
  sprint?: unknown
  id?: unknown
  name?: unknown
  goal?: unknown
  references?: unknown
  scope?: unknown
  validationPlan?: unknown
  notes?: unknown
  phases?: unknown
  expectedUpdatedAt?: unknown
  updatedBy?: unknown
}

export type CreateProjectmanSprintMicrotaskFlowInput = ProjectmanScopeInput & {
  projectId?: unknown
  project?: unknown
  sprintId?: unknown
  sprint?: unknown
  phaseId?: unknown
  phase?: unknown
  title?: unknown
  status?: unknown
  position?: unknown
  notes?: unknown
  createdBy?: unknown
  updatedBy?: unknown
}

export type UpdateProjectmanSprintMicrotaskStatusFlowInput = ProjectmanScopeInput & {
  projectId?: unknown
  project?: unknown
  sprintId?: unknown
  sprint?: unknown
  microTaskId?: unknown
  microtask?: unknown
  microTask?: unknown
  id?: unknown
  status?: unknown
  updatedBy?: unknown
}

export type CreateProjectmanIssueFlowInput = ProjectmanScopeInput & {
  projectId?: unknown
  project?: unknown
  title?: unknown
  description?: unknown
  status?: unknown
  severity?: unknown
  source?: unknown
  sprintId?: unknown
  sprint?: unknown
  kanbanTaskId?: unknown
  kanbanTask?: unknown
  microTaskId?: unknown
  microTask?: unknown
  tags?: unknown
  notes?: unknown
  resolvedAt?: unknown
}

export type UpdateProjectmanIssueFlowInput = ProjectmanScopeInput & {
  issueId?: unknown
  issue?: unknown
  id?: unknown
  title?: unknown
  description?: unknown
  status?: unknown
  severity?: unknown
  source?: unknown
  sprintId?: unknown
  sprint?: unknown
  kanbanTaskId?: unknown
  kanbanTask?: unknown
  microTaskId?: unknown
  microTask?: unknown
  tags?: unknown
  notes?: unknown
  resolvedAt?: unknown
}

export type CreateProjectmanFeedbackFlowInput = ProjectmanScopeInput & {
  projectId?: unknown
  project?: unknown
  title?: unknown
  description?: unknown
  status?: unknown
  type?: unknown
  severity?: unknown
  source?: unknown
  sprintId?: unknown
  sprint?: unknown
  kanbanTaskId?: unknown
  kanbanTask?: unknown
  microTaskId?: unknown
  microTask?: unknown
  tags?: unknown
  suggestion?: unknown
  notes?: unknown
  handledAt?: unknown
}

export type UpdateProjectmanFeedbackFlowInput = ProjectmanScopeInput & {
  feedbackId?: unknown
  feedback?: unknown
  id?: unknown
  title?: unknown
  description?: unknown
  status?: unknown
  type?: unknown
  severity?: unknown
  source?: unknown
  sprintId?: unknown
  sprint?: unknown
  kanbanTaskId?: unknown
  kanbanTask?: unknown
  microTaskId?: unknown
  microTask?: unknown
  tags?: unknown
  suggestion?: unknown
  notes?: unknown
  handledAt?: unknown
}

export type ConvertProjectmanFeedbackToIssueFlowInput = ProjectmanScopeInput & {
  projectId?: unknown
  project?: unknown
  feedbackId?: unknown
  feedback?: unknown
  title?: unknown
  description?: unknown
  severity?: unknown
}

export type ConvertProjectmanFeedbackToTaskFlowInput = ProjectmanScopeInput & {
  projectId?: unknown
  project?: unknown
  feedbackId?: unknown
  feedback?: unknown
  boardId?: unknown
  board?: unknown
  boardColumnId?: unknown
  boardColumn?: unknown
  title?: unknown
  description?: unknown
}

type NormalizedProjectmanBoardColumnSpec = {
  name: string
  slug: string
  position: number
}

export type ProjectmanAgentHints = {
  reminders: string[]
  nextActions: string[]
  feedbackSuggestions: string[]
}

type ProjectmanDefaultBoardColumnRule = {
  name: string
  slug: string
  aliases: string[]
}

const DEFAULT_PROJECTMAN_BOARD_COLUMN_RULES: readonly ProjectmanDefaultBoardColumnRule[] = Object.freeze([
  { name: 'Backlog', slug: 'backlog', aliases: ['backlog'] },
  { name: 'Todo', slug: 'todo', aliases: ['todo', 'to-do'] },
  { name: 'Doing', slug: 'doing', aliases: ['doing', 'in-progress', 'in_progress', 'active'] },
  { name: 'Done', slug: 'done', aliases: ['done', 'completed', 'complete'] },
])

const PROJECTMAN_DONE_COLUMN_RULE =
  DEFAULT_PROJECTMAN_BOARD_COLUMN_RULES.find((rule) => rule.slug === 'done') ??
  DEFAULT_PROJECTMAN_BOARD_COLUMN_RULES[DEFAULT_PROJECTMAN_BOARD_COLUMN_RULES.length - 1]

const PROJECTMAN_EXECUTION_FEEDBACK_SUGGESTIONS = Object.freeze([
  'Tool retry gerekiyorsa veya ayni isi tekrar cagirarak yapmak zorunda kaldiysan feedback yaz.',
  'Sugar eksigi yuzunden uzun CRUD zinciri kurduysan feedback yaz.',
  'Hata mesaji zayifsa veya state mismatch nedeni net degilse feedback yaz.',
  'Ayni board/sprint/task state' + "'" + 'ini gereksiz tekrar okuduysan token verimliligi icin feedback yaz.',
])

function normalizeNonEmpty(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

function normalizeProjectmanWorkflowToken(value: unknown): string {
  return toColumnSlug(normalizeNonEmpty(value), '')
}

function isDoneLikeProjectmanWorkflowValue(value: unknown): boolean {
  const normalized = normalizeProjectmanWorkflowToken(value)
  if (!normalized) return false
  return [PROJECTMAN_DONE_COLUMN_RULE?.name, PROJECTMAN_DONE_COLUMN_RULE?.slug, ...(PROJECTMAN_DONE_COLUMN_RULE?.aliases ?? [])]
    .map((entry) => normalizeProjectmanWorkflowToken(entry))
    .some((entry) => entry === normalized)
}

function resolveScopeId(input: Record<string, unknown> | undefined): string {
  if (!input) return ''
  return (
    normalizeNonEmpty(input.scopeId) ||
    normalizeNonEmpty(input.projectId) ||
    normalizeNonEmpty(input.project)
  )
}

function withScopeContext<T extends Record<string, unknown>>(
  payload: T,
  scopeId: string,
): T | (T & { scopeId: string }) {
  if (!scopeId) return payload
  const existingScopeId = normalizeNonEmpty((payload as Record<string, unknown>).scopeId)
  return existingScopeId ? payload : { ...payload, scopeId }
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function toItems<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  const record = toRecord(value)
  if (Array.isArray(record.items)) return record.items as T[]
  if (Array.isArray(record.data)) return record.data as T[]
  return []
}

function extractEntityId(value: unknown, keys: string[] = ['id']): string {
  if (typeof value === 'string') return normalizeNonEmpty(value)
  const record = toRecord(value)
  if (record.item && typeof record.item === 'object' && !Array.isArray(record.item)) {
    const nested = extractEntityId(record.item, keys)
    if (nested) return nested
  }
  const directId = normalizeNonEmpty(record.id)
  if (directId) return directId
  for (const key of keys) {
    const candidate = normalizeNonEmpty(record[key])
    if (candidate) return candidate
  }
  return ''
}

function toColumnSlug(name: string, fallback = 'custom'): string {
  const normalized = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return normalized || fallback
}

function toBoardOwnedColumnSlug(boardSlug: string, columnSlug: string): string {
  const normalizedBoardSlug = toColumnSlug(boardSlug, 'board')
  const normalizedColumnSlug = toColumnSlug(columnSlug, 'column')
  return `${normalizedBoardSlug}-${normalizedColumnSlug}`
}

function normalizeUniqueStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    const normalized = normalizeNonEmpty(item)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

function createProjectmanAgentHints(input: Partial<ProjectmanAgentHints> = {}): ProjectmanAgentHints {
  return {
    reminders: normalizeUniqueStringList(input.reminders ?? []),
    nextActions: normalizeUniqueStringList(input.nextActions ?? []),
    feedbackSuggestions: normalizeUniqueStringList([
      ...PROJECTMAN_EXECUTION_FEEDBACK_SUGGESTIONS,
      ...(input.feedbackSuggestions ?? []),
    ]),
  }
}

function withAgentHints<T extends Record<string, unknown>>(
  value: T,
  hints: Partial<ProjectmanAgentHints> = {},
): T & { agentHints: ProjectmanAgentHints } {
  return {
    ...value,
    agentHints: createProjectmanAgentHints(hints),
  }
}

function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.map((item) => normalizeNonEmpty(item)).filter(Boolean)
    return items.length > 0 ? items : undefined
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          const items = parsed.map((item) => normalizeNonEmpty(item)).filter(Boolean)
          return items.length > 0 ? items : undefined
        }
      } catch {
        // Ignore invalid JSON and fall back to comma-separated parsing.
      }
    }
    const items = trimmed.split(',').map((item) => normalizeNonEmpty(item)).filter(Boolean)
    return items.length > 0 ? items : undefined
  }
  return undefined
}

function toJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function toJsonArray(value: unknown): Array<Record<string, unknown>> | undefined {
  const source = (() => {
    if (Array.isArray(value)) return value
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    if (!trimmed) return undefined
    try {
      const parsed = JSON.parse(trimmed)
      return Array.isArray(parsed) ? parsed : undefined
    } catch {
      return undefined
    }
  })()
  if (!Array.isArray(source)) return undefined
  return source
    .map((item) => toJsonObject(item))
    .filter((item): item is Record<string, unknown> => !!item)
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function toNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  const normalized = normalizeNonEmpty(value)
  return normalized || undefined
}

function matchesBoardColumnRule(
  spec: NormalizedProjectmanBoardColumnSpec,
  rule: ProjectmanDefaultBoardColumnRule,
): boolean {
  const candidates = [
    toColumnSlug(spec.name),
    toColumnSlug(spec.slug || spec.name),
  ]
  return candidates.some((candidate) => rule.aliases.includes(candidate))
}

function defaultBoardColumns(): NormalizedProjectmanBoardColumnSpec[] {
  return DEFAULT_PROJECTMAN_BOARD_COLUMN_RULES.map((rule, index) => ({
    name: rule.name,
    slug: rule.slug,
    position: index,
  }))
}

function normalizeBoardColumnsForCreateFlow(columns: unknown): NormalizedProjectmanBoardColumnSpec[] {
  const requested = normalizeColumnSpecs(columns)
  if (requested.length === 0) return defaultBoardColumns()
  return requested.map((spec, index) => ({
    ...spec,
    position: index,
  }))
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

function normalizeColumnSpecs(columns: unknown): NormalizedProjectmanBoardColumnSpec[] {
  const rows = Array.isArray(columns) ? (columns as ProjectmanBoardFlowColumnInput[]) : []
  const seenNames = new Set<string>()
  const slugCounts = new Map<string, number>()
  const normalized: NormalizedProjectmanBoardColumnSpec[] = []

  rows.forEach((column, index) => {
    const record = toRecord(column)
    const name = normalizeNonEmpty(record.name)
    if (!name) return

    const nameKey = name.toLowerCase()
    if (seenNames.has(nameKey)) return
    seenNames.add(nameKey)

    const baseSlug = toColumnSlug(normalizeNonEmpty(record.slug) || name, `custom-${index + 1}`)
    const seenCount = slugCounts.get(baseSlug) ?? 0
    slugCounts.set(baseSlug, seenCount + 1)
    const slug = seenCount === 0 ? baseSlug : `${baseSlug}-${seenCount + 1}`
    const parsedPosition = Number(record.position)

    normalized.push({
      name,
      slug,
      position: Number.isFinite(parsedPosition) ? Math.max(0, Math.floor(parsedPosition)) : normalized.length,
    })
  })

  return normalized
}

async function listBoards(projectId = '', scopeId = ''): Promise<Array<Record<string, unknown>>> {
  try {
    const filter = withScopeContext({
      ...(normalizeNonEmpty(projectId) ? { project: projectId } : {}),
    }, scopeId)
    const result = await runProjectmanKitOperationByTypedId('kanban-board.list', filter)
    return toItems<Record<string, unknown>>(result)
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    if (message.includes('failed to find')) return []
    throw error
  }
}

async function listColumns(scopeId = ''): Promise<Array<Record<string, unknown>>> {
  const result = await runProjectmanKitOperationByTypedId('kanban-column.list', withScopeContext({}, scopeId))
  return toItems<Record<string, unknown>>(result)
}

async function listBoardColumns(boardId: string, scopeId = ''): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await runProjectmanKitOperationByTypedId('kanban-board-column.list', withScopeContext({
      board: boardId,
    }, scopeId))
    return toItems<Record<string, unknown>>(result)
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    if (message.includes('failed to find')) return []
    throw error
  }
}

async function isDoneLikeBoardColumn(boardId: string, boardColumnId: string, scopeId = ''): Promise<boolean> {
  const resolvedBoardId = normalizeNonEmpty(boardId)
  const resolvedBoardColumnId = normalizeNonEmpty(boardColumnId)
  if (!resolvedBoardId || !resolvedBoardColumnId) return false

  const [boardColumns, columns] = await Promise.all([
    listBoardColumns(resolvedBoardId, scopeId),
    listColumns(scopeId),
  ])
  const placement =
    boardColumns.find((item) => extractEntityId(item, ['id', 'boardColumnId']) === resolvedBoardColumnId) ?? null
  if (!placement) return false

  const columnId =
    normalizeNonEmpty(placement.columnId) ||
    normalizeNonEmpty(placement.column) ||
    extractEntityId(placement, ['columnId', 'column'])
  const column = columnId ? findRecordByIdOrName(columns, columnId, '') : null
  const candidates = [
    placement.name,
    placement.slug,
    placement.columnName,
    placement.columnSlug,
    column?.name,
    column?.slug,
  ]
  return candidates.some((candidate) => isDoneLikeProjectmanWorkflowValue(candidate))
}

async function listTasks(projectId: string, boardId: string, scopeId = ''): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await runProjectmanKitOperationByTypedId('kanban-task.list', withScopeContext({
      project: projectId,
      board: boardId,
    }, scopeId))
    return toItems<Record<string, unknown>>(result)
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    if (message.includes('failed to find')) return []
    throw error
  }
}

async function listTemplates(scopeId = ''): Promise<Array<Record<string, unknown>>> {
  const result = await runProjectmanKitOperationByTypedId('kanban-template.list', withScopeContext({}, scopeId))
  return toItems<Record<string, unknown>>(result)
}

async function listSprints(projectId: string, scopeId = ''): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await runProjectmanKitOperationByTypedId('sprint.list', withScopeContext({
      project: projectId,
    }, scopeId))
    return toItems<Record<string, unknown>>(result)
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    if (message.includes('failed to find')) return []
    throw error
  }
}

function flattenSprintCollections(sprints: Array<Record<string, unknown>>) {
  const sprintGroups: Array<Record<string, unknown>> = []
  const microTasks: Array<Record<string, unknown>> = []
  const sprintLinks: Array<Record<string, unknown>> = []

  sprints.forEach((sprint) => {
    const sprintId = normalizeNonEmpty(sprint.id)
    const kanbanTaskId = normalizeNonEmpty(sprint.kanbanTaskId)
    if (sprintId && kanbanTaskId) {
      sprintLinks.push({
        id: `${sprintId}:${kanbanTaskId}`,
        sprintId,
        kanbanTaskId,
        createdAt: sprint.createdAt,
        updatedAt: sprint.updatedAt,
      })
    }

    const phases = toItems<Record<string, unknown>>(sprint.phases)
    phases.forEach((phase, phaseIndex) => {
      const phaseId = normalizeNonEmpty(phase.id)
      if (!phaseId || !sprintId) return
      sprintGroups.push({
        id: phaseId,
        sprintId,
        name: normalizeNonEmpty(phase.name) || `Phase ${phaseIndex + 1}`,
        description: normalizeNonEmpty(phase.description) || undefined,
        position: typeof phase.position === 'number' ? phase.position : phaseIndex,
        createdAt: phase.createdAt,
        updatedAt: phase.updatedAt,
      })

      const phaseMicrotasks = toItems<Record<string, unknown>>(phase.microtasks)
      phaseMicrotasks.forEach((microtask, microtaskIndex) => {
        microTasks.push({
          id: normalizeNonEmpty(microtask.id),
          title: normalizeNonEmpty(microtask.title) || `Microtask ${microtaskIndex + 1}`,
          status: normalizeNonEmpty(microtask.status) || 'todo',
          sprintId,
          sprintGroupId: phaseId,
          kanbanTaskId: normalizeNonEmpty(microtask.kanbanTaskId) || kanbanTaskId || undefined,
          position: typeof microtask.position === 'number' ? microtask.position : microtaskIndex,
          notes: normalizeNonEmpty(microtask.notes) || undefined,
          createdAt: microtask.createdAt,
          updatedAt: microtask.updatedAt,
          createdBy: microtask.createdBy,
          updatedBy: microtask.updatedBy,
        })
      })
    })
  })

  return { sprintGroups, microTasks, sprintLinks }
}

async function buildProjectmanSprintCollectionsSnapshot(projectId: string, scopeId = '') {
  const sprints = await listSprints(projectId, scopeId)
  const { sprintGroups, microTasks, sprintLinks } = flattenSprintCollections(sprints)
  return {
    sprints,
    sprintGroups,
    microTasks,
    sprintLinks,
  }
}

async function buildProjectmanTemplateApplySnapshot(projectId: string, focusBoardId = '', scopeId = '') {
  const boards = await listBoards(projectId, scopeId)
  const columns = await listColumns(scopeId)
  const resolvedBoardId =
    normalizeNonEmpty(focusBoardId) || normalizeNonEmpty(boards[0]?.id)

  if (!resolvedBoardId) {
    return {
      boards,
      columns,
      boardId: '',
      boardColumns: [] as Array<Record<string, unknown>>,
      tasks: [] as Array<Record<string, unknown>>,
    }
  }

  const boardColumns = await listBoardColumns(resolvedBoardId, scopeId)
  const tasks = await listTasks(projectId, resolvedBoardId, scopeId)

  return {
    boards,
    columns,
    boardId: resolvedBoardId,
    boardColumns,
    tasks,
  }
}

function findRecordByIdOrName(
  items: Array<Record<string, unknown>>,
  preferredId: string,
  preferredName = '',
): Record<string, unknown> | null {
  const normalizedId = normalizeNonEmpty(preferredId)
  const normalizedName = normalizeNonEmpty(preferredName).toLowerCase()
  if (normalizedId) {
    const byId = items.find((item) => normalizeNonEmpty(item.id) === normalizedId)
    if (byId) return byId
  }
  if (normalizedName) {
    const byName = items.find((item) => normalizeNonEmpty(item.name).toLowerCase() === normalizedName)
    if (byName) return byName
  }
  return null
}

async function getFeedback(feedbackId: string): Promise<Record<string, unknown>> {
  const result = await runProjectmanKitOperationByTypedId('feedback.get', {
    id: feedbackId,
  } as any)
  const record = toRecord(result)
  const item =
    record.item && typeof record.item === 'object' && !Array.isArray(record.item)
      ? (record.item as Record<string, unknown>)
      : record
  if (normalizeNonEmpty(item.id)) return item
  throw new Error('Feedback could not be resolved.')
}

async function getIssue(issueId: string): Promise<Record<string, unknown>> {
  const result = await runProjectmanKitOperationByTypedId('issue.get', {
    id: issueId,
  } as any)
  const record = toRecord(result)
  const item =
    record.item && typeof record.item === 'object' && !Array.isArray(record.item)
      ? (record.item as Record<string, unknown>)
      : record
  if (normalizeNonEmpty(item.id)) return item
  throw new Error('Issue could not be resolved.')
}

async function loadTask(taskId: string, scopeId = ''): Promise<Record<string, unknown>> {
  const result = await runProjectmanKitOperationByTypedId('kanban-task.get', withScopeContext({
    id: taskId,
  }, scopeId))
  const record = toRecord(result)
  const item =
    record.item && typeof record.item === 'object' && !Array.isArray(record.item)
      ? (record.item as Record<string, unknown>)
      : record
  if (normalizeNonEmpty(item.id)) return item
  throw new Error('Task could not be resolved.')
}

export function normalizeProjectmanFlowAction(value: unknown): ProjectmanFlowAction | '' {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().toLowerCase()
  return trimmed === 'create-board' ||
    trimmed === 'apply-template' ||
    trimmed === 'create-template' ||
    trimmed === 'update-template' ||
    trimmed === 'delete-template' ||
    trimmed === 'create-column' ||
    trimmed === 'create-task' ||
    trimmed === 'update-task' ||
    trimmed === 'move-task' ||
    trimmed === 'reposition-task' ||
    trimmed === 'create-sprint' ||
    trimmed === 'create-sprint-microtask' ||
    trimmed === 'update-sprint-plan' ||
    trimmed === 'update-sprint-microtask-status' ||
    trimmed === 'create-issue' ||
    trimmed === 'update-issue' ||
    trimmed === 'create-feedback' ||
    trimmed === 'update-feedback' ||
    trimmed === 'convert-feedback-to-issue' ||
    trimmed === 'convert-feedback-to-task'
    ? trimmed
    : ''
}

export function inferProjectmanFlowErrorStatus(message: string): number {
  const normalized = message.trim().toLowerCase()
  if (normalized === 'unauthorized') return 401
  if (normalized === 'task could not be resolved.') return 404
  if (normalized === 'issue could not be resolved.') return 404
  if (normalized === 'feedback could not be resolved.') return 404
  if (normalized.includes('conflict')) return 409
  if (normalized.includes('stale snapshot')) return 409
  if (normalized.includes('already exists')) return 409
  return 400
}

export async function createProjectmanBoardFlow(input: CreateProjectmanBoardFlowInput) {
  const projectId = resolveScopeId(input as Record<string, unknown>)
  const scopeId = projectId
  const name = normalizeNonEmpty(input.name)
  const slug = normalizeNonEmpty(input.slug)
  const description = normalizeNonEmpty(input.description)
  const createdBy = normalizeNonEmpty(input.createdBy)
  const updatedBy = normalizeNonEmpty(input.updatedBy) || createdBy
  const columns = normalizeBoardColumnsForCreateFlow(input.columns)

  if (!projectId) throw new Error('Project is required.')
  if (!name) throw new Error('Board name is required.')

  const existingBoards = await listBoards(projectId, scopeId)
  const nextBoardPosition =
    existingBoards.reduce((maxPosition, board) => {
      const parsed = Number((board as any)?.position)
      return Number.isFinite(parsed) ? Math.max(maxPosition, Math.floor(parsed)) : maxPosition
    }, -1) + 1
  const duplicateBoard = existingBoards.find(
    (board) => normalizeNonEmpty(board.name).toLowerCase() === name.toLowerCase(),
  )
  if (duplicateBoard?.id) {
    throw new Error('A board with the same name already exists in this project.')
  }

  const previousBoardIds = new Set(existingBoards.map((board) => normalizeNonEmpty(board.id)).filter(Boolean))
  let createdBoardId = ''
  let createdGroupCount = 0

  try {
    const createdBoard = await runProjectmanKitOperationByTypedId('kanban-board.create', withScopeContext({
      project: projectId,
      name,
      slug: slug || undefined,
      description: description || undefined,
      position: nextBoardPosition,
      createdBy: createdBy || undefined,
      updatedBy: updatedBy || undefined,
      sourceCreatedAt: input.sourceCreatedAt,
      sourceUpdatedAt: input.sourceUpdatedAt,
    }, scopeId))
    createdBoardId = extractEntityId(createdBoard, ['boardId'])

    if (!createdBoardId) {
      const refreshedBoards = await listBoards(projectId, scopeId)
      const matchedBoard =
        refreshedBoards.find(
          (board) =>
            normalizeNonEmpty(board.id) &&
            !previousBoardIds.has(normalizeNonEmpty(board.id)) &&
            normalizeNonEmpty(board.name).toLowerCase() === name.toLowerCase(),
        ) ?? refreshedBoards.find((board) => normalizeNonEmpty(board.id) && !previousBoardIds.has(normalizeNonEmpty(board.id)))
      createdBoardId = normalizeNonEmpty(matchedBoard?.id)
    }

    if (!createdBoardId) {
      throw new Error('Failed to resolve created board id.')
    }

    const resolvedBoardSlug =
      normalizeNonEmpty((createdBoard as any)?.slug) ||
      normalizeNonEmpty(
        existingBoards.find((board) => normalizeNonEmpty(board.id) === createdBoardId)?.slug,
      ) ||
      slug ||
      toColumnSlug(name, 'board')
    const createdColumns: Array<{ id: string; name: string; slug: string; position: number }> = []
    const createdBoardColumns: Array<{ id: string; boardId: string; columnId: string; position: number }> = []

    for (const column of columns) {
      const createdColumn = await runProjectmanKitOperationByTypedId('kanban-column.create', withScopeContext({
        name: column.name,
        slug: toBoardOwnedColumnSlug(resolvedBoardSlug, column.slug),
      }, scopeId))
      const columnId = extractEntityId(createdColumn, ['id', 'columnId'])
      if (!columnId) {
        throw new Error(`Column id missing for ${column.name}.`)
      }

      const boardColumnResult = await runProjectmanKitOperationByTypedId('kanban-board-column.create', withScopeContext({
        board: createdBoardId,
        column: columnId,
        position: column.position,
      }, scopeId))
      const boardColumnId = extractEntityId(boardColumnResult, ['boardColumnId'])
      if (boardColumnId) {
        createdBoardColumns.push({
          id: boardColumnId,
          boardId: createdBoardId,
          columnId,
          position: column.position,
        })
      }

      createdColumns.push({
        id: columnId,
        name: normalizeNonEmpty((createdColumn as any)?.name) || column.name,
        slug: normalizeNonEmpty((createdColumn as any)?.slug) || toBoardOwnedColumnSlug(resolvedBoardSlug, column.slug),
        position: column.position,
      })
    }

    return {
      ...withAgentHints({
        action: 'create-board' as const,
        boardId: createdBoardId,
        board: {
          id: createdBoardId,
          projectId,
          name,
          slug: normalizeNonEmpty((createdBoard as any)?.slug) || slug || undefined,
          description,
        },
        columns: createdColumns,
        boardColumns: createdBoardColumns,
        createdColumnCount: createdColumns.length,
        createdGroupCount,
      }, {
        reminders: columns.length === 4 && columns.every((column, index) => matchesBoardColumnRule(column, DEFAULT_PROJECTMAN_BOARD_COLUMN_RULES[index]!))
          ? ['Kolon verilmedigi icin board Backlog, Todo, Doing, Done cekirdegiyle acildi.']
          : ['Board, istenen kolon listesiyle olusturuldu.'],
        nextActions: [
          'Substantive is icin board acildiktan sonra uygun issue, kanban-task ve sprint ac.',
          'Basit degilse isi board uzerinde mantiksal task parcalarina bol.',
        ],
      }),
    }
  } catch (error) {
    if (createdBoardId) {
      await runProjectmanKitOperationByTypedId(
        'kanban-board.delete',
        withScopeContext({ id: createdBoardId }, scopeId),
      ).catch(() => null)
    }
    throw error
  }
}

export async function applyProjectmanTemplateFlow(input: ApplyProjectmanTemplateFlowInput) {
  const projectId = resolveScopeId(input as Record<string, unknown>)
  const scopeId = projectId
  const templateId =
    normalizeNonEmpty(input.templateId) ||
    normalizeNonEmpty(input.kanbanTemplate) ||
    normalizeNonEmpty(input.id)

  if (!projectId) throw new Error('Project is required.')
  if (!templateId) throw new Error('Template is required.')

  const previousBoards = await listBoards(projectId, scopeId)
  const previousBoardIds = new Set(previousBoards.map((board) => normalizeNonEmpty(board.id)).filter(Boolean))

  await runProjectmanKitOperationByTypedId('kanban-template.apply', withScopeContext({
    id: templateId,
    project: projectId,
  }, scopeId))

  const nextBoards = await listBoards(projectId, scopeId)
  const createdBoards = nextBoards.filter((board) => {
    const boardId = normalizeNonEmpty(board.id)
    return boardId && !previousBoardIds.has(boardId)
  })
  const focusBoardId = normalizeNonEmpty(createdBoards[0]?.id) || normalizeNonEmpty(nextBoards[0]?.id)
  const snapshot = await buildProjectmanTemplateApplySnapshot(projectId, focusBoardId, scopeId)

  return withAgentHints({
    action: 'apply-template' as const,
    projectId,
    templateId,
    createdBoardIds: createdBoards.map((board) => normalizeNonEmpty(board.id)).filter(Boolean),
    focusBoardId: snapshot.boardId,
    boards: snapshot.boards,
    columns: snapshot.columns,
    boardColumns: snapshot.boardColumns,
    tasks: snapshot.tasks,
  }, {
    reminders: [
      'Template apply sonrasi board kolonlari bu usage varyantinin kurallariyla celisiyorsa duzelt.',
    ],
    nextActions: [
      'Template import sonrasi aktif task, sprint ve decomposition ihtiyacini tekrar degerlendir.',
    ],
  })
}

export async function createProjectmanTemplateFlow(input: CreateProjectmanTemplateFlowInput) {
  const scopeId = resolveScopeId(input as Record<string, unknown>)
  const name = normalizeNonEmpty(input.name)
  const description = normalizeNonEmpty(input.description)

  if (!scopeId) throw new Error('Project is required.')
  if (!name) throw new Error('Template name is required.')

  const createdTemplate = await runProjectmanKitOperationByTypedId('kanban-template.create', withScopeContext({
    name,
    description: description || undefined,
    definition: toJsonObject(input.definition) as any,
  }, scopeId))
  const createdTemplateId = extractEntityId(createdTemplate, ['templateId'])
  const templates = await listTemplates(scopeId)
  const template = findRecordByIdOrName(templates, createdTemplateId, name)

  return withAgentHints({
    action: 'create-template' as const,
    templateId: normalizeNonEmpty(template?.id) || createdTemplateId,
    focusTemplateId: normalizeNonEmpty(template?.id) || createdTemplateId,
    template,
    templates,
  })
}

export async function updateProjectmanTemplateFlow(input: UpdateProjectmanTemplateFlowInput) {
  const scopeId = resolveScopeId(input as Record<string, unknown>)
  const templateId =
    normalizeNonEmpty(input.templateId) ||
    normalizeNonEmpty(input.kanbanTemplate) ||
    normalizeNonEmpty(input.id)
  const name = normalizeNonEmpty(input.name)
  const description = normalizeNonEmpty(input.description)

  if (!scopeId) throw new Error('Project is required.')
  if (!templateId) throw new Error('Template is required.')

  await runProjectmanKitOperationByTypedId('kanban-template.update', withScopeContext({
    id: templateId,
    name: name || undefined,
    description: description || undefined,
    definition: toJsonObject(input.definition) as any,
  }, scopeId))
  const templates = await listTemplates(scopeId)
  const template = findRecordByIdOrName(templates, templateId, name)

  return withAgentHints({
    action: 'update-template' as const,
    templateId,
    focusTemplateId: normalizeNonEmpty(template?.id) || templateId,
    template,
    templates,
  })
}

export async function deleteProjectmanTemplateFlow(input: DeleteProjectmanTemplateFlowInput) {
  const scopeId = resolveScopeId(input as Record<string, unknown>)
  const templateId =
    normalizeNonEmpty(input.templateId) ||
    normalizeNonEmpty(input.kanbanTemplate) ||
    normalizeNonEmpty(input.id)

  if (!scopeId) throw new Error('Project is required.')
  if (!templateId) throw new Error('Template is required.')

  await runProjectmanKitOperationByTypedId('kanban-template.delete', withScopeContext({
    id: templateId,
  }, scopeId))
  const templates = await listTemplates(scopeId)

  return withAgentHints({
    action: 'delete-template' as const,
    templateId,
    focusTemplateId: normalizeNonEmpty(templates[0]?.id),
    templates,
  })
}

export async function createProjectmanBoardColumnFlow(input: CreateProjectmanBoardColumnFlowInput) {
  const boardId = normalizeNonEmpty(input.boardId) || normalizeNonEmpty(input.board)
  const scopeId = resolveScopeId(input as Record<string, unknown>)
  const name = normalizeNonEmpty(input.name)

  if (!boardId) throw new Error('Board is required.')
  if (!name) throw new Error('Column name is required.')

  const boards = await listBoards('', scopeId)
  const boardRecord = boards.find((board) => normalizeNonEmpty(board.id) === boardId) ?? null
  const boardSlug =
    normalizeNonEmpty(boardRecord?.slug) ||
    normalizeNonEmpty(boardRecord?.name) ||
    boardId
  const slug = toBoardOwnedColumnSlug(boardSlug, normalizeNonEmpty(input.slug) || name)

  let createdColumnId = ''

  try {
    const createdColumn = await runProjectmanKitOperationByTypedId('kanban-column.create', withScopeContext({
      name,
      slug,
    }, scopeId))
    createdColumnId = extractEntityId(createdColumn, ['columnId'])
    if (!createdColumnId) {
      throw new Error('Column id missing from response.')
    }

    const boardColumnLink = await runProjectmanKitOperationByTypedId('kanban-board-column.create', withScopeContext({
      board: boardId,
      column: createdColumnId,
    }, scopeId))
    const boardColumnId = extractEntityId(boardColumnLink, ['boardColumnId'])

    return withAgentHints({
      action: 'create-column' as const,
      boardId,
      columnId: createdColumnId,
      boardColumnId,
      column: {
        id: createdColumnId,
        name,
        slug,
      },
      boardColumn: boardColumnId
        ? {
            id: boardColumnId,
            boardId,
            columnId: createdColumnId,
          }
        : null,
    })
  } catch (error) {
    if (createdColumnId) {
      await runProjectmanKitOperationByTypedId(
        'kanban-column.delete',
        withScopeContext({ id: createdColumnId }, scopeId),
      ).catch(() => null)
    }
    throw error
  }
}

export async function createProjectmanTaskFlow(input: CreateProjectmanTaskFlowInput) {
  const projectId = resolveScopeId(input as Record<string, unknown>)
  const boardId = normalizeNonEmpty(input.boardId) || normalizeNonEmpty(input.board)
  const scopeId = projectId
  const boardColumnId = normalizeNonEmpty(input.boardColumnId) || normalizeNonEmpty(input.boardColumn)
  const title = normalizeNonEmpty(input.title)
  const description = normalizeNonEmpty(input.description)
  const createdBy = normalizeNonEmpty(input.createdBy)
  const updatedBy = normalizeNonEmpty(input.updatedBy) || createdBy

  if (!projectId) throw new Error('Project is required.')
  if (!boardId) throw new Error('Board is required.')
  if (!boardColumnId) throw new Error('Board column is required.')
  if (!title) throw new Error('Task title is required.')

  const createdTask = await runProjectmanKitOperationByTypedId('kanban-task.create', withScopeContext({
    project: projectId,
    board: boardId,
    boardColumn: boardColumnId,
    title,
    description: description || undefined,
    createdBy: createdBy || undefined,
    updatedBy: updatedBy || undefined,
  }, scopeId))
  const taskId = extractEntityId(createdTask, ['kanbanTaskId', 'taskId'])
  if (!taskId) throw new Error('Task could not be resolved.')

  const task = await loadTask(taskId, scopeId)
  return withAgentHints({
    action: 'create-task' as const,
    projectId,
    boardId: normalizeNonEmpty(task.boardId) || boardId,
    boardColumnId: normalizeNonEmpty(task.boardColumnId) || normalizeNonEmpty(task.boardColumn) || boardColumnId,
    taskId,
    task,
    focusTaskId: taskId,
  }, {
    reminders: [
      'Task substantive ise issue ve sprint bagini kontrol et.',
    ],
    nextActions: [
      'Task multi-step ise sprint fazlarini ve microtask planini ac.',
      'Uzun surecekse plani baska bir agent devralacakmis gibi detaylandir.',
    ],
  })
}

export async function updateProjectmanTaskFlow(input: UpdateProjectmanTaskFlowInput) {
  const taskId = normalizeNonEmpty(input.taskId) || normalizeNonEmpty(input.kanbanTask)
  const scopeId = resolveScopeId(input as Record<string, unknown>)
  const updatedBy = normalizeNonEmpty(input.updatedBy)
  const patch = {
    title: normalizeNonEmpty(input.title) || undefined,
    description: normalizeNonEmpty(input.description) || undefined,
    progress: Number.isFinite(Number(input.progress)) ? Math.max(0, Math.min(100, Number(input.progress))) : undefined,
    updatedBy: updatedBy || undefined,
  }

  if (!taskId) throw new Error('Task is required.')

  await runProjectmanKitOperationByTypedId('kanban-task.update', withScopeContext({
    id: taskId,
    ...patch,
  }, scopeId))
  const task = await loadTask(taskId, scopeId)

  return withAgentHints({
    action: 'update-task' as const,
    taskId,
    boardId: normalizeNonEmpty(task.boardId) || normalizeNonEmpty(task.board),
    boardColumnId:
      normalizeNonEmpty(task.boardColumnId) || normalizeNonEmpty(task.boardColumn) || normalizeNonEmpty(task.columnId),
    task,
    focusTaskId: taskId,
  }, {
    reminders: [
      'Task progress elle uydurulmamali; linked microtask completion truth olarak kalmali.',
    ],
  })
}

export async function moveProjectmanTaskFlow(input: MoveProjectmanTaskFlowInput) {
  const taskId = normalizeNonEmpty(input.taskId) || normalizeNonEmpty(input.kanbanTask)
  const scopeId = resolveScopeId(input as Record<string, unknown>)
  const boardColumnId = normalizeNonEmpty(input.boardColumnId) || normalizeNonEmpty(input.boardColumn)

  if (!taskId) throw new Error('Task is required.')
  if (!boardColumnId) throw new Error('Board column is required.')

  await runProjectmanKitOperationByTypedId('kanban-task.move', withScopeContext({
    id: taskId,
    boardColumn: boardColumnId,
  }, scopeId))
  let task = await loadTask(taskId, scopeId)
  const movedBoardId = normalizeNonEmpty(task.boardId) || normalizeNonEmpty(task.board)
  const movedBoardColumnId =
    normalizeNonEmpty(task.boardColumnId) || normalizeNonEmpty(task.boardColumn) || normalizeNonEmpty(task.columnId) || boardColumnId

  if (await isDoneLikeBoardColumn(movedBoardId, movedBoardColumnId, scopeId)) {
    const currentProgress = Number(task.progress)
    if (!Number.isFinite(currentProgress) || currentProgress < 100) {
      await runProjectmanKitOperationByTypedId('kanban-task.update', withScopeContext({
        id: taskId,
        progress: 100,
      }, scopeId))
      task = await loadTask(taskId, scopeId)
    }
  }

  return withAgentHints({
    action: 'move-task' as const,
    taskId,
    boardId: normalizeNonEmpty(task.boardId) || normalizeNonEmpty(task.board),
    boardColumnId:
      normalizeNonEmpty(task.boardColumnId) || normalizeNonEmpty(task.boardColumn) || normalizeNonEmpty(task.columnId) || boardColumnId,
    task,
    focusTaskId: taskId,
  }, {
    reminders: [
      'Task hareketinden sonra execution state ile kanban gorunurlugu uyumlu kalmali.',
    ],
  })
}

export async function repositionProjectmanTaskFlow(input: RepositionProjectmanTaskFlowInput) {
  const taskId = normalizeNonEmpty(input.taskId) || normalizeNonEmpty(input.kanbanTask)
  const scopeId = resolveScopeId(input as Record<string, unknown>)
  const boardColumnId = normalizeNonEmpty(input.boardColumnId) || normalizeNonEmpty(input.boardColumn)
  const orderedIds = normalizeUniqueStringList(input.orderedIds)
  const sourceBoardColumnId =
    normalizeNonEmpty(input.sourceBoardColumnId) || normalizeNonEmpty(input.sourceBoardColumn)
  const sourceOrderedIds = normalizeUniqueStringList(input.sourceOrderedIds)

  if (!taskId) throw new Error('Task is required.')
  if (!boardColumnId) throw new Error('Board column is required.')
  if (!orderedIds.length) throw new Error('Ordered ids are required.')

  const currentTask = await loadTask(taskId, scopeId)
  const currentBoardId =
    normalizeNonEmpty(currentTask.boardId) || normalizeNonEmpty(currentTask.board)
  const currentBoardColumnId =
    normalizeNonEmpty(currentTask.boardColumnId) ||
    normalizeNonEmpty(currentTask.boardColumn) ||
    normalizeNonEmpty(currentTask.columnId)
  const sameBucket = currentBoardColumnId === boardColumnId

  if (!sameBucket) {
    await runProjectmanKitOperationByTypedId('kanban-task.move', withScopeContext({
      id: taskId,
      boardColumn: boardColumnId,
    }, scopeId))
  }

  await runProjectmanKitOperationByTypedId('kanban-task.reorder', withScopeContext({
    boardColumn: boardColumnId,
    orderedIds,
  }, scopeId))

  const effectiveSourceBoardColumnId = sourceBoardColumnId || currentBoardColumnId
  if (!sameBucket && effectiveSourceBoardColumnId && sourceOrderedIds.length > 0) {
    await runProjectmanKitOperationByTypedId('kanban-task.reorder', withScopeContext({
      boardColumn: effectiveSourceBoardColumnId,
      orderedIds: sourceOrderedIds,
    }, scopeId))
  }

  const task = await loadTask(taskId, scopeId)

  return withAgentHints({
    action: 'reposition-task' as const,
    taskId,
    boardId: normalizeNonEmpty(task.boardId) || normalizeNonEmpty(task.board) || currentBoardId,
    boardColumnId:
      normalizeNonEmpty(task.boardColumnId) ||
      normalizeNonEmpty(task.boardColumn) ||
      normalizeNonEmpty(task.columnId) ||
      boardColumnId,
    task,
    focusTaskId: taskId,
  })
}

export async function createProjectmanSprintFlow(input: CreateProjectmanSprintFlowInput) {
  const projectId = resolveScopeId(input as Record<string, unknown>)
  const scopeId = projectId
  const kanbanTaskId = normalizeNonEmpty(input.kanbanTaskId) || normalizeNonEmpty(input.kanbanTask)
  const name = normalizeNonEmpty(input.name)
  const goal = normalizeNonEmpty(input.goal)
  const createdBy = normalizeNonEmpty(input.createdBy)
  const updatedBy = normalizeNonEmpty(input.updatedBy) || createdBy

  if (!projectId) throw new Error('Project is required.')
  if (!kanbanTaskId) throw new Error('Kanban task is required.')
  if (!name) throw new Error('Sprint name is required.')

  const previousSprints = await listSprints(projectId, scopeId)
  const previousSprintIds = new Set(previousSprints.map((sprint) => normalizeNonEmpty(sprint.id)).filter(Boolean))

  const createdSprint = await runProjectmanKitOperationByTypedId('sprint.create', withScopeContext({
    project: projectId,
    kanbanTask: kanbanTaskId,
    name,
    goal: goal || undefined,
    references: toStringArray(input.references),
    scope: toStringArray(input.scope),
    validationPlan: toStringArray(input.validationPlan),
    notes: normalizeNonEmpty(input.notes) || undefined,
    phases: toJsonArray(input.phases),
    createdBy: createdBy || undefined,
    updatedBy: updatedBy || undefined,
  }, scopeId))
  const createdSprintId = extractEntityId(createdSprint, ['sprintId'])
  const snapshot = await buildProjectmanSprintCollectionsSnapshot(projectId, scopeId)
  const sprint =
    findRecordByIdOrName(snapshot.sprints, createdSprintId, name) ??
    snapshot.sprints.find((item) => {
      const sprintId = normalizeNonEmpty(item.id)
      return sprintId && !previousSprintIds.has(sprintId)
    }) ??
    null

  return withAgentHints({
    action: 'create-sprint' as const,
    projectId,
    sprintId: normalizeNonEmpty(sprint?.id) || createdSprintId,
    focusSprintId: normalizeNonEmpty(sprint?.id) || createdSprintId,
    sprint,
    sprints: snapshot.sprints,
    sprintGroups: snapshot.sprintGroups,
    microTasks: snapshot.microTasks,
    sprintKanbanLinks: snapshot.sprintLinks,
  }, {
    nextActions: [
      'Sprint planini fazlar, referanslar ve checklist ile detaylandir.',
    ],
  })
}

export async function updateProjectmanSprintPlanFlow(input: UpdateProjectmanSprintPlanFlowInput) {
  const projectId = resolveScopeId(input as Record<string, unknown>)
  const scopeId = projectId
  const sprintId = normalizeNonEmpty(input.sprintId) || normalizeNonEmpty(input.sprint) || normalizeNonEmpty(input.id)
  const name = normalizeNonEmpty(input.name)
  const goal = normalizeNonEmpty(input.goal)
  const expectedUpdatedAt = normalizeNonEmpty(input.expectedUpdatedAt)
  const updatedBy = normalizeNonEmpty(input.updatedBy)

  if (!projectId) throw new Error('Project is required.')
  if (!sprintId) throw new Error('Sprint is required.')

  await runProjectmanKitOperationByTypedId('sprint.update-plan', withScopeContext({
    id: sprintId,
    name: name || undefined,
    goal: goal || undefined,
    references: toStringArray(input.references),
    scope: toStringArray(input.scope),
    validationPlan: toStringArray(input.validationPlan),
    notes: toNullableString(input.notes),
    phases: toJsonArray(input.phases),
    expectedUpdatedAt: expectedUpdatedAt || undefined,
    updatedBy: updatedBy || undefined,
  }, scopeId))
  const snapshot = await buildProjectmanSprintCollectionsSnapshot(projectId, scopeId)
  const sprint = findRecordByIdOrName(snapshot.sprints, sprintId, name)

  return withAgentHints({
    action: 'update-sprint-plan' as const,
    projectId,
    sprintId,
    focusSprintId: normalizeNonEmpty(sprint?.id) || sprintId,
    sprint,
    sprints: snapshot.sprints,
    sprintGroups: snapshot.sprintGroups,
    microTasks: snapshot.microTasks,
    sprintKanbanLinks: snapshot.sprintLinks,
  }, {
    reminders: [
      'Sprint ve faz statuslari child microtask completion durumundan derive edilir.',
    ],
  })
}

export async function createProjectmanSprintMicrotaskFlow(input: CreateProjectmanSprintMicrotaskFlowInput) {
  const projectId = resolveScopeId(input as Record<string, unknown>)
  const scopeId = projectId
  const sprintId = normalizeNonEmpty(input.sprintId) || normalizeNonEmpty(input.sprint)
  const phaseId = normalizeNonEmpty(input.phaseId)
  const phase = normalizeNonEmpty(input.phase)
  const title = normalizeNonEmpty(input.title)
  const status = normalizeNonEmpty(input.status)
  const parsedPosition = Number(input.position)
  const position = Number.isFinite(parsedPosition) ? Math.max(0, Math.floor(parsedPosition)) : undefined
  const notes = toNullableString(input.notes)
  const createdBy = normalizeNonEmpty(input.createdBy)
  const updatedBy = normalizeNonEmpty(input.updatedBy) || createdBy

  if (!projectId) throw new Error('Project is required.')
  if (!sprintId) throw new Error('Sprint is required.')
  if (!title) throw new Error('Micro task title is required.')

  const previousSnapshot = await buildProjectmanSprintCollectionsSnapshot(projectId, scopeId)
  const previousMicroTaskIds = new Set(
    previousSnapshot.microTasks
      .filter((item) => normalizeNonEmpty(item.sprintId) === sprintId)
      .map((item) => normalizeNonEmpty(item.id))
      .filter(Boolean),
  )

  await runProjectmanKitOperationByTypedId(
    'sprint.add-microtask',
    withScopeContext(
      {
        id: sprintId,
        phaseId: phaseId || undefined,
        phase: phase || undefined,
        title,
        status: status || undefined,
        position,
        notes,
        createdBy: createdBy || undefined,
        updatedBy: updatedBy || undefined,
      },
      scopeId,
    ),
  )

  const snapshot = await buildProjectmanSprintCollectionsSnapshot(projectId, scopeId)
  const sprint = findRecordByIdOrName(snapshot.sprints, sprintId)
  const normalizedPhaseRef = (phaseId || phase || '').toLowerCase()
  const microTask =
    snapshot.microTasks.find((item) => {
      const microTaskId = normalizeNonEmpty(item.id)
      return normalizeNonEmpty(item.sprintId) === sprintId && microTaskId && !previousMicroTaskIds.has(microTaskId)
    }) ??
    snapshot.microTasks.find((item) => {
      if (normalizeNonEmpty(item.sprintId) !== sprintId) return false
      if (normalizeNonEmpty(item.title) !== title) return false
      if (!normalizedPhaseRef) return true
      const microTaskPhaseId = normalizeNonEmpty(item.sprintGroupId).toLowerCase()
      const phaseMatch = snapshot.sprintGroups.find((group) => normalizeNonEmpty(group.id) === normalizeNonEmpty(item.sprintGroupId))
      const microTaskPhaseName = normalizeNonEmpty(phaseMatch?.name).toLowerCase()
      return microTaskPhaseId === normalizedPhaseRef || microTaskPhaseName === normalizedPhaseRef
    }) ??
    null

  return withAgentHints(
    {
      action: 'create-sprint-microtask' as const,
      projectId,
      sprintId,
      microTaskId: normalizeNonEmpty(microTask?.id),
      microTask,
      focusSprintId: normalizeNonEmpty(sprint?.id) || sprintId,
      focusMicroTaskId: normalizeNonEmpty(microTask?.id),
      sprint,
      sprints: snapshot.sprints,
      sprintGroups: snapshot.sprintGroups,
      microTasks: snapshot.microTasks,
      sprintKanbanLinks: snapshot.sprintLinks,
    },
    {
      nextActions: ['Checklist itemi ilerledikce microtask status akisi ile guncelle.'],
    },
  )
}

export async function updateProjectmanSprintMicrotaskStatusFlow(
  input: UpdateProjectmanSprintMicrotaskStatusFlowInput,
) {
  const projectId = resolveScopeId(input as Record<string, unknown>)
  const scopeId = projectId
  const sprintId = normalizeNonEmpty(input.sprintId) || normalizeNonEmpty(input.sprint)
  const microTaskId =
    normalizeNonEmpty(input.microTaskId) ||
    normalizeNonEmpty(input.microtask) ||
    normalizeNonEmpty(input.microTask) ||
    normalizeNonEmpty(input.id)
  const status = normalizeNonEmpty(input.status)

  if (!projectId) throw new Error('Project is required.')
  if (!sprintId) throw new Error('Sprint is required.')
  if (!microTaskId) throw new Error('Micro task is required.')
  if (!status) throw new Error('Status is required.')

  await runProjectmanKitOperationByTypedId(
    'sprint.update-microtask-status',
    withScopeContext(
      {
        id: sprintId,
        microTask: microTaskId,
        status,
      },
      scopeId,
    ),
  )

  const snapshot = await buildProjectmanSprintCollectionsSnapshot(projectId, scopeId)
  const sprint = findRecordByIdOrName(snapshot.sprints, sprintId)
  const microTask = findRecordByIdOrName(snapshot.microTasks, microTaskId)

  return withAgentHints(
    {
      action: 'update-sprint-microtask-status' as const,
      projectId,
      sprintId,
      microTaskId,
      microTask,
      focusSprintId: normalizeNonEmpty(sprint?.id) || sprintId,
      sprint,
      sprints: snapshot.sprints,
      sprintGroups: snapshot.sprintGroups,
      microTasks: snapshot.microTasks,
      sprintKanbanLinks: snapshot.sprintLinks,
    },
    {
      reminders: ['Sprint progress cancelled microtasklari paydaya katmadan derive edilir.'],
    },
  )
}

export async function createProjectmanIssueFlow(input: CreateProjectmanIssueFlowInput) {
  const projectId = resolveScopeId(input as Record<string, unknown>)
  const title = normalizeNonEmpty(input.title)
  const description = normalizeNonEmpty(input.description)
  const status = normalizeNonEmpty(input.status)
  const severity = normalizeNonEmpty(input.severity)
  const source = normalizeNonEmpty(input.source)
  const sprintId = normalizeNonEmpty(input.sprintId) || normalizeNonEmpty(input.sprint)
  const kanbanTaskId = normalizeNonEmpty(input.kanbanTaskId) || normalizeNonEmpty(input.kanbanTask)
  const microTaskId = normalizeNonEmpty(input.microTaskId) || normalizeNonEmpty(input.microTask)
  const tags = toStringArray(input.tags)
  const notes = normalizeNonEmpty(input.notes)
  if (!projectId) throw new Error('Project is required.')
  if (!title) throw new Error('Issue title is required.')

  const createdIssue = await runProjectmanKitOperationByTypedId('issue.create', {
    project: projectId,
    title,
    description: description || undefined,
    status: status || undefined,
    severity: severity || undefined,
    source: source || undefined,
    sprint: sprintId || undefined,
    kanbanTask: kanbanTaskId || undefined,
    microTask: microTaskId || undefined,
    tags,
    notes: notes || undefined,
  } as any)
  const issueId = extractEntityId(createdIssue, ['issueId'])
  if (!issueId) throw new Error('Issue could not be resolved.')

  const issue = await getIssue(issueId)
  return withAgentHints({
    action: 'create-issue' as const,
    projectId: normalizeNonEmpty(issue.projectId) || normalizeNonEmpty(issue.project) || projectId,
    issueId,
    focusIssueId: issueId,
    issue,
  }, {
    reminders: [
      'Issue execution tracker yerine gecmez; gerekiyorsa task/sprint/microtask zincirini ayri tut.',
    ],
  })
}

export async function updateProjectmanIssueFlow(input: UpdateProjectmanIssueFlowInput) {
  const record = toRecord(input)
  const issueId = normalizeNonEmpty(record.issueId) || normalizeNonEmpty(record.issue) || normalizeNonEmpty(record.id)

  if (!issueId) throw new Error('Issue is required.')

  const status = normalizeNonEmpty(record.status)
  let currentIssue: Record<string, unknown> | null = null
  if (status && !hasOwn(record, 'resolvedAt') && (status === 'resolved' || status === 'closed')) {
    currentIssue = await getIssue(issueId)
  }

  const explicitResolvedAt = hasOwn(record, 'resolvedAt') ? toNullableString(record.resolvedAt) : undefined
  const resolvedAt =
    explicitResolvedAt !== undefined
      ? explicitResolvedAt
      : status
        ? status === 'resolved' || status === 'closed'
          ? normalizeNonEmpty(currentIssue?.resolvedAt) || todayDateString()
          : undefined
        : undefined

  await runProjectmanKitOperationByTypedId('issue.update', {
    id: issueId,
    title: normalizeNonEmpty(record.title) || undefined,
    description: normalizeNonEmpty(record.description) || undefined,
    status: status || undefined,
    severity: normalizeNonEmpty(record.severity) || undefined,
    source: normalizeNonEmpty(record.source) || undefined,
    sprint: normalizeNonEmpty(record.sprintId ?? record.sprint) || undefined,
    kanbanTask: normalizeNonEmpty(record.kanbanTaskId ?? record.kanbanTask) || undefined,
    notes: normalizeNonEmpty(record.notes) || undefined,
    resolvedAt,
  } as any)

  const issue = await getIssue(issueId)
  return withAgentHints({
    action: 'update-issue' as const,
    projectId: normalizeNonEmpty(issue.projectId) || normalizeNonEmpty(issue.project),
    issueId,
    focusIssueId: issueId,
    issue,
  }, {
    reminders: [
      'Issue cozulduysa ilgili task, sprint ve closeout writebacklerini de kontrol et.',
    ],
  })
}

export async function createProjectmanFeedbackFlow(input: CreateProjectmanFeedbackFlowInput) {
  const projectId = resolveScopeId(input as Record<string, unknown>)
  const title = normalizeNonEmpty(input.title)
  const description = normalizeNonEmpty(input.description)
  const status = normalizeNonEmpty(input.status)
  const type = normalizeNonEmpty(input.type)
  const severity = normalizeNonEmpty(input.severity)
  const source = normalizeNonEmpty(input.source)
  const sprintId = normalizeNonEmpty(input.sprintId) || normalizeNonEmpty(input.sprint)
  const kanbanTaskId = normalizeNonEmpty(input.kanbanTaskId) || normalizeNonEmpty(input.kanbanTask)
  const microTaskId = normalizeNonEmpty(input.microTaskId) || normalizeNonEmpty(input.microTask)
  const tags = toStringArray(input.tags)
  const suggestion = normalizeNonEmpty(input.suggestion)
  const notes = normalizeNonEmpty(input.notes)
  if (!projectId) throw new Error('Project is required.')
  if (!title) throw new Error('Feedback title is required.')

  const createdFeedback = await runProjectmanKitOperationByTypedId('feedback.create', {
    project: projectId,
    title,
    description: description || undefined,
    status: status || undefined,
    type: type || undefined,
    severity: severity || undefined,
    source: source || undefined,
    sprint: sprintId || undefined,
    kanbanTask: kanbanTaskId || undefined,
    microTask: microTaskId || undefined,
    tags,
    suggestion: suggestion || undefined,
    notes: notes || undefined,
  } as any)
  const feedbackId = extractEntityId(createdFeedback, ['feedbackId'])
  if (!feedbackId) throw new Error('Feedback could not be resolved.')

  const feedback = await getFeedback(feedbackId)
  return withAgentHints({
    action: 'create-feedback' as const,
    projectId: normalizeNonEmpty(feedback.projectId) || normalizeNonEmpty(feedback.project) || projectId,
    feedbackId,
    focusFeedbackId: feedbackId,
    feedback,
  }, {
    reminders: [
      'Feedback, tooling friction ve token verimsizligi gibi tekrar eden kayiplari kaydetmek icin de kullanilmalidir.',
    ],
  })
}

export async function updateProjectmanFeedbackFlow(input: UpdateProjectmanFeedbackFlowInput) {
  const record = toRecord(input)
  const feedbackId =
    normalizeNonEmpty(record.feedbackId) || normalizeNonEmpty(record.feedback) || normalizeNonEmpty(record.id)

  if (!feedbackId) throw new Error('Feedback is required.')

  const status = normalizeNonEmpty(record.status)

  await runProjectmanKitOperationByTypedId('feedback.update', {
    id: feedbackId,
    title: normalizeNonEmpty(record.title) || undefined,
    description: normalizeNonEmpty(record.description) || undefined,
    status: status || undefined,
    type: normalizeNonEmpty(record.type) || undefined,
    severity: normalizeNonEmpty(record.severity) || undefined,
    source: normalizeNonEmpty(record.source) || undefined,
    sprint: normalizeNonEmpty(record.sprintId ?? record.sprint) || undefined,
    kanbanTask: normalizeNonEmpty(record.kanbanTaskId ?? record.kanbanTask) || undefined,
    suggestion: normalizeNonEmpty(record.suggestion) || undefined,
    notes: normalizeNonEmpty(record.notes) || undefined,
  } as any)

  const feedback = await getFeedback(feedbackId)
  return withAgentHints({
    action: 'update-feedback' as const,
    projectId: normalizeNonEmpty(feedback.projectId) || normalizeNonEmpty(feedback.project),
    feedbackId,
    focusFeedbackId: feedbackId,
    feedback,
  })
}

export async function convertProjectmanFeedbackToIssueFlow(input: ConvertProjectmanFeedbackToIssueFlowInput) {
  const projectId = resolveScopeId(input as Record<string, unknown>)
  const feedbackId = normalizeNonEmpty(input.feedbackId) || normalizeNonEmpty(input.feedback)

  if (!projectId) throw new Error('Project is required.')
  if (!feedbackId) throw new Error('Feedback is required.')

  const feedback = await getFeedback(feedbackId)
  const title = normalizeNonEmpty(input.title) || normalizeNonEmpty(feedback.title)
  const description =
    normalizeNonEmpty(input.description) ||
    normalizeNonEmpty(feedback.suggestion) ||
    normalizeNonEmpty(feedback.description)
  const severity = normalizeNonEmpty(input.severity) || normalizeNonEmpty(feedback.severity) || 'medium'

  if (!title) throw new Error('Issue title is required.')

  const result = await runProjectmanKitOperationByTypedId('issue.create', {
    project: projectId,
    title,
    description: description || undefined,
    severity,
    source: 'human',
    kanbanTask: normalizeNonEmpty(feedback.kanbanTaskId) || undefined,
    sprint: normalizeNonEmpty(feedback.sprintId) || undefined,
    microTask: normalizeNonEmpty(feedback.microTaskId) || undefined,
    tags: Array.isArray(feedback.tags) ? feedback.tags : [],
  } as any)
  const issueId = extractEntityId(result, ['issueId'])
  const issue = issueId ? await getIssue(issueId) : null

  return withAgentHints({
    action: 'convert-feedback-to-issue' as const,
    projectId,
    feedbackId,
    issueId,
    focusIssueId: issueId,
    issue,
    title,
  })
}

export async function convertProjectmanFeedbackToTaskFlow(input: ConvertProjectmanFeedbackToTaskFlowInput) {
  const projectId = resolveScopeId(input as Record<string, unknown>)
  const scopeId = projectId
  const feedbackId = normalizeNonEmpty(input.feedbackId) || normalizeNonEmpty(input.feedback)
  const boardId = normalizeNonEmpty(input.boardId) || normalizeNonEmpty(input.board)
  const boardColumnId = normalizeNonEmpty(input.boardColumnId) || normalizeNonEmpty(input.boardColumn)

  if (!projectId) throw new Error('Project is required.')
  if (!feedbackId) throw new Error('Feedback is required.')
  if (!boardId) throw new Error('Board is required.')
  if (!boardColumnId) throw new Error('Board column is required.')

  const feedback = await getFeedback(feedbackId)
  const title = normalizeNonEmpty(input.title) || normalizeNonEmpty(feedback.title)
  const description =
    normalizeNonEmpty(input.description) ||
    normalizeNonEmpty(feedback.suggestion) ||
    normalizeNonEmpty(feedback.description)

  if (!title) throw new Error('Task title is required.')

  const result = await runProjectmanKitOperationByTypedId('kanban-task.create', withScopeContext({
    project: projectId,
    board: boardId,
    boardColumn: boardColumnId,
    title,
    description: description || undefined,
    sprintId: normalizeNonEmpty(feedback.sprintId) || undefined,
  }, scopeId))

  return withAgentHints({
    action: 'convert-feedback-to-task' as const,
    projectId,
    feedbackId,
    boardId,
    boardColumnId,
    taskId: extractEntityId(result, ['kanbanTaskId', 'taskId']),
    title,
  }, {
    nextActions: [
      'Yeni task substantive ise sprint linki ve gerekiyorsa decomposition tamamla.',
    ],
  })
}
