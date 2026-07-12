import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type {
  IRepositoryPortKanbanBoardColumn,
  IRepositoryPortKanbanBoard,
  IRepositoryPortKanbanTask,
  IRepositoryPortProjectmanEvent,
  IRepositoryPortSprint,
} from '../ports/repository-ports/index.js'
import type {
  IKanbanTaskServicePort,
  KanbanTaskCopyInput,
  KanbanTaskCreateInput,
} from '../ports/inbound/index.js'
import { KanbanTaskServiceError } from '../errors/KanbanTaskServiceError.js'
import { IbmKanbanTask, IbmKanbanTaskInsert, IbmProjectmanEventInsert, kanbanTaskZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

const TASK_CODE_PREFIX = 'TASK-'
const TASK_CODE_PATTERN = /^TASK-(\d+)$/i

const normalizeTaskCode = (value: unknown): string | undefined => {
  const raw = String(value ?? '').trim().toUpperCase()
  if (!raw) return undefined
  const normalized = raw.replace(/[^A-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '')
  if (!normalized) return undefined
  const match = TASK_CODE_PATTERN.exec(normalized)
  if (!match) return normalized
  const serial = Number.parseInt(match[1] ?? '', 10)
  if (!Number.isFinite(serial) || serial <= 0) return undefined
  return `${TASK_CODE_PREFIX}${serial}`
}

const normalizeTaskSlug = (value: unknown): string | undefined => {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return undefined
  const normalized = raw.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '')
  return normalized || undefined
}

export interface KanbanTaskServiceDependencies {}

export interface KanbanTaskServiceOptions {
  kanbanTaskRepository: IRepositoryPortKanbanTask
  kanbanBoardColumnRepository?: IRepositoryPortKanbanBoardColumn
  kanbanBoardRepository?: IRepositoryPortKanbanBoard
  sprintRepository?: IRepositoryPortSprint
  eventRepository?: IRepositoryPortProjectmanEvent
  serviceDependencies?: Partial<KanbanTaskServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class KanbanTaskService implements IKanbanTaskServicePort {
  private readonly kanbanTaskRepository: IRepositoryPortKanbanTask
  private readonly kanbanBoardColumnRepository?: IRepositoryPortKanbanBoardColumn
  private readonly kanbanBoardRepository?: IRepositoryPortKanbanBoard
  private readonly sprintRepository?: IRepositoryPortSprint
  private readonly eventRepository?: IRepositoryPortProjectmanEvent
  private readonly logger?: XfLogger

  constructor(options: KanbanTaskServiceOptions) {
    this.kanbanTaskRepository = options.kanbanTaskRepository
    this.kanbanBoardColumnRepository = options.kanbanBoardColumnRepository
    this.kanbanBoardRepository = options.kanbanBoardRepository
    this.sprintRepository = options.sprintRepository
    this.eventRepository = options.eventRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmKanbanTask>): Effect.Effect<IbmKanbanTask | null, KanbanTaskServiceError> {
    const stage = 'KanbanTaskService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.kanbanTaskRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmKanbanTaskInsert): Effect.Effect<IbmKanbanTask, KanbanTaskServiceError> {
    const stage = 'KanbanTaskService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: kanbanTaskZodSchemaInsert,
          stage,
          operation: 'KanbanTaskService::create.kanbanTaskZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.kanbanTaskRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  createTask(input: KanbanTaskCreateInput): Effect.Effect<IbmKanbanTask, KanbanTaskServiceError> {
    const stage = 'KanbanTaskService::createTask'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) => {
        const normalized = { ...payload } as IbmKanbanTaskInsert
        const providedTaskCode = normalizeTaskCode(normalized.taskCode)
        const providedSlug = normalizeTaskSlug(normalized.slug)
        if (providedTaskCode) {
          normalized.taskCode = providedTaskCode as any
        }
        if (providedSlug) {
          normalized.slug = providedSlug as any
        }
        if (normalized.progress === undefined || normalized.progress === null) {
          normalized.progress = 0 as any
        }
        if (normalized.position === undefined || normalized.position === null) {
          return pipe(
            this.listTasks({ boardColumnId: normalized.boardColumnId }, { sort: [{ field: 'position', type: 'desc' }], limit: 1 }),
            Effect.map((items) => {
              const next = items?.[0]?.position ?? -1
              return { ...normalized, position: next + 1 }
            })
          )
        }
        return Effect.succeed(normalized)
      }),
      Effect.flatMap((normalized) => {
        if (normalizeTaskCode(normalized.taskCode)) {
          return Effect.succeed(normalized)
        }
        return this.nextTaskCode(normalized.scopeId).pipe(
          Effect.map((taskCode) => ({ ...normalized, taskCode } as IbmKanbanTaskInsert))
        )
      }),
      Effect.flatMap((data) => this.softDuplicateGuardTask(data)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in createTask')
      }))
    )
  }

  copyTask(id: string, input: KanbanTaskCopyInput): Effect.Effect<IbmKanbanTask, KanbanTaskServiceError> {
    const stage = 'KanbanTaskService::copyTask'
    return Effect.gen(this, function* (_) {
      const taskId = yield* _(validateUuidInput(id, 'id', { stage }))
      yield* _(validateInput(input, 'input', { stage }))

      const source = yield* _(
        this.kanbanTaskRepository.findById(taskId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
        )
      )
      if (!source) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: taskId })))
      }

      const targetBoardColumnId = String(input.boardColumnId ?? source.boardColumnId ?? '').trim()
      if (!targetBoardColumnId) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'boardColumnId', stage })))
      }

      const targetScope = yield* _(this.resolveTargetBoardScope(targetBoardColumnId))
      const targetScopeId = targetScope?.scopeId ?? source.scopeId
      const targetBoardId = targetScope?.boardId ?? source.boardId
      if (!targetScopeId || !targetBoardId) {
        return yield* _(Effect.fail(XfErrorFactory.inputRequired({ field: 'targetBoardScope', stage })))
      }

      const targetSprintId = input.sprintId ?? null
      if (targetSprintId) {
        yield* _(this.ensureSprintBelongsToScope(targetSprintId, targetScopeId, stage))
      }

      const created = yield* _(this.createTask({
        scopeId: targetScopeId,
        boardId: targetBoardId,
        boardColumnId: targetBoardColumnId,
        title: input.title ?? source.title,
        description: input.description !== undefined ? input.description ?? undefined : source.description ?? undefined,
        position: input.position,
        progress: 0,
      } as any))

      if (targetSprintId) {
        yield* _(this.updateTask(created.id ?? '', { sprintId: targetSprintId } as any))
      }

      yield* _(this.recordEvent({
        scopeId: created.scopeId ?? targetScopeId,
        entityType: 'kanban-task',
        entityId: created.id ?? '',
        action: 'kanban.task.copy',
        payload: {
          sourceTaskId: source.id ?? taskId,
          sourceScopeId: source.scopeId ?? null,
          targetScopeId: created.scopeId ?? targetScopeId,
          targetBoardId: created.boardId ?? targetBoardId,
          targetBoardColumnId,
          targetSprintId,
        },
      }))

      return created
    }).pipe(
      Effect.mapError((error) => error as KanbanTaskServiceError),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in copyTask')
      }))
    )
  }

  private softDuplicateGuardTask(data: IbmKanbanTaskInsert): Effect.Effect<IbmKanbanTask, KanbanTaskServiceError> {
    const title = String((data as any).title ?? '').trim()
    const scopeId = String(data.scopeId ?? '').trim()
    const boardColumnId = String(data.boardColumnId ?? '').trim()
    if (!title || !scopeId || !boardColumnId) {
      return this.create(data)
    }
    return pipe(
      this.listTasks({ scopeId, title, boardColumnId } as any, { limit: 1 }),
      Effect.flatMap((existing) => {
        if (existing.length > 0 && existing[0]) {
          this.logger?.info({ title, scopeId }, 'Soft duplicate guard: returning existing task instead of creating duplicate')
          return Effect.succeed(existing[0])
        }
        return this.create(data)
      }),
      Effect.catchAll(() => this.create(data))
    )
  }

  private nextTaskCode(scopeId: string): Effect.Effect<string, KanbanTaskServiceError> {
    const stage = 'KanbanTaskService::nextTaskCode'
    return pipe(
      this.listTasks({ scopeId } as any),
      Effect.map((items) => {
        let maxSerial = 0
        for (const item of items) {
          const code = normalizeTaskCode(item?.taskCode)
          const match = code ? TASK_CODE_PATTERN.exec(code) : null
          if (!match) continue
          const serial = Number.parseInt(match[1] ?? '', 10)
          if (Number.isFinite(serial) && serial > maxSerial) {
            maxSerial = serial
          }
        }
        return `${TASK_CODE_PREFIX}${maxSerial + 1}`
      }),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error while generating task code')
      }))
    )
  }

  updateTask(id: string, patch: Partial<IbmKanbanTask>): Effect.Effect<IbmKanbanTask, KanbanTaskServiceError> {
    const stage = 'KanbanTaskService::updateTask'
    const normalizedPatch = { ...patch } as Partial<IbmKanbanTask>
    if ('taskCode' in normalizedPatch) {
      normalizedPatch.taskCode = normalizeTaskCode(normalizedPatch.taskCode) as any
      if (!normalizedPatch.taskCode) delete normalizedPatch.taskCode
    }
    if ('slug' in normalizedPatch) {
      normalizedPatch.slug = normalizeTaskSlug(normalizedPatch.slug) as any
      if (!normalizedPatch.slug) delete normalizedPatch.slug
    }

    if (!normalizedPatch || Object.keys(normalizedPatch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return Effect.gen(this, function* (_) {
      yield* _(validateUuidInput(id, 'id', { stage }))
      yield* _(
        validateBmInputWithSchema({
          input: normalizedPatch,
          schema: kanbanTaskZodSchemaInsert.partial().strict(),
          stage,
          operation: 'KanbanTaskService::updateTask.kanbanTaskZodSchemaInsert.patch',
          field: 'patch',
        })
      )
      const before = yield* _(
        this.kanbanTaskRepository.findById(id).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
        )
      )
      if (!before) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: id })))
      }

      const updated = yield* _(
        this.kanbanTaskRepository.patchById(id, normalizedPatch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      )
      if (!updated) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: id })))
      }

      if (normalizedPatch.sprintId !== undefined) {
        yield* _(this.recordEvent({
          scopeId: updated.scopeId,
          entityType: 'kanban-task',
          entityId: updated.id ?? id,
          action: normalizedPatch.sprintId ? 'kanban.task.link-sprint' : 'kanban.task.unlink-sprint',
          payload: { fromSprintId: before.sprintId ?? null, toSprintId: normalizedPatch.sprintId ?? null },
        }))
        yield* _(this.syncSprintLink(before, updated, normalizedPatch.sprintId))
      }

      return updated
    }).pipe(
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateTask')
      }))
    )
  }

  listTasks(
    filter: Partial<IbmKanbanTask> = {},
    options?: DbQueryOptions<IbmKanbanTask>
  ): Effect.Effect<IbmKanbanTask[], KanbanTaskServiceError> {
    const stage = 'KanbanTaskService::listTasks'
    const queryOptions = options?.sort
      ? options
      : { ...options, sort: [{ field: 'position', type: 'asc' }] }
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.kanbanTaskRepository.find({ matchEq: filter, options: queryOptions } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listTasks')
      }))
    )
  }

  moveTaskToColumn(
    taskId: string,
    toBoardColumnId: string,
    toPosition?: number
  ): Effect.Effect<IbmKanbanTask, KanbanTaskServiceError> {
    const stage = 'KanbanTaskService::moveTaskToColumn'
    return Effect.gen(this, function* (_) {
      yield* _(validateInput(taskId, 'taskId', { stage }))
      yield* _(validateInput(toBoardColumnId, 'toBoardColumnId', { stage }))

      const before = yield* _(
        this.kanbanTaskRepository.findById(taskId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
        )
      )
      if (!before) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: taskId })))
      }

      const resolvedPosition = yield* _(
        toPosition !== undefined && toPosition !== null
          ? Effect.succeed(toPosition)
          : pipe(
              this.listTasks({ boardColumnId: toBoardColumnId } as any, {
                sort: [{ field: 'position', type: 'desc' }],
                limit: 1,
              }),
              Effect.map((items) => (items?.[0]?.position ?? -1) + 1)
            )
      )

      const targetScope = yield* _(this.resolveTargetBoardScope(toBoardColumnId))
      const nextScopeId = targetScope?.scopeId ?? before.scopeId
      if (nextScopeId && before.scopeId && nextScopeId !== before.scopeId) {
        return yield* _(
          Effect.fail(
            XfErrorFactory.configurationError({
              stage,
              message: `cross_scope_move_not_supported:${taskId}`,
            }),
          ),
        )
      }
      const patch: Partial<IbmKanbanTask> = {
        boardId: targetScope?.boardId ?? before.boardId,
        boardColumnId: toBoardColumnId,
        scopeId: nextScopeId,
        position: resolvedPosition,
      }

      const updated = yield* _(this.kanbanTaskRepository.patchById(taskId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      ))
      if (!updated) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: taskId })))
      }

      yield* _(this.recordEvent({
        scopeId: updated.scopeId,
        entityType: 'kanban-task',
        entityId: updated.id ?? taskId,
        action: 'kanban.task.move',
        payload: {
          fromBoardId: before.boardId,
          fromBoardColumnId: before.boardColumnId,
          fromScopeId: before.scopeId,
          toBoardId: patch.boardId ?? null,
          toBoardColumnId,
          toScopeId: patch.scopeId ?? null,
          toPosition: resolvedPosition,
        },
      }))

      return updated
    }).pipe(
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in moveTaskToColumn')
      }))
    )
  }

  reorderTasksInColumn(boardColumnId: string, orderedTaskIds: string[]): Effect.Effect<number, KanbanTaskServiceError> {
    const stage = 'KanbanTaskService::reorderTasksInColumn'
    const tempBase = 1000000
    return Effect.gen(this, function* (_) {
      yield* _(validateInput(boardColumnId, 'boardColumnId', { stage }))
      yield* _(validateInput(orderedTaskIds, 'orderedTaskIds', { stage }))

      const targetScope = yield* _(this.resolveTargetBoardScope(boardColumnId))

      yield* _(
        Effect.forEach(
          orderedTaskIds,
          (id, index) => {
            const patch: Partial<IbmKanbanTask> = {
              boardId: targetScope?.boardId,
              boardColumnId,
              scopeId: targetScope?.scopeId,
              position: tempBase + index,
            }
            return this.kanbanTaskRepository.patchById(id, patch as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(temp)', factory: XfErrorFactory.upsertFailed }))
            )
          },
          { concurrency: 1 }
        )
      )

      yield* _(
        Effect.forEach(
          orderedTaskIds,
          (id, index) => {
            const patch: Partial<IbmKanbanTask> = {
              boardId: targetScope?.boardId,
              boardColumnId,
              scopeId: targetScope?.scopeId,
              position: index,
            }
            return this.kanbanTaskRepository.patchById(id, patch as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(final)', factory: XfErrorFactory.upsertFailed }))
            )
          },
          { concurrency: 1 }
        )
      )

      if (orderedTaskIds.length > 0) {
        yield* _(
          pipe(
            this.kanbanTaskRepository.findById(orderedTaskIds[0]).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound })),
              Effect.flatMap((task) => task ? this.recordEvent({
                scopeId: targetScope?.scopeId ?? task.scopeId,
                entityType: 'kanban-board-column',
                entityId: boardColumnId,
                action: 'kanban.task.reorder',
                payload: {
                  boardId: targetScope?.boardId ?? null,
                  boardColumnId,
                  orderedTaskIds,
                  scopeId: targetScope?.scopeId ?? null,
                },
              }) : Effect.succeed(undefined))
            )
          )
        )
      }

      return orderedTaskIds.length
    }).pipe(
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in reorderTasksInColumn')
      }))
    )
  }

  private resolveTargetBoardScope(
    boardColumnId: string
  ): Effect.Effect<{ boardId: string; scopeId: string } | null, KanbanTaskServiceError> {
    const boardColumnRepository = this.kanbanBoardColumnRepository
    const boardRepository = this.kanbanBoardRepository
    if (!boardColumnRepository || !boardRepository) {
      return Effect.succeed(null)
    }
    const stage = 'KanbanTaskService::resolveTargetBoardScope'
    return Effect.gen(function* (_) {
      const boardColumn = yield* _(
        boardColumnRepository.findById(boardColumnId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById(boardColumn)', factory: XfErrorFactory.notFound }))
        )
      )
      if (!boardColumn?.boardId) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: boardColumnId })))
      }

      const board = yield* _(
        boardRepository.findById(boardColumn.boardId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById(board)', factory: XfErrorFactory.notFound }))
        )
      )
      if (!board?.id || !board.scopeId) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: boardColumn.boardId })))
      }

      return { boardId: board.id, scopeId: board.scopeId }
    })
  }

  private ensureSprintBelongsToScope(
    sprintId: string,
    scopeId: string,
    stage: string,
  ): Effect.Effect<void, KanbanTaskServiceError> {
    const repo = this.sprintRepository
    if (!repo) return Effect.succeed(undefined)
    return Effect.gen(function* (_) {
      const sprint = yield* _(
        repo.findById(sprintId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById(sprint)', factory: XfErrorFactory.notFound }))
        )
      )
      if (!sprint || sprint.scopeId !== scopeId) {
        return yield* _(Effect.fail(XfErrorFactory.configurationError({ stage, message: `sprint_scope_mismatch:${sprintId}` })))
      }
    })
  }

  private recordEvent(input: {
    scopeId: string
    entityType: string
    entityId: string
    action: string
    payload?: unknown
    actorId?: string
  }): Effect.Effect<void, KanbanTaskServiceError> {
    if (!this.eventRepository) return Effect.succeed(undefined)
    const stage = 'KanbanTaskService::recordEvent'
    const event: IbmProjectmanEventInsert = {
      scopeId: input.scopeId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      payload: input.payload,
      actorId: input.actorId,
    } as any
    return pipe(
      this.eventRepository.create(event).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ),
      Effect.asVoid,
      Effect.catchAll((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.warn({ error: info.unwrapped, stage }, 'Event log failed')
        })
      )
    )
  }

  private syncSprintLink(
    before: IbmKanbanTask,
    updated: IbmKanbanTask,
    nextSprintId?: string | null
  ): Effect.Effect<void, KanbanTaskServiceError> {
    void before
    void updated
    void nextSprintId
    return Effect.succeed(undefined)
  }

  removeTask(id: string): Effect.Effect<void, KanbanTaskServiceError> {
    const stage = 'KanbanTaskService::removeTask'
    return Effect.gen(this, function* (_) {
      yield* _(validateUuidInput(id, 'id', { stage }))

      if (this.eventRepository) {
        yield* _(
          this.eventRepository.deleteMany({ matchEq: { entityType: 'kanban-task', entityId: id } as any } as any).pipe(
            Effect.mapError(mapDbError({ stage, operation: 'deleteMany(events)', factory: XfErrorFactory.upsertFailed }))
          )
        )
      }

      yield* _(
        this.kanbanTaskRepository.deleteById(id).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      )

      return undefined
    }).pipe(
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeTask')
      }))
    )
  }
}
