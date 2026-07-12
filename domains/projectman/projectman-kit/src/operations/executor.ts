import fs from 'node:fs'
import path from 'node:path'

import { Effect } from 'effect'
import { config as loadDotEnv } from 'dotenv'
import { createProjectmanKitWithEnv } from '../domain-services/unified.js'
import { getProjectmanKitEnvConfig } from '../config/config.js'
import type { ProjectmanKitServices } from '../domain-services/types.js'
import type { ProjectmanOperationContract } from './contract.js'
import { getProjectmanOperationContractById, getProjectmanOperationContractByToolId } from './contract.js'
import type { ProjectmanOperationInput, ProjectmanOperationOutput, ProjectmanTypedOperationId } from './io-types.js'

type ToolInput = Record<string, unknown>

let envLoaded = false
let cachedServices: Promise<ProjectmanKitServices> | null = null

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toRecord(input: unknown): ToolInput {
  if (!input || typeof input !== 'object') return {}
  return input as ToolInput
}

function resolveOwnerScopeIdFromHostContext(input: ToolInput): string | undefined {
  const hostContext = toRecord(input.__hostContext)
  return (
    normalizeNonEmpty(hostContext.scopeId) ??
    normalizeNonEmpty(hostContext.projectId)
  )
}

function parseNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    if (trimmed.toLowerCase() === 'null') return null
    return trimmed
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function parseOptionalNumber(value: unknown): number | undefined {
  return parseNumber(value)
}

function parseNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value === 'string' && value.trim().toLowerCase() === 'null') return null
  return parseNumber(value)
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    return trimmed === 'true' || trimmed === '1' || trimmed === 'yes'
  }
  return false
}

function parseDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = new Date(trimmed)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }
  return undefined
}

function parseNullableDate(value: unknown): Date | null | undefined {
  if (value === null) return null
  if (typeof value === 'string' && value.trim().toLowerCase() === 'null') return null
  return parseDate(value)
}

function assignSourceTimestamps(target: Record<string, unknown>, payload: ToolInput): void {
  assignDefined(target, 'createdAt', parseDate(payload.sourceCreatedAt))
  assignDefined(target, 'updatedAt', parseDate(payload.sourceUpdatedAt))
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function parseStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean)
    return items.length > 0 ? items : undefined
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          const items = parsed.map((item) => String(item).trim()).filter(Boolean)
          return items.length > 0 ? items : undefined
        }
      } catch {
        // ignore
      }
    }
    const items = trimmed.split(',').map((item) => item.trim()).filter(Boolean)
    return items.length > 0 ? items : undefined
  }
  return undefined
}

function parseJsonArray(value: unknown): Record<string, unknown>[] | undefined {
  const parsed = parseJsonValue(value)
  if (!Array.isArray(parsed)) return undefined
  return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  const parsed = parseJsonValue(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  return parsed as Record<string, unknown>
}

function loadEnvOnce(): void {
  if (envLoaded) return
  envLoaded = true

  const candidates = [
    process.env.DOTENV_CONFIG_PATH,
    process.env.PROJECTMAN_ENV_PATH,
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '../..', '.env'),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (!candidate) continue
    if (!fs.existsSync(candidate)) continue
    loadDotEnv({ path: candidate, quiet: true })
    break
  }
}

async function getServices(): Promise<ProjectmanKitServices> {
  if (cachedServices) return cachedServices
  cachedServices = (async () => {
    loadEnvOnce()
    const envConfig = getProjectmanKitEnvConfig()
    const { kit } = createProjectmanKitWithEnv({
      envConfig,
      baseContext: { tenantId: envConfig.tenantId },
    })
    const services = await kit.createAll()
    return services
  })()
  return cachedServices
}

type ProjectmanEntityRecord = Record<string, unknown> & {
  id?: string
  scopeId?: string
  projectId?: string
  boardId?: string
  boardColumnId?: string
  sprintId?: string | null
  sprintGroupId?: string | null
  kanbanTaskId?: string | null
  microTaskItemId?: string | null
  title?: string
  name?: string
  description?: string | null
  goal?: string | null
  tags?: string[]
  status?: string
  progress?: number
  position?: number
  notes?: string | null
  meta?: unknown
  openedAt?: Date | string | null
  closedAt?: Date | string | null
  startAt?: Date | string | null
  endAt?: Date | string | null
}

function toEntityRecord(value: unknown): ProjectmanEntityRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as ProjectmanEntityRecord
}

function requireString(value: unknown, label: string): string {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) throw new Error(`missing_required_${label}`)
  return normalized
}

function resolveOwnerScopeId(input: ToolInput): string | undefined {
  return (
    resolveProjectId(input) ??
    resolveOwnerScopeIdFromHostContext(input) ??
    normalizeNonEmpty(process.env.PROJECTMAN_SCOPE_ID) ??
    normalizeNonEmpty(process.env.PROJECTMAN_PROJECT_ID) ??
    undefined
  )
}

function resolveProjectId(input: ToolInput): string | undefined {
  return normalizeNonEmpty(input.scopeId ?? input.scope ?? input.projectId ?? input.project)
}

function resolveBoardId(input: ToolInput): string | undefined {
  return normalizeNonEmpty(input.board ?? input.boardId)
}

function assignDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) return
  target[key] = value
}

async function runEffect<A, E>(effect: Effect.Effect<A, E, never>): Promise<A> {
  return Effect.runPromise(effect)
}

type MethodParams<TMethod> = TMethod extends (...args: infer TArgs) => unknown ? TArgs : never

function asArg0<TMethod>(method: TMethod, value: unknown): MethodParams<TMethod>[0] {
  void method
  return value as MethodParams<TMethod>[0]
}

function asArg1<TMethod>(method: TMethod, value: unknown): MethodParams<TMethod>[1] {
  void method
  return value as MethodParams<TMethod>[1]
}

function asArg2<TMethod>(method: TMethod, value: unknown): MethodParams<TMethod>[2] {
  void method
  return value as MethodParams<TMethod>[2]
}

function resolveOperationByToolId(toolId: string): ProjectmanOperationContract {
  const operation = getProjectmanOperationContractByToolId(toolId)
  if (operation) return operation
  throw new Error(`unknown_projectman_tool:${toolId}`)
}

function resolveOperationById(operationId: string): ProjectmanOperationContract {
  const operation = getProjectmanOperationContractById(operationId)
  if (operation) return operation
  throw new Error(`unknown_projectman_operation:${operationId}`)
}

async function runToolExecution(toolId: string, input: unknown): Promise<unknown> {
  const payload = toRecord(input)
  const services = await getServices()
  const ownerScopeId = resolveOwnerScopeId(payload)

  switch (toolId) {
    case 'projectman-kanban-board-list': {
      const filter: Record<string, unknown> = {}
      assignDefined(filter, 'scopeId', ownerScopeId)
      assignDefined(filter, 'name', normalizeNonEmpty(payload.name))
      assignDefined(filter, 'slug', normalizeNonEmpty(payload.slug))
      return runEffect(
        services.kanbanBoardService.listBoards(
          asArg0(services.kanbanBoardService.listBoards, filter),
          asArg1(services.kanbanBoardService.listBoards, undefined),
          asArg2(services.kanbanBoardService.listBoards, { includeArchived: parseBoolean(payload.includeArchived) }),
        ),
      )
    }
    case 'projectman-kanban-board-create': {
      const data = {
        scopeId: requireString(ownerScopeId, 'project'),
        name: requireString(payload.name, 'name'),
        slug: normalizeNonEmpty(payload.slug),
        description: normalizeNonEmpty(payload.description),
        position: parseNumber(payload.position),
      }
      assignSourceTimestamps(data, payload)
      return runEffect(services.kanbanBoardService.createBoard(asArg0(services.kanbanBoardService.createBoard, data)))
    }
    case 'projectman-kanban-board-update': {
      const patch: Record<string, unknown> = {}
      assignDefined(patch, 'scopeId', ownerScopeId)
      assignDefined(patch, 'name', normalizeNonEmpty(payload.name))
      assignDefined(patch, 'slug', normalizeNonEmpty(payload.slug))
      assignDefined(patch, 'description', normalizeNonEmpty(payload.description))
      assignDefined(patch, 'position', parseNumber(payload.position))
      assignSourceTimestamps(patch, payload)
      return runEffect(
        services.kanbanBoardService.updateBoard(
          requireString(payload.id, 'id'),
          asArg1(services.kanbanBoardService.updateBoard, patch),
        ),
      )
    }
    case 'projectman-kanban-board-reorder': {
      const orderedIds = parseStringArray(payload.orderedIds)
      if (!orderedIds || orderedIds.length === 0) throw new Error('missing_required_orderedIds')
      return runEffect(services.kanbanBoardService.reorderBoards(orderedIds))
    }
    case 'projectman-kanban-board-delete': {
      const boardId = requireString(payload.id, 'id')
      const boardColumns = (await runEffect(
        services.kanbanBoardColumnService.listBoardColumns(
          asArg0(services.kanbanBoardColumnService.listBoardColumns, { boardId: boardId }),
        ),
      )) as Array<{ id?: string }>
      const tasks = (await runEffect(
        services.kanbanTaskService.listTasks(
          asArg0(services.kanbanTaskService.listTasks, { boardId: boardId }),
        ),
      )) as Array<{ id?: string }>

      const taskIds = tasks
        .map((item) => normalizeNonEmpty(item?.id))
        .filter((id): id is string => Boolean(id))
      if (taskIds.length > 0) {
        for (const id of taskIds) {
          await runEffect(services.kanbanTaskService.removeTask(id))
        }
      }

      const boardColumnIds = boardColumns
        .map((item) => normalizeNonEmpty(item?.id))
        .filter((id): id is string => Boolean(id))
      if (boardColumnIds.length > 0) {
        for (const id of boardColumnIds) {
          await runEffect(services.kanbanBoardColumnService.removeBoardColumn(id))
        }
      }

      await runEffect(services.kanbanBoardService.removeBoard(boardId))
      return {
        boardId,
        deletedTaskCount: taskIds.length,
        deletedBoardColumnCount: boardColumnIds.length,
      }
    }
    case 'projectman-kanban-board-archive': {
      return runEffect(services.kanbanBoardService.archiveBoard(requireString(payload.id, 'id')))
    }
    case 'projectman-kanban-board-unarchive': {
      return runEffect(services.kanbanBoardService.unarchiveBoard(requireString(payload.id, 'id')))
    }
    case 'projectman-kanban-column-list': {
      const filter: Record<string, unknown> = {}
      assignDefined(filter, 'scopeId', ownerScopeId)
      assignDefined(filter, 'name', normalizeNonEmpty(payload.name))
      assignDefined(filter, 'slug', normalizeNonEmpty(payload.slug))
      return runEffect(services.kanbanColumnService.listColumns(asArg0(services.kanbanColumnService.listColumns, filter)))
    }
    case 'projectman-kanban-board-get': {
      return runEffect(services.kanbanBoardService.getById(requireString(payload.id, 'id')))
    }
    case 'projectman-kanban-board-bootstrap': {
      const scopeId = requireString(ownerScopeId, 'project')
      const boardData = {
        scopeId,
        name: requireString(payload.name, 'name'),
        slug: normalizeNonEmpty(payload.slug),
        description: normalizeNonEmpty(payload.description),
        position: parseNumber(payload.position),
      }
      assignSourceTimestamps(boardData, payload)
      const board = (await runEffect(
        services.kanbanBoardService.createBoard(asArg0(services.kanbanBoardService.createBoard, boardData)),
      )) as { id?: string }
      const boardId = requireString(board?.id, 'id')
      const requestedColumns = parseStringArray(payload.columns)
      const columnNames =
        requestedColumns && requestedColumns.length > 0 ? requestedColumns : ['Backlog', 'Todo', 'Doing', 'Done']
      const columns: Array<{ column: unknown; boardColumn: unknown }> = []
      let position = 0
      for (const columnName of columnNames) {
        const column = (await runEffect(
          services.kanbanColumnService.createColumn(
            asArg0(services.kanbanColumnService.createColumn, { scopeId, name: columnName }),
          ),
        )) as { id?: string }
        const columnId = requireString(column?.id, 'id')
        const boardColumn = await runEffect(
          services.kanbanBoardColumnService.addColumnToBoard(
            asArg0(services.kanbanBoardColumnService.addColumnToBoard, { scopeId, boardId, columnId, position }),
          ),
        )
        columns.push({ column, boardColumn })
        position += 1
      }
      return { board, columns }
    }
    case 'projectman-kanban-column-get': {
      return runEffect(services.kanbanColumnService.getById(requireString(payload.id, 'id')))
    }
    case 'projectman-kanban-column-create': {
      const data = {
        scopeId: requireString(ownerScopeId, 'project'),
        name: requireString(payload.name, 'name'),
        slug: normalizeNonEmpty(payload.slug),
        description: normalizeNonEmpty(payload.description),
        wipLimit: parseNullableNumber(payload.wipLimit),
      }
      return runEffect(services.kanbanColumnService.createColumn(asArg0(services.kanbanColumnService.createColumn, data)))
    }
    case 'projectman-kanban-column-update': {
      const patch: Record<string, unknown> = {}
      assignDefined(patch, 'name', normalizeNonEmpty(payload.name))
      assignDefined(patch, 'slug', normalizeNonEmpty(payload.slug))
      assignDefined(patch, 'description', normalizeNonEmpty(payload.description))
      assignDefined(patch, 'wipLimit', parseNullableNumber(payload.wipLimit))
      return runEffect(
        services.kanbanColumnService.updateColumn(
          requireString(payload.id, 'id'),
          asArg1(services.kanbanColumnService.updateColumn, patch),
        ),
      )
    }
    case 'projectman-kanban-column-set-wip-limit': {
      const wipLimit = parseNullableNumber(payload.wipLimit)
      return runEffect(
        services.kanbanColumnService.setColumnWipLimit(
          requireString(payload.id, 'id'),
          asArg1(services.kanbanColumnService.setColumnWipLimit, wipLimit),
        ),
      )
    }
    case 'projectman-kanban-column-delete': {
      return runEffect(services.kanbanColumnService.removeColumn(requireString(payload.id, 'id')))
    }
    case 'projectman-kanban-board-column-list': {
      const filter: Record<string, unknown> = {}
      const boardId = requireString(resolveBoardId(payload), 'board')
      assignDefined(filter, 'boardId', boardId)
      assignDefined(filter, 'columnId', normalizeNonEmpty(payload.column ?? payload.columnId))
      return runEffect(services.kanbanBoardColumnService.listBoardColumns(asArg0(services.kanbanBoardColumnService.listBoardColumns, filter)))
    }
    case 'projectman-kanban-board-column-create': {
      const data = {
        scopeId: requireString(ownerScopeId, 'project'),
        boardId: requireString(resolveBoardId(payload), 'board'),
        columnId: requireString(payload.column ?? payload.columnId, 'column'),
        position: parseNumber(payload.position),
      }
      return runEffect(services.kanbanBoardColumnService.addColumnToBoard(asArg0(services.kanbanBoardColumnService.addColumnToBoard, data)))
    }
    case 'projectman-kanban-board-column-update': {
      const patch: Record<string, unknown> = {}
      assignDefined(patch, 'columnId', normalizeNonEmpty(payload.column ?? payload.columnId))
      assignDefined(patch, 'position', parseNumber(payload.position))
      return runEffect(
        services.kanbanBoardColumnService.updateBoardColumn(
          requireString(payload.id, 'id'),
          asArg1(services.kanbanBoardColumnService.updateBoardColumn, patch),
        ),
      )
    }
    case 'projectman-kanban-board-column-reorder': {
      const boardId = requireString(resolveBoardId(payload), 'board')
      const orderedIds = parseStringArray(payload.orderedIds)
      if (!orderedIds || orderedIds.length === 0) throw new Error('missing_required_orderedIds')
      return runEffect(services.kanbanBoardColumnService.reorderBoardColumns(boardId, orderedIds))
    }
    case 'projectman-kanban-board-column-delete': {
      return runEffect(services.kanbanBoardColumnService.removeBoardColumn(requireString(payload.id, 'id')))
    }
    case 'projectman-kanban-task-list': {
      const filter: Record<string, unknown> = {}
      assignDefined(filter, 'scopeId', ownerScopeId)
      assignDefined(filter, 'boardId', resolveBoardId(payload))
      assignDefined(filter, 'boardColumnId', normalizeNonEmpty(payload.boardColumn ?? payload.boardColumnId))
      assignDefined(filter, 'sprintId', normalizeNonEmpty(payload.sprintId))
      assignDefined(filter, 'taskCode', normalizeNonEmpty(payload.taskCode ?? payload.code))
      assignDefined(filter, 'slug', normalizeNonEmpty(payload.slug))
      return runEffect(services.kanbanTaskService.listTasks(asArg0(services.kanbanTaskService.listTasks, filter)))
    }
    case 'projectman-kanban-task-get': {
      return runEffect(services.kanbanTaskService.getById(requireString(payload.id, 'id')))
    }
    case 'projectman-kanban-task-create': {
      const data = {
        scopeId: requireString(ownerScopeId, 'project'),
        boardId: requireString(resolveBoardId(payload), 'board'),
        boardColumnId: requireString(payload.boardColumn ?? payload.boardColumnId, 'boardColumn'),
        sprintId: normalizeNonEmpty(payload.sprintId),
        title: requireString(payload.title, 'title'),
        taskCode: normalizeNonEmpty(payload.taskCode ?? payload.code),
        slug: normalizeNonEmpty(payload.slug),
        description: normalizeNonEmpty(payload.description),
        position: parseNumber(payload.position),
        progress: parseNumber(payload.progress),
      }
      assignSourceTimestamps(data, payload)
      return runEffect(services.kanbanTaskService.createTask(asArg0(services.kanbanTaskService.createTask, data)))
    }
    case 'projectman-kanban-task-update': {
      const patch: Record<string, unknown> = {}
      assignDefined(patch, 'title', normalizeNonEmpty(payload.title))
      assignDefined(patch, 'taskCode', normalizeNonEmpty(payload.taskCode ?? payload.code))
      assignDefined(patch, 'slug', normalizeNonEmpty(payload.slug))
      assignDefined(patch, 'description', normalizeNonEmpty(payload.description))
      assignDefined(patch, 'progress', parseNullableNumber(payload.progress))
      assignDefined(patch, 'position', parseNumber(payload.position))
      assignDefined(patch, 'boardColumnId', normalizeNonEmpty(payload.boardColumn ?? payload.boardColumnId))
      assignDefined(patch, 'sprintId', parseNullableString(payload.sprintId))
      assignSourceTimestamps(patch, payload)
      return runEffect(
        services.kanbanTaskService.updateTask(
          requireString(payload.id, 'id'),
          asArg1(services.kanbanTaskService.updateTask, patch),
        ),
      )
    }
    case 'projectman-kanban-task-move': {
      const taskId = requireString(payload.id, 'id')
      const boardColumnId = requireString(payload.boardColumn ?? payload.boardColumnId, 'boardColumn')
      const position = parseNullableNumber(payload.position)
      return toEntityRecord(
        await runEffect(
          services.kanbanTaskService.moveTaskToColumn(
            taskId,
            boardColumnId,
            asArg2(services.kanbanTaskService.moveTaskToColumn, position),
          ),
        ),
      )
    }
    case 'projectman-kanban-task-copy': {
      return runEffect(
        services.kanbanTaskService.copyTask(requireString(payload.id, 'id'), {
          boardColumnId: normalizeNonEmpty(payload.boardColumn ?? payload.boardColumnId) || undefined,
          sprintId: parseNullableString(payload.sprint ?? payload.sprintId),
          title: normalizeNonEmpty(payload.title),
          description: parseNullableString(payload.description),
          position: parseNumber(payload.position),
        } as any),
      )
    }
    case 'projectman-kanban-task-reorder': {
      const boardColumnId = requireString(payload.boardColumn ?? payload.boardColumnId, 'boardColumn')
      const orderedIds = parseStringArray(payload.orderedIds)
      if (!orderedIds || orderedIds.length === 0) throw new Error('missing_required_orderedIds')
      return runEffect(
        services.kanbanTaskService.reorderTasksInColumn(
          boardColumnId,
          orderedIds,
        ),
      )
    }
    case 'projectman-kanban-task-delete': {
      return runEffect(services.kanbanTaskService.removeTask(requireString(payload.id, 'id')))
    }
    case 'projectman-sprint-list':
    case 'projectman-implementation-plan-list': {
      const filter: Record<string, unknown> = {}
      assignDefined(filter, 'scopeId', normalizeNonEmpty(ownerScopeId))
      assignDefined(filter, 'kanbanTaskId', normalizeNonEmpty(payload.kanbanTask ?? payload.kanbanTaskId))
      assignDefined(filter, 'name', normalizeNonEmpty(payload.name))
      return runEffect(
        services.sprintService.listSprints(
          asArg0(services.sprintService.listSprints, filter),
          asArg1(services.sprintService.listSprints, undefined),
          asArg2(services.sprintService.listSprints, { includeArchived: parseBoolean(payload.includeArchived) }),
        ),
      )
    }
    case 'projectman-sprint-get':
    case 'projectman-implementation-plan-get': {
      return runEffect(services.sprintService.getById(requireString(payload.id, 'id')))
    }
    case 'projectman-sprint-create':
    case 'projectman-implementation-plan-create': {
      const data = {
        scopeId: requireString(ownerScopeId, 'project'),
        kanbanTaskId: requireString(payload.kanbanTask ?? payload.kanbanTaskId, 'kanbanTask'),
        name: requireString(payload.name, 'name'),
        goal: requireString(payload.goal, 'goal'),
        references: parseStringArray(payload.references),
        scope: parseStringArray(payload.scope),
        validationPlan: parseStringArray(payload.validationPlan),
        notes: parseNullableString(payload.notes),
        phases: parseJsonArray(payload.phases),
      }
      assignSourceTimestamps(data, payload)
      return runEffect(services.sprintService.createSprint(asArg0(services.sprintService.createSprint, data)))
    }
    case 'projectman-sprint-update-plan':
    case 'projectman-implementation-plan-update': {
      const patch: Record<string, unknown> = {}
      assignDefined(patch, 'name', normalizeNonEmpty(payload.name))
      assignDefined(patch, 'goal', normalizeNonEmpty(payload.goal))
      assignDefined(patch, 'references', parseStringArray(payload.references))
      assignDefined(patch, 'scope', parseStringArray(payload.scope))
      assignDefined(patch, 'validationPlan', parseStringArray(payload.validationPlan))
      assignDefined(patch, 'notes', parseNullableString(payload.notes))
      assignDefined(patch, 'phases', parseJsonArray(payload.phases))
      assignDefined(patch, 'expectedUpdatedAt', normalizeNonEmpty(payload.expectedUpdatedAt))
      assignSourceTimestamps(patch, payload)
      return runEffect(
        services.sprintService.updatePlan(
          requireString(payload.id, 'id'),
          asArg1(services.sprintService.updatePlan, patch),
        ),
      )
    }
    case 'projectman-sprint-update-microtask-status': {
      return runEffect(
        services.sprintService.updateMicrotaskStatus(requireString(payload.id, 'id'), {
          microtaskId: requireString(payload.microTask ?? payload.microTaskId ?? payload.microtask, 'microTask'),
          status: requireString(payload.status, 'status'),
          updatedBy: normalizeNonEmpty(payload.updatedBy),
        } as any),
      )
    }
    case 'projectman-sprint-add-microtask':
    case 'projectman-implementation-plan-add-microtask': {
      return runEffect(
        services.sprintService.addMicrotask(requireString(payload.id, 'id'), {
          phaseId: normalizeNonEmpty(payload.phaseId),
          phase: normalizeNonEmpty(payload.phase),
          title: requireString(payload.title, 'title'),
          status: normalizeNonEmpty(payload.status),
          position: parseOptionalNumber(payload.position),
          notes: parseNullableString(payload.notes),
          createdBy: normalizeNonEmpty(payload.createdBy),
          updatedBy: normalizeNonEmpty(payload.updatedBy),
        } as any),
      )
    }
    case 'projectman-sprint-update-microtask':
    case 'projectman-implementation-plan-update-microtask': {
      return runEffect(
        services.sprintService.updateMicrotask(requireString(payload.id, 'id'), {
          microtaskId: requireString(payload.microTask ?? payload.microTaskId ?? payload.microtask, 'microTask'),
          title: normalizeNonEmpty(payload.title),
          status: normalizeNonEmpty(payload.status),
          position: parseOptionalNumber(payload.position),
          notes: parseNullableString(payload.notes),
          updatedBy: normalizeNonEmpty(payload.updatedBy),
        } as any),
      )
    }
    case 'projectman-sprint-delete-microtask':
    case 'projectman-implementation-plan-delete-microtask': {
      return runEffect(
        services.sprintService.deleteMicrotask(requireString(payload.id, 'id'), {
          microtaskId: requireString(payload.microTask ?? payload.microTaskId ?? payload.microtask, 'microTask'),
          updatedBy: normalizeNonEmpty(payload.updatedBy),
        } as any),
      )
    }
    case 'projectman-sprint-delete': {
      return runEffect(services.sprintService.removeSprint(requireString(payload.id, 'id')))
    }
    case 'projectman-sprint-archive': {
      return runEffect(services.sprintService.archiveSprint(requireString(payload.id, 'id')))
    }
    case 'projectman-sprint-unarchive': {
      return runEffect(services.sprintService.unarchiveSprint(requireString(payload.id, 'id')))
    }
    case 'projectman-issue-list': {
      const filter: Record<string, unknown> = {}
      assignDefined(filter, 'scopeId', requireString(ownerScopeId, 'project'))
      assignDefined(filter, 'sprintId', normalizeNonEmpty(payload.sprint ?? payload.sprintId))
      assignDefined(filter, 'kanbanTaskId', normalizeNonEmpty(payload.kanbanTask ?? payload.kanbanTaskId))
      assignDefined(filter, 'microTaskItemId', normalizeNonEmpty(payload.microTask ?? payload.microTaskItemId ?? payload.microTaskId))
      assignDefined(filter, 'reviewRequestId', normalizeNonEmpty(payload.reviewRequest ?? payload.reviewRequestId))
      assignDefined(filter, 'status', normalizeNonEmpty(payload.status))
      assignDefined(filter, 'severity', normalizeNonEmpty(payload.severity))
      assignDefined(filter, 'source', normalizeNonEmpty(payload.source))
      assignDefined(filter, 'tags', parseStringArray(payload.tags))
      return runEffect(services.issueItemService.listIssues(asArg0(services.issueItemService.listIssues, filter)))
    }
    case 'projectman-issue-get': {
      return runEffect(services.issueItemService.getById(requireString(payload.id, 'id')))
    }
    case 'projectman-issue-create': {
      const data = {
        scopeId: requireString(ownerScopeId, 'project'),
        title: requireString(payload.title, 'title'),
        description: normalizeNonEmpty(payload.description),
        sprintId: normalizeNonEmpty(payload.sprint ?? payload.sprintId),
        kanbanTaskId: normalizeNonEmpty(payload.kanbanTask ?? payload.kanbanTaskId),
        microTaskItemId: normalizeNonEmpty(payload.microTask ?? payload.microTaskItemId ?? payload.microTaskId),
        reviewRequestId: normalizeNonEmpty(payload.reviewRequest ?? payload.reviewRequestId),
        status: normalizeNonEmpty(payload.status),
        severity: normalizeNonEmpty(payload.severity),
        source: normalizeNonEmpty(payload.source),
        tags: parseStringArray(payload.tags),
        notes: normalizeNonEmpty(payload.notes),
        meta: parseJsonValue(payload.meta),
        openedAt: parseDate(payload.openedAt),
      }
      assignSourceTimestamps(data, payload)
      return runEffect(services.issueItemService.createIssue(asArg0(services.issueItemService.createIssue, data)))
    }
    case 'projectman-issue-update': {
      const patch: Record<string, unknown> = {}
      assignDefined(patch, 'title', normalizeNonEmpty(payload.title))
      assignDefined(patch, 'description', normalizeNonEmpty(payload.description))
      assignDefined(patch, 'status', normalizeNonEmpty(payload.status))
      assignDefined(patch, 'severity', normalizeNonEmpty(payload.severity))
      assignDefined(patch, 'source', normalizeNonEmpty(payload.source))
      assignDefined(patch, 'tags', parseStringArray(payload.tags))
      assignDefined(patch, 'notes', normalizeNonEmpty(payload.notes))
      assignDefined(patch, 'meta', parseJsonValue(payload.meta))
      assignDefined(patch, 'sprintId', parseNullableString(payload.sprint ?? payload.sprintId))
      assignDefined(patch, 'kanbanTaskId', parseNullableString(payload.kanbanTask ?? payload.kanbanTaskId))
      assignDefined(patch, 'microTaskItemId', parseNullableString(payload.microTask ?? payload.microTaskItemId ?? payload.microTaskId))
      assignDefined(patch, 'reviewRequestId', parseNullableString(payload.reviewRequest ?? payload.reviewRequestId))
      assignDefined(patch, 'resolvedAt', parseNullableDate(payload.resolvedAt))
      assignSourceTimestamps(patch, payload)
      return runEffect(
        services.issueItemService.updateIssue(
          requireString(payload.id, 'id'),
          asArg1(services.issueItemService.updateIssue, patch),
        ),
      )
    }
    case 'projectman-issue-delete': {
      return runEffect(services.issueItemService.removeIssue(requireString(payload.id, 'id')))
    }
    case 'projectman-feedback-list': {
      const filter: Record<string, unknown> = {}
      assignDefined(filter, 'scopeId', requireString(ownerScopeId, 'project'))
      assignDefined(filter, 'sprintId', normalizeNonEmpty(payload.sprint ?? payload.sprintId))
      assignDefined(filter, 'kanbanTaskId', normalizeNonEmpty(payload.kanbanTask ?? payload.kanbanTaskId))
      assignDefined(filter, 'microTaskItemId', normalizeNonEmpty(payload.microTask ?? payload.microTaskItemId ?? payload.microTaskId))
      assignDefined(filter, 'status', normalizeNonEmpty(payload.status))
      assignDefined(filter, 'type', normalizeNonEmpty(payload.type))
      assignDefined(filter, 'severity', normalizeNonEmpty(payload.severity))
      assignDefined(filter, 'source', normalizeNonEmpty(payload.source))
      assignDefined(filter, 'tags', parseStringArray(payload.tags))
      return runEffect(services.feedbackItemService.listFeedback(asArg0(services.feedbackItemService.listFeedback, filter)))
    }
    case 'projectman-feedback-get': {
      return runEffect(services.feedbackItemService.getById(requireString(payload.id, 'id')))
    }
    case 'projectman-feedback-create': {
      const data = {
        scopeId: requireString(ownerScopeId, 'project'),
        title: requireString(payload.title, 'title'),
        description: normalizeNonEmpty(payload.description),
        sprintId: normalizeNonEmpty(payload.sprint ?? payload.sprintId),
        kanbanTaskId: normalizeNonEmpty(payload.kanbanTask ?? payload.kanbanTaskId),
        microTaskItemId: normalizeNonEmpty(payload.microTask ?? payload.microTaskItemId ?? payload.microTaskId),
        status: normalizeNonEmpty(payload.status),
        type: normalizeNonEmpty(payload.type),
        severity: normalizeNonEmpty(payload.severity),
        source: normalizeNonEmpty(payload.source),
        tags: parseStringArray(payload.tags),
        suggestion: normalizeNonEmpty(payload.suggestion),
        notes: normalizeNonEmpty(payload.notes),
        meta: parseJsonValue(payload.meta),
        recordedAt: parseDate(payload.recordedAt),
      }
      assignSourceTimestamps(data, payload)
      return runEffect(services.feedbackItemService.createFeedback(asArg0(services.feedbackItemService.createFeedback, data)))
    }
    case 'projectman-feedback-update': {
      const patch: Record<string, unknown> = {}
      assignDefined(patch, 'title', normalizeNonEmpty(payload.title))
      assignDefined(patch, 'description', normalizeNonEmpty(payload.description))
      assignDefined(patch, 'status', normalizeNonEmpty(payload.status))
      assignDefined(patch, 'type', normalizeNonEmpty(payload.type))
      assignDefined(patch, 'severity', normalizeNonEmpty(payload.severity))
      assignDefined(patch, 'source', normalizeNonEmpty(payload.source))
      assignDefined(patch, 'tags', parseStringArray(payload.tags))
      assignDefined(patch, 'suggestion', normalizeNonEmpty(payload.suggestion))
      assignDefined(patch, 'notes', normalizeNonEmpty(payload.notes))
      assignDefined(patch, 'meta', parseJsonValue(payload.meta))
      assignDefined(patch, 'sprintId', parseNullableString(payload.sprint ?? payload.sprintId))
      assignDefined(patch, 'kanbanTaskId', parseNullableString(payload.kanbanTask ?? payload.kanbanTaskId))
      assignDefined(patch, 'microTaskItemId', parseNullableString(payload.microTask ?? payload.microTaskItemId ?? payload.microTaskId))
      assignDefined(patch, 'handledAt', parseNullableDate(payload.handledAt))
      assignSourceTimestamps(patch, payload)
      return runEffect(
        services.feedbackItemService.updateFeedback(
          requireString(payload.id, 'id'),
          asArg1(services.feedbackItemService.updateFeedback, patch),
        ),
      )
    }
    case 'projectman-feedback-delete': {
      return runEffect(services.feedbackItemService.removeFeedback(requireString(payload.id, 'id')))
    }
    case 'projectman-review-request-list': {
      const filter: Record<string, unknown> = {}
      assignDefined(filter, 'scopeId', requireString(ownerScopeId, 'project'))
      assignDefined(filter, 'sprintId', normalizeNonEmpty(payload.sprint ?? payload.sprintId))
      assignDefined(filter, 'kanbanTaskId', normalizeNonEmpty(payload.kanbanTask ?? payload.kanbanTaskId))
      assignDefined(filter, 'microTaskItemId', normalizeNonEmpty(payload.microTask ?? payload.microTaskItemId ?? payload.microTaskId))
      assignDefined(filter, 'collabSessionId', normalizeNonEmpty(payload.collabSession ?? payload.collabSessionId))
      assignDefined(filter, 'status', normalizeNonEmpty(payload.status))
      assignDefined(filter, 'priority', normalizeNonEmpty(payload.priority))
      assignDefined(filter, 'source', normalizeNonEmpty(payload.source))
      assignDefined(filter, 'targetAgent', normalizeNonEmpty(payload.targetAgent))
      assignDefined(filter, 'targetSlot', normalizeNonEmpty(payload.targetSlot))
      assignDefined(filter, 'parentReviewRequestId', normalizeNonEmpty(payload.parentReviewRequest ?? payload.parentReviewRequestId))
      assignDefined(filter, 'rootReviewRequestId', normalizeNonEmpty(payload.rootReviewRequest ?? payload.rootReviewRequestId))
      assignDefined(filter, 'tags', parseStringArray(payload.tags))
      return runEffect(services.reviewRequestService.listReviewRequests(asArg0(services.reviewRequestService.listReviewRequests, filter)))
    }
    case 'projectman-review-request-get': {
      return runEffect(services.reviewRequestService.getById(requireString(payload.id, 'id')))
    }
    case 'projectman-review-request-create': {
      const data = {
        scopeId: requireString(ownerScopeId, 'project'),
        title: requireString(payload.title, 'title'),
        description: normalizeNonEmpty(payload.description),
        reviewScope: normalizeNonEmpty(payload.reviewScope),
        instructions: normalizeNonEmpty(payload.instructions),
        references: parseStringArray(payload.references),
        sprintId: normalizeNonEmpty(payload.sprint ?? payload.sprintId),
        kanbanTaskId: normalizeNonEmpty(payload.kanbanTask ?? payload.kanbanTaskId),
        microTaskItemId: normalizeNonEmpty(payload.microTask ?? payload.microTaskItemId ?? payload.microTaskId),
        collabSessionId: normalizeNonEmpty(payload.collabSession ?? payload.collabSessionId),
        collabRequestEventId: normalizeNonEmpty(payload.collabRequestEvent ?? payload.collabRequestEventId),
        collabResultEventIds: parseStringArray(payload.collabResultEventIds),
        parentReviewRequestId: normalizeNonEmpty(payload.parentReviewRequest ?? payload.parentReviewRequestId),
        rootReviewRequestId: normalizeNonEmpty(payload.rootReviewRequest ?? payload.rootReviewRequestId),
        status: normalizeNonEmpty(payload.status),
        priority: normalizeNonEmpty(payload.priority),
        source: normalizeNonEmpty(payload.source),
        tags: parseStringArray(payload.tags),
        requestedBy: normalizeNonEmpty(payload.requestedBy),
        targetAgent: normalizeNonEmpty(payload.targetAgent),
        targetSlot: normalizeNonEmpty(payload.targetSlot),
        notes: normalizeNonEmpty(payload.notes),
        meta: parseJsonObject(payload.meta),
        idempotencyKey: normalizeNonEmpty(payload.idempotencyKey),
        requestedAt: parseDate(payload.requestedAt),
      }
      assignSourceTimestamps(data, payload)
      return runEffect(services.reviewRequestService.createReviewRequest(asArg0(services.reviewRequestService.createReviewRequest, data)))
    }
    case 'projectman-review-request-update': {
      const patch: Record<string, unknown> = {}
      assignDefined(patch, 'title', normalizeNonEmpty(payload.title))
      assignDefined(patch, 'description', parseNullableString(payload.description))
      assignDefined(patch, 'reviewScope', parseNullableString(payload.reviewScope))
      assignDefined(patch, 'instructions', parseNullableString(payload.instructions))
      assignDefined(patch, 'references', parseStringArray(payload.references))
      assignDefined(patch, 'priority', normalizeNonEmpty(payload.priority))
      assignDefined(patch, 'source', normalizeNonEmpty(payload.source))
      assignDefined(patch, 'sprintId', parseNullableString(payload.sprint ?? payload.sprintId))
      assignDefined(patch, 'kanbanTaskId', parseNullableString(payload.kanbanTask ?? payload.kanbanTaskId))
      assignDefined(patch, 'microTaskItemId', parseNullableString(payload.microTask ?? payload.microTaskItemId ?? payload.microTaskId))
      assignDefined(patch, 'collabSessionId', parseNullableString(payload.collabSession ?? payload.collabSessionId))
      assignDefined(patch, 'collabRequestEventId', parseNullableString(payload.collabRequestEvent ?? payload.collabRequestEventId))
      assignDefined(patch, 'tags', parseStringArray(payload.tags))
      assignDefined(patch, 'requestedBy', parseNullableString(payload.requestedBy))
      assignDefined(patch, 'targetAgent', parseNullableString(payload.targetAgent))
      assignDefined(patch, 'targetSlot', parseNullableString(payload.targetSlot))
      assignDefined(patch, 'notes', parseNullableString(payload.notes))
      assignDefined(patch, 'meta', parseJsonObject(payload.meta))
      assignDefined(patch, 'requestedAt', parseNullableDate(payload.requestedAt))
      assignDefined(patch, 'closedAt', parseNullableDate(payload.closedAt))
      assignSourceTimestamps(patch, payload)
      return runEffect(
        services.reviewRequestService.updateReviewRequest(
          requireString(payload.id, 'id'),
          asArg1(services.reviewRequestService.updateReviewRequest, patch),
        ),
      )
    }
    case 'projectman-review-request-add-result': {
      const result = {
        reviewer: requireString(payload.reviewer, 'reviewer'),
        outcome: requireString(payload.outcome, 'outcome'),
        summary: requireString(payload.summary, 'summary'),
        positives: parseStringArray(payload.positives),
        concerns: parseStringArray(payload.concerns),
        objections: parseStringArray(payload.objections),
        references: parseStringArray(payload.references),
        issueIds: parseStringArray(payload.issueIds),
        basedOnSeqRange: parseJsonObject(payload.basedOnSeqRange),
        id: normalizeNonEmpty(payload.resultId),
        createdAt: parseDate(payload.resultCreatedAt),
        collabResultEventId: normalizeNonEmpty(payload.collabResultEventId),
        idempotencyKey: normalizeNonEmpty(payload.idempotencyKey),
      }
      return runEffect(
        services.reviewRequestService.addResult(
          requireString(payload.id, 'id'),
          asArg1(services.reviewRequestService.addResult, result),
        ),
      )
    }
    case 'projectman-review-request-delete': {
      return runEffect(services.reviewRequestService.removeReviewRequest(requireString(payload.id, 'id')))
    }
    case 'projectman-kanban-template-list': {
      const filter: Record<string, unknown> = {}
      assignDefined(filter, 'scopeId', ownerScopeId)
      assignDefined(filter, 'name', normalizeNonEmpty(payload.name))
      return runEffect(services.kanbanTemplateService.listTemplates(asArg0(services.kanbanTemplateService.listTemplates, filter)))
    }
    case 'projectman-kanban-template-create': {
      const data = {
        scopeId: requireString(ownerScopeId, 'project'),
        name: requireString(payload.name, 'name'),
        description: normalizeNonEmpty(payload.description),
        definition: parseJsonValue(payload.definition),
      }
      return runEffect(services.kanbanTemplateService.createTemplate(asArg0(services.kanbanTemplateService.createTemplate, data)))
    }
    case 'projectman-kanban-template-update': {
      const patch: Record<string, unknown> = {}
      assignDefined(patch, 'name', normalizeNonEmpty(payload.name))
      assignDefined(patch, 'description', normalizeNonEmpty(payload.description))
      assignDefined(patch, 'definition', parseJsonValue(payload.definition))
      return runEffect(
        services.kanbanTemplateService.updateTemplate(
          requireString(payload.id, 'id'),
          asArg1(services.kanbanTemplateService.updateTemplate, patch),
        ),
      )
    }
    case 'projectman-kanban-template-delete': {
      return runEffect(services.kanbanTemplateService.removeTemplate(requireString(payload.id, 'id')))
    }
    case 'projectman-kanban-template-apply': {
      const templateId = requireString(payload.id, 'id')
      const projId = requireString(ownerScopeId, 'project')
      return runEffect(services.kanbanTemplateService.applyTemplateToProject(templateId, projId))
    }
    case 'projectman-event-list': {
      const filter: Record<string, unknown> = {}
      assignDefined(filter, 'scopeId', requireString(ownerScopeId, 'project'))
      assignDefined(filter, 'entityType', normalizeNonEmpty(payload.entityType))
      assignDefined(filter, 'entityId', normalizeNonEmpty(payload.entityId))
      assignDefined(filter, 'action', normalizeNonEmpty(payload.action))
      return runEffect(services.projectmanEventService.listEvents(asArg0(services.projectmanEventService.listEvents, filter)))
    }
    case 'projectman-event-delete': {
      return runEffect(services.projectmanEventService.removeEvent(requireString(payload.id, 'id')))
    }
    default:
      throw new Error(`unknown_projectman_tool: ${toolId}`)
  }
}

function isNotFoundLikeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const normalized = message.trim().toLowerCase()
  if (!normalized) return false
  return (
    normalized.includes('notfound') ||
    normalized.includes('not found') ||
    normalized.includes('failed to find')
  )
}

async function runResolvedOperation(operation: ProjectmanOperationContract, input: unknown): Promise<unknown> {
  try {
    return await runToolExecution(operation.toolId, input)
  } catch (error) {
    if (operation.kind === 'list' && isNotFoundLikeError(error)) {
      return []
    }
    throw error
  }
}

export async function runProjectmanKitOperationByToolId(toolId: string, input: unknown): Promise<unknown> {
  const operation = resolveOperationByToolId(toolId)
  return runResolvedOperation(operation, input)
}

export async function runProjectmanKitOperationById<TId extends ProjectmanTypedOperationId>(
  operationId: TId,
  input: ProjectmanOperationInput<TId>,
): Promise<ProjectmanOperationOutput<TId>> {
  const operation = resolveOperationById(operationId)
  return runResolvedOperation(operation, input) as Promise<ProjectmanOperationOutput<TId>>
}

export async function runProjectmanKitOperationByTypedId<TId extends ProjectmanTypedOperationId>(
  operationId: TId,
  input: ProjectmanOperationInput<TId>,
): Promise<ProjectmanOperationOutput<TId>> {
  return runProjectmanKitOperationById(operationId, input)
}

export async function runProjectmanKitOperation(
  input: unknown,
  identifier: { toolId: string } | { operationId: string },
): Promise<unknown> {
  if ('toolId' in identifier) {
    return runProjectmanKitOperationByToolId(identifier.toolId, input)
  }
  const operation = resolveOperationById(identifier.operationId)
  return runResolvedOperation(operation, input)
}

export function clearProjectmanKitOperationCaches(): void {
  cachedServices = null
}
