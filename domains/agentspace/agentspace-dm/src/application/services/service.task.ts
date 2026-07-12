import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import type { IRepositoryPortTask } from '../ports/repository-ports/index.js'
import type { ITaskCommentServicePort, ITaskServicePort, TaskChecklistItemCreateInput, TaskCreateInput, TaskLabelCreateInput, TaskRecord, TaskRelationCreateInput } from '../ports/inbound/index.js'
import type { IRepositoryPortTaskLabel } from '../ports/repository-ports/IRepositoryPortTaskLabel.js'
import type { IRepositoryPortTaskLabelLink } from '../ports/repository-ports/IRepositoryPortTaskLabelLink.js'
import type { IRepositoryPortTaskChecklistItem } from '../ports/repository-ports/IRepositoryPortTaskChecklistItem.js'
import type { IRepositoryPortTaskRelation } from '../ports/repository-ports/IRepositoryPortTaskRelation.js'
import { TaskServiceError } from '../errors/TaskServiceError.js'
import {
  IbmTask,
  IbmTaskChecklistItem,
  IbmTaskChecklistItemInsert,
  IbmTaskComment,
  IbmTaskCommentInsert,
  IbmTaskInsert,
  IbmTaskLabel,
  IbmTaskLabelInsert,
  IbmTaskLabelLink,
  IbmTaskLabelLinkInsert,
  IbmTaskRelation,
  IbmTaskRelationInsert,
  taskChecklistItemZodSchemaInsert,
  taskCommentZodSchemaInsert,
  taskLabelZodSchemaInsert,
  taskLabelLinkZodSchemaInsert,
  taskRelationZodSchemaInsert,
  taskZodSchemaInsert,
} from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'

const DEFAULT_POSITION_SORT = [{ field: 'position', type: 'asc' }] as const
const RELATION_SUMMARY_EMPTY = {
  blocking: 0,
  blockedBy: 0,
  precedes: 0,
  precededBy: 0,
  related: 0,
}

function withPositionSort<T>(options?: DbQueryOptions<T>): DbQueryOptions<T> {
  if (options?.sort) return options
  return { ...options, sort: [...DEFAULT_POSITION_SORT] as any }
}

function toHydrationRepositoryOptions<T>(options?: DbQueryOptions<T>): DbQueryOptions<T> {
  const next = { ...(options ?? {}) } as DbQueryOptions<T> & { offset?: number }
  delete next.limit
  delete next.skip
  delete next.offset
  delete next.sort
  return withPositionSort(next)
}

function toComparableValue(value: unknown): number | string {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const parsedDate = Date.parse(value)
    if (!Number.isNaN(parsedDate) && value.includes('T')) return parsedDate
    return value.toLocaleLowerCase('en-US')
  }
  if (value === null || value === undefined) return Number.NEGATIVE_INFINITY
  return String(value).toLocaleLowerCase('en-US')
}

function applyQueryOptions<T extends Record<string, unknown>>(items: T[], options?: DbQueryOptions<T>): T[] {
  let next = [...items]

  if (options?.sort?.length) {
    next.sort((left, right) => {
      for (const sort of options.sort ?? []) {
        const field = sort.field as keyof T
        const leftValue = toComparableValue(left?.[field])
        const rightValue = toComparableValue(right?.[field])
        if (leftValue === rightValue) continue

        const comparison = leftValue < rightValue ? -1 : 1
        return sort.type === 'desc' ? comparison * -1 : comparison
      }
      return 0
    })
  }

  const skip = typeof options?.skip === 'number' && Number.isFinite(options.skip) && options.skip > 0
    ? Math.trunc(options.skip)
    : 0
  const limit = typeof options?.limit === 'number' && Number.isFinite(options.limit) && options.limit >= 0
    ? Math.trunc(options.limit)
    : undefined

  if (skip > 0) next = next.slice(skip)
  if (limit !== undefined) next = next.slice(0, limit)
  return next
}

export interface TaskServiceOptions {
  taskRepository: IRepositoryPortTask
  taskCommentService: ITaskCommentServicePort
  taskLabelRepository: IRepositoryPortTaskLabel
  taskLabelLinkRepository: IRepositoryPortTaskLabelLink
  taskChecklistItemRepository: IRepositoryPortTaskChecklistItem
  taskRelationRepository: IRepositoryPortTaskRelation
  logger?: XfLogger
  locale?: string
}

export class TaskService implements ITaskServicePort {
  private readonly taskRepository: IRepositoryPortTask
  private readonly taskCommentService: ITaskCommentServicePort
  private readonly taskLabelRepository: IRepositoryPortTaskLabel
  private readonly taskLabelLinkRepository: IRepositoryPortTaskLabelLink
  private readonly taskChecklistItemRepository: IRepositoryPortTaskChecklistItem
  private readonly taskRelationRepository: IRepositoryPortTaskRelation
  private readonly logger?: XfLogger

  constructor(options: TaskServiceOptions) {
    this.taskRepository = options.taskRepository
    this.taskCommentService = options.taskCommentService
    this.taskLabelRepository = options.taskLabelRepository
    this.taskLabelLinkRepository = options.taskLabelLinkRepository
    this.taskChecklistItemRepository = options.taskChecklistItemRepository
    this.taskRelationRepository = options.taskRelationRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  private requireEntityId(id: string | undefined, stage: string): Effect.Effect<string, TaskServiceError> {
    return id
      ? Effect.succeed(id)
      : Effect.fail(XfErrorFactory.notFound({ stage, identifier: 'missing-id' }))
  }

  private getTaskBaseById(id: string, options?: DbQueryOptions<IbmTask>): Effect.Effect<IbmTask | null, TaskServiceError> {
    const stage = 'TaskService::getTaskBaseById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((taskId) => this.taskRepository.findById(taskId, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getTaskBaseById')
      }))
    )
  }

  private requireTaskById(id: string): Effect.Effect<IbmTask, TaskServiceError> {
    const stage = 'TaskService::requireTaskById'
    return this.getTaskBaseById(id).pipe(
      Effect.flatMap((task) =>
        task
          ? Effect.succeed(task)
          : Effect.fail(XfErrorFactory.notFound({ stage, identifier: id }))
      )
    )
  }

  private hydrateTaskGroup(tasks: IbmTask[], scopeId: string): Effect.Effect<TaskRecord[], TaskServiceError> {
    return Effect.gen(this, function* (_) {
      if (!scopeId || tasks.length === 0) return tasks as TaskRecord[]

      const [labels, labelLinks, checklistItems, relations, comments] = yield* _(
        Effect.all([
          this.taskLabelRepository.find({ matchEq: { scopeId }, options: withPositionSort<IbmTaskLabel>() } as any).pipe(
            Effect.mapError(mapDbError({ stage: 'TaskService::hydrateTaskGroup', operation: 'taskLabelRepository.find', factory: XfErrorFactory.notFound }))
          ),
          this.taskLabelLinkRepository.find({ matchEq: { scopeId } } as any).pipe(
            Effect.mapError(mapDbError({ stage: 'TaskService::hydrateTaskGroup', operation: 'taskLabelLinkRepository.find', factory: XfErrorFactory.notFound }))
          ),
          this.taskChecklistItemRepository.find({ matchEq: { scopeId }, options: withPositionSort<IbmTaskChecklistItem>() } as any).pipe(
            Effect.mapError(mapDbError({ stage: 'TaskService::hydrateTaskGroup', operation: 'taskChecklistItemRepository.find', factory: XfErrorFactory.notFound }))
          ),
          this.taskRelationRepository.find({ matchEq: { scopeId } } as any).pipe(
            Effect.mapError(mapDbError({ stage: 'TaskService::hydrateTaskGroup', operation: 'taskRelationRepository.find', factory: XfErrorFactory.notFound }))
          ),
          this.taskCommentService.listByProject(scopeId).pipe(
            Effect.mapError((cause) => XfErrorFactory.notFound({ stage: 'TaskService::hydrateTaskGroup', operation: 'taskCommentService.listByProject', cause }))
          ),
        ])
      )

      const labelById = new Map(labels.map((label) => [label.id, label]))
      const labelIdsByTask = new Map<string, string[]>()
      for (const link of labelLinks) {
        if (!link.taskId || !link.labelId) continue
        if (!labelIdsByTask.has(link.taskId)) labelIdsByTask.set(link.taskId, [])
        labelIdsByTask.get(link.taskId)?.push(link.labelId)
      }

      const checklistStatsByTaskId = new Map<string, { total: number; completed: number; remaining: number }>()
      for (const item of checklistItems) {
        if (!item.taskId) continue
        const current = checklistStatsByTaskId.get(item.taskId) ?? { total: 0, completed: 0, remaining: 0 }
        current.total += 1
        if (item.isDone) current.completed += 1
        current.remaining = current.total - current.completed
        checklistStatsByTaskId.set(item.taskId, current)
      }

      const commentCountByTaskId = new Map<string, number>()
      for (const comment of comments) {
        if (!comment.taskId) continue
        commentCountByTaskId.set(comment.taskId, (commentCountByTaskId.get(comment.taskId) ?? 0) + 1)
      }

      const relationSummaryByTaskId = new Map<string, typeof RELATION_SUMMARY_EMPTY>()
      const ensureRelationSummary = (taskId: string) => {
        const existing = relationSummaryByTaskId.get(taskId)
        if (existing) return existing
        const created = { ...RELATION_SUMMARY_EMPTY }
        relationSummaryByTaskId.set(taskId, created)
        return created
      }
      for (const relation of relations) {
        if (!relation.fromTaskId || !relation.toTaskId) continue
        const fromSummary = ensureRelationSummary(relation.fromTaskId)
        const toSummary = ensureRelationSummary(relation.toTaskId)
        if (relation.kind === 'blocks') {
          fromSummary.blocking += 1
          toSummary.blockedBy += 1
          continue
        }
        if (relation.kind === 'precedes') {
          fromSummary.precedes += 1
          toSummary.precededBy += 1
          continue
        }
        fromSummary.related += 1
        toSummary.related += 1
      }

      return tasks.map((task) => {
        const taskId = task.id ?? ''
        const labelsForTask = (labelIdsByTask.get(taskId) ?? [])
          .map((labelId) => labelById.get(labelId) ?? null)
          .filter((label): label is IbmTaskLabel => Boolean(label))
        return {
          ...task,
          labels: labelsForTask,
          checklistStats: checklistStatsByTaskId.get(taskId) ?? { total: 0, completed: 0, remaining: 0 },
          commentCount: commentCountByTaskId.get(taskId) ?? 0,
          relationSummary: relationSummaryByTaskId.get(taskId) ?? { ...RELATION_SUMMARY_EMPTY },
        }
      })
    })
  }

  private hydrateTasks(tasks: IbmTask[]): Effect.Effect<TaskRecord[], TaskServiceError> {
    const groups = new Map<string, IbmTask[]>()
    for (const task of tasks) {
      const scopeId = String(task?.scopeId ?? '').trim()
      if (!scopeId) continue
      if (!groups.has(scopeId)) groups.set(scopeId, [])
      groups.get(scopeId)?.push(task)
    }

    return Effect.gen(this, function* (_) {
      if (tasks.length === 0) return []
      const hydratedGroups = yield* _(
        Effect.forEach(
          [...groups.entries()],
          ([scopeId, groupTasks]) => this.hydrateTaskGroup(groupTasks, scopeId),
          { concurrency: 1 },
        ),
      )
      return hydratedGroups.flat()
    })
  }

  getById(id: string, options?: DbQueryOptions<IbmTask>): Effect.Effect<TaskRecord | null, TaskServiceError> {
    return pipe(
      this.getTaskBaseById(id, options),
      Effect.flatMap((task) => (task ? this.hydrateTasks([task]) : Effect.succeed([]))),
      Effect.map((items) => items[0] ?? null),
    )
  }

  create(data: IbmTaskInsert): Effect.Effect<IbmTask, TaskServiceError> {
    const stage = 'TaskService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) => {
        if (payload.position === undefined || payload.position === null) {
          return this.taskRepository.find({ matchEq: { columnId: payload.columnId }, options: withPositionSort<IbmTask>() } as any).pipe(
            Effect.map((items) => {
              const next = (items ?? []).reduce(
                (max, item) => Math.max(max, Number.isFinite(item?.position) ? item.position : -1),
                -1,
              )
              return { ...payload, position: next + 1 }
            }),
            Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound })),
          )
        }
        return Effect.succeed(payload)
      }),
      Effect.flatMap((payload) =>
        validateBmInputWithSchema({
          input: payload,
          schema: taskZodSchemaInsert,
          stage,
          operation: 'TaskService::create.taskZodSchemaInsert',
          field: 'data',
        }),
      ),
      Effect.flatMap((payload) => this.taskRepository.create(payload).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      )),
    )
  }

  getTask(id: string, options?: DbQueryOptions<IbmTask>): Effect.Effect<TaskRecord | null, TaskServiceError> {
    return this.getById(id, options)
  }

  createTask(data: TaskCreateInput): Effect.Effect<TaskRecord, TaskServiceError> {
    const stage = 'TaskService::createTask'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) => this.create(payload as IbmTaskInsert)),
      Effect.flatMap((task) =>
        this.requireEntityId(task.id, stage).pipe(
          Effect.flatMap((taskId) =>
            this.getById(taskId).pipe(
              Effect.flatMap((hydrated) =>
                hydrated
                  ? Effect.succeed(hydrated)
                  : Effect.fail(XfErrorFactory.notFound({ stage, identifier: taskId }))
              )
            )
          ),
        )
      ),
    )
  }

  updateTask(id: string, patch: Partial<IbmTask>): Effect.Effect<TaskRecord, TaskServiceError> {
    const stage = 'TaskService::updateTask'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: taskZodSchemaInsert.partial().strict(),
          stage,
          operation: 'TaskService::updateTask.taskZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(Effect.map(() => entityId))
      ),
      Effect.flatMap((taskId) => this.taskRepository.patchById(taskId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.flatMap((task) =>
        this.requireEntityId(task.id, stage).pipe(
          Effect.flatMap((taskId) =>
            this.getById(taskId).pipe(
              Effect.flatMap((hydrated) =>
                hydrated
                  ? Effect.succeed(hydrated)
                  : Effect.fail(XfErrorFactory.notFound({ stage, identifier: taskId }))
              )
            )
          ),
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateTask')
      })),
    )
  }

  setTaskPriority(id: string, priority: number | null): Effect.Effect<TaskRecord, TaskServiceError> {
    return this.updateTask(id, { priority: priority === null ? (null as any) : priority })
  }

  setTaskAssignee(id: string, assignee: string | null): Effect.Effect<TaskRecord, TaskServiceError> {
    return this.updateTask(id, { assignee: assignee === null ? (null as any) : assignee })
  }

  setTaskDueDate(id: string, dueAt: Date | null): Effect.Effect<TaskRecord, TaskServiceError> {
    return this.updateTask(id, { dueAt: dueAt === null ? (null as any) : dueAt })
  }

  setTaskParent(id: string, parentTaskId: string | null): Effect.Effect<TaskRecord, TaskServiceError> {
    return this.updateTask(id, { parentTaskId: parentTaskId === null ? (null as any) : parentTaskId })
  }

  linkTaskToSprint(id: string, sprintId: string): Effect.Effect<TaskRecord, TaskServiceError> {
    return this.updateTask(id, { sprintId })
  }

  unlinkTaskFromSprint(id: string): Effect.Effect<TaskRecord, TaskServiceError> {
    return this.updateTask(id, { sprintId: null as any })
  }

  searchTasks(filter: Partial<IbmTask> = {}, options?: DbQueryOptions<IbmTask>): Effect.Effect<TaskRecord[], TaskServiceError> {
    const stage = 'TaskService::searchTasks'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((validatedFilter) => this.taskRepository.find({ matchEq: validatedFilter, options: toHydrationRepositoryOptions(options) } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.flatMap((tasks) => this.hydrateTasks(tasks)),
      Effect.map((tasks) => applyQueryOptions(tasks, options as DbQueryOptions<TaskRecord> | undefined)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in searchTasks')
      })),
    )
  }

  reorderTasksInColumn(columnId: string, orderedTaskIds: string[]): Effect.Effect<number, TaskServiceError> {
    const stage = 'TaskService::reorderTasksInColumn'
    const tempBase = 1000000
    return pipe(
      validateInput(columnId, 'columnId', { stage }),
      Effect.flatMap(() => validateInput(orderedTaskIds, 'orderedTaskIds', { stage })),
      Effect.flatMap(() =>
        Effect.forEach(
          orderedTaskIds,
          (id, index) =>
            this.taskRepository.patchById(id, { columnId, position: tempBase + index } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(temp)', factory: XfErrorFactory.upsertFailed }))
            ),
          { concurrency: 1 }
        )
      ),
      Effect.flatMap(() =>
        Effect.forEach(
          orderedTaskIds,
          (id, index) =>
            this.taskRepository.patchById(id, { position: index } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(final)', factory: XfErrorFactory.upsertFailed }))
            ),
          { concurrency: 1 }
        )
      ),
      Effect.map(() => orderedTaskIds.length),
    )
  }

  reorderTask(taskId: string, toPosition: number): Effect.Effect<TaskRecord, TaskServiceError> {
    const stage = 'TaskService::reorderTask'
    return pipe(
      this.requireTaskById(taskId),
      Effect.flatMap((task) =>
        this.taskRepository.find({ matchEq: { columnId: task.columnId }, options: withPositionSort<IbmTask>() } as any).pipe(
          Effect.map((tasks) => {
            const ids = tasks.map((entry) => entry.id).filter((id): id is string => !!id)
            const filtered = ids.filter((id) => id !== taskId)
            const index = Math.max(0, Math.min(filtered.length, toPosition))
            filtered.splice(index, 0, taskId)
            return { task, orderedIds: filtered }
          }),
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound })),
        )
      ),
      Effect.flatMap(({ task, orderedIds }) =>
        this.requireEntityId(task.id, stage).pipe(
          Effect.flatMap((taskId) => this.reorderTasksInColumn(task.columnId, orderedIds).pipe(Effect.as(taskId))),
        )
      ),
      Effect.flatMap((id) =>
        this.getById(id).pipe(
          Effect.flatMap((task) =>
            task
              ? Effect.succeed(task)
              : Effect.fail(XfErrorFactory.notFound({ stage, identifier: id }))
          )
        )
      ),
    )
  }

  moveTaskToColumn(taskId: string, toColumnId: string, toPosition?: number): Effect.Effect<TaskRecord, TaskServiceError> {
    const stage = 'TaskService::moveTaskToColumn'
    return pipe(
      this.requireTaskById(taskId),
      Effect.flatMap(() =>
        this.taskRepository.find({ matchEq: { columnId: toColumnId }, options: withPositionSort<IbmTask>() } as any).pipe(
          Effect.map((tasks) => {
            const ids = tasks.map((entry) => entry.id).filter((id): id is string => !!id)
            const filtered = ids.filter((id) => id !== taskId)
            const index = typeof toPosition === 'number' && Number.isFinite(toPosition)
              ? Math.max(0, Math.min(filtered.length, toPosition))
              : filtered.length
            filtered.splice(index, 0, taskId)
            return filtered
          }),
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound })),
        )
      ),
      Effect.flatMap((orderedIds) => this.reorderTasksInColumn(toColumnId, orderedIds).pipe(Effect.as(taskId))),
      Effect.flatMap((id) =>
        this.getById(id).pipe(
          Effect.flatMap((task) =>
            task
              ? Effect.succeed(task)
              : Effect.fail(XfErrorFactory.notFound({ stage, identifier: id }))
          )
        )
      ),
    )
  }

  deleteTask(id: string): Effect.Effect<number, TaskServiceError> {
    const stage = 'TaskService::deleteTask'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((taskId) => this.taskRepository.deleteById(taskId).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
      )),
    )
  }

  addTaskComment(data: IbmTaskCommentInsert): Effect.Effect<IbmTaskComment, TaskServiceError> {
    const stage = 'TaskService::addTaskComment'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) =>
        validateBmInputWithSchema({
          input: payload,
          schema: taskCommentZodSchemaInsert,
          stage,
          operation: 'TaskService::addTaskComment.taskCommentZodSchemaInsert',
          field: 'data',
        }),
      ),
      Effect.flatMap((payload) =>
        this.taskCommentService.create(payload).pipe(
          Effect.mapError((cause) => XfErrorFactory.createFailed({ stage, operation: 'taskCommentService.create', cause }))
        )
      ),
    )
  }

  listTaskComments(taskId: string, options?: DbQueryOptions<IbmTaskComment>): Effect.Effect<IbmTaskComment[], TaskServiceError> {
    const stage = 'TaskService::listTaskComments'
    return pipe(
      validateInput(taskId, 'taskId', { stage }),
      Effect.flatMap(() =>
        this.taskCommentService.listByTask(taskId, options).pipe(
          Effect.mapError((cause) => XfErrorFactory.notFound({ stage, operation: 'taskCommentService.listByTask', cause }))
        )
      )
    )
  }

  createTaskLabel(data: TaskLabelCreateInput): Effect.Effect<IbmTaskLabel, TaskServiceError> {
    const stage = 'TaskService::createTaskLabel'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) => {
        if (payload.position === undefined || payload.position === null) {
          return this.listTaskLabels(payload.scopeId).pipe(
            Effect.map((labels) => {
              const next = labels.reduce((max, label) => Math.max(max, Number.isFinite(label?.position) ? label.position : -1), -1)
              return { ...payload, position: next + 1 } satisfies TaskLabelCreateInput
            })
          )
        }
        return Effect.succeed(payload)
      }),
      Effect.flatMap((payload) =>
        validateBmInputWithSchema({
          input: payload,
          schema: taskLabelZodSchemaInsert,
          stage,
          operation: 'TaskService::createTaskLabel.taskLabelZodSchemaInsert',
          field: 'data',
        }),
      ),
      Effect.flatMap((payload) => this.taskLabelRepository.create(payload as IbmTaskLabelInsert).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      )),
    )
  }

  deleteTaskLabel(id: string): Effect.Effect<number, TaskServiceError> {
    const stage = 'TaskService::deleteTaskLabel'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((labelId) => this.taskLabelRepository.deleteById(labelId).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
      )),
    )
  }

  listTaskLabels(scopeId: string, options?: DbQueryOptions<IbmTaskLabel>): Effect.Effect<IbmTaskLabel[], TaskServiceError> {
    const stage = 'TaskService::listTaskLabels'
    return pipe(
      validateInput(scopeId, 'scopeId', { stage }),
      Effect.flatMap((projectScopeId) => this.taskLabelRepository.find({ matchEq: { scopeId: projectScopeId }, options: withPositionSort(options) } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
    )
  }

  listLabelsForTask(taskId: string): Effect.Effect<IbmTaskLabel[], TaskServiceError> {
    return Effect.gen(this, function* (_) {
      const task = yield* _(this.requireTaskById(taskId))
      const [labels, links] = yield* _(
        Effect.all([
          this.listTaskLabels(task.scopeId),
          this.taskLabelLinkRepository.find({ matchEq: { scopeId: task.scopeId, taskId } } as any).pipe(
            Effect.mapError(mapDbError({ stage: 'TaskService::listLabelsForTask', operation: 'find', factory: XfErrorFactory.notFound }))
          ),
        ]),
      )
      const labelById = new Map(labels.map((label) => [label.id, label]))
      return links
        .map((link) => labelById.get(link.labelId) ?? null)
        .filter((label): label is IbmTaskLabel => Boolean(label))
    })
  }

  setTaskLabel(taskId: string, labelId: string): Effect.Effect<IbmTaskLabelLink, TaskServiceError> {
    const stage = 'TaskService::setTaskLabel'
    return Effect.gen(this, function* (_) {
      const task = yield* _(this.requireTaskById(taskId))
      const label = yield* _(
        this.taskLabelRepository.findById(labelId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'taskLabelRepository.findById', factory: XfErrorFactory.notFound }))
        )
      )
      if (!label || label.scopeId !== task.scopeId) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: labelId })))
      }

      const existing = yield* _(
        this.taskLabelLinkRepository.find({ matchEq: { scopeId: task.scopeId, taskId, labelId } } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'taskLabelLinkRepository.find', factory: XfErrorFactory.notFound }))
        )
      )
      if (existing[0]) return existing[0]

      const payload: IbmTaskLabelLinkInsert = { scopeId: task.scopeId, taskId, labelId }
      const validated = yield* _(
        validateBmInputWithSchema({
          input: payload,
          schema: taskLabelLinkZodSchemaInsert,
          stage,
          operation: 'TaskService::setTaskLabel.taskLabelLinkZodSchemaInsert',
          field: 'data',
        }),
      )
      return yield* _(
        this.taskLabelLinkRepository.create(validated).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
        )
      )
    })
  }

  unsetTaskLabel(taskId: string, labelId: string): Effect.Effect<number, TaskServiceError> {
    const stage = 'TaskService::unsetTaskLabel'
    return Effect.gen(this, function* (_) {
      const task = yield* _(this.requireTaskById(taskId))
      return yield* _(
        this.taskLabelLinkRepository.deleteMany({ matchEq: { scopeId: task.scopeId, taskId, labelId } } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteMany', factory: XfErrorFactory.upsertFailed }))
        )
      )
    })
  }

  addChecklistItem(data: TaskChecklistItemCreateInput): Effect.Effect<IbmTaskChecklistItem, TaskServiceError> {
    const stage = 'TaskService::addChecklistItem'
    return Effect.gen(this, function* (_) {
      const task = yield* _(this.requireTaskById(data.taskId))
      let position = data.position
      if (position === undefined || position === null) {
        const existing = yield* _(this.listChecklistItems(data.taskId))
        position = existing.reduce((max, item) => Math.max(max, Number.isFinite(item?.position) ? item.position : -1), -1) + 1
      }
      const payload: IbmTaskChecklistItemInsert = {
        scopeId: data.scopeId ?? task.scopeId,
        taskId: data.taskId,
        content: data.content,
        isDone: data.isDone ?? false,
        position,
      }
      const validated = yield* _(
        validateBmInputWithSchema({
          input: payload,
          schema: taskChecklistItemZodSchemaInsert,
          stage,
          operation: 'TaskService::addChecklistItem.taskChecklistItemZodSchemaInsert',
          field: 'data',
        }),
      )
      return yield* _(
        this.taskChecklistItemRepository.create(validated).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
        )
      )
    })
  }

  toggleChecklistItem(id: string, isDone: boolean): Effect.Effect<IbmTaskChecklistItem, TaskServiceError> {
    const stage = 'TaskService::toggleChecklistItem'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((itemId) => this.taskChecklistItemRepository.patchById(itemId, { isDone } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
    )
  }

  removeChecklistItem(id: string): Effect.Effect<number, TaskServiceError> {
    const stage = 'TaskService::removeChecklistItem'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((itemId) => this.taskChecklistItemRepository.deleteById(itemId).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
      )),
    )
  }

  reorderChecklistItems(taskId: string, orderedItemIds: string[]): Effect.Effect<number, TaskServiceError> {
    const stage = 'TaskService::reorderChecklistItems'
    return pipe(
      validateInput(taskId, 'taskId', { stage }),
      Effect.flatMap(() => validateInput(orderedItemIds, 'orderedItemIds', { stage })),
      Effect.flatMap(() =>
        Effect.forEach(
          orderedItemIds,
          (id, index) =>
            this.taskChecklistItemRepository.patchById(id, { position: index } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
            ),
          { concurrency: 1 }
        )
      ),
      Effect.map(() => orderedItemIds.length),
    )
  }

  listChecklistItems(taskId: string, options?: DbQueryOptions<IbmTaskChecklistItem>): Effect.Effect<IbmTaskChecklistItem[], TaskServiceError> {
    const stage = 'TaskService::listChecklistItems'
    return pipe(
      validateInput(taskId, 'taskId', { stage }),
      Effect.flatMap((validatedTaskId) => this.taskChecklistItemRepository.find({ matchEq: { taskId: validatedTaskId }, options: withPositionSort(options) } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
    )
  }

  addTaskRelation(data: TaskRelationCreateInput): Effect.Effect<IbmTaskRelation, TaskServiceError> {
    const stage = 'TaskService::addTaskRelation'
    return Effect.gen(this, function* (_) {
      if (data.fromTaskId === data.toTaskId) {
        return yield* _(Effect.fail(XfErrorFactory.createFailed({ stage, operation: 'self-relation' })))
      }
      const fromTask = yield* _(this.requireTaskById(data.fromTaskId))
      const toTask = yield* _(this.requireTaskById(data.toTaskId))
      if (fromTask.scopeId !== toTask.scopeId) {
        return yield* _(Effect.fail(XfErrorFactory.createFailed({ stage, operation: 'cross-scope-relation' })))
      }

      const existing = yield* _(
        this.taskRelationRepository.find({
          matchEq: { scopeId: fromTask.scopeId, fromTaskId: data.fromTaskId, toTaskId: data.toTaskId, kind: data.kind },
        } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      )
      if (existing[0]) return existing[0]

      const payload: IbmTaskRelationInsert = {
        scopeId: data.scopeId ?? fromTask.scopeId,
        fromTaskId: data.fromTaskId,
        toTaskId: data.toTaskId,
        kind: data.kind,
      }
      const validated = yield* _(
        validateBmInputWithSchema({
          input: payload,
          schema: taskRelationZodSchemaInsert,
          stage,
          operation: 'TaskService::addTaskRelation.taskRelationZodSchemaInsert',
          field: 'data',
        }),
      )
      return yield* _(
        this.taskRelationRepository.create(validated).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
        )
      )
    })
  }

  removeTaskRelation(id: string): Effect.Effect<number, TaskServiceError> {
    const stage = 'TaskService::removeTaskRelation'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((relationId) => this.taskRelationRepository.deleteById(relationId).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
      )),
    )
  }

  listTaskRelations(taskId: string, _options?: DbQueryOptions<IbmTaskRelation>): Effect.Effect<IbmTaskRelation[], TaskServiceError> {
    const stage = 'TaskService::listTaskRelations'
    return Effect.gen(this, function* (_) {
      const task = yield* _(this.requireTaskById(taskId))
      const relations = yield* _(
        this.taskRelationRepository.find({ matchEq: { scopeId: task.scopeId } } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      )
      return relations.filter((relation) => relation.fromTaskId === taskId || relation.toTaskId === taskId)
    })
  }
}
