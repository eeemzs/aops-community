import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { XfLogger } from '@aopslab/xf-logger'
import type {
  IRepositoryPortFeedbackItem,
  IRepositoryPortIssueItem,
  IRepositoryPortKanbanTask,
  IRepositoryPortMicroTaskItem,
  IRepositoryPortProjectmanEvent,
  IRepositoryPortSprint,
  IRepositoryPortSprintGroup,
} from '../ports/repository-ports/index.js'
import type {
  IPlanningLineageServicePort,
  IMicroTaskItemServicePort,
  MicroTaskItemCopyInput,
  MicroTaskItemCreateInput,
  MicroTaskItemMoveInput,
} from '../ports/inbound/index.js'
import { MicroTaskItemServiceError } from '../errors/MicroTaskItemServiceError.js'
import {
  IbmMicroTaskItem,
  IbmMicroTaskItemInsert,
  microTaskItemZodSchemaInsert,
} from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export interface MicroTaskItemServiceDependencies {
  planningLineageService: IPlanningLineageServicePort
}

export interface MicroTaskItemServiceOptions {
  microTaskItemRepository: IRepositoryPortMicroTaskItem
  kanbanTaskRepository?: IRepositoryPortKanbanTask
  sprintRepository?: IRepositoryPortSprint
  sprintGroupRepository?: IRepositoryPortSprintGroup
  issueItemRepository?: IRepositoryPortIssueItem
  feedbackItemRepository?: IRepositoryPortFeedbackItem
  eventRepository?: IRepositoryPortProjectmanEvent
  serviceDependencies?: Partial<MicroTaskItemServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class MicroTaskItemService implements IMicroTaskItemServicePort {
  private readonly microTaskItemRepository: IRepositoryPortMicroTaskItem
  private readonly logger?: XfLogger

  constructor(options: MicroTaskItemServiceOptions) {
    this.microTaskItemRepository = options.microTaskItemRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmMicroTaskItem>): Effect.Effect<IbmMicroTaskItem | null, MicroTaskItemServiceError> {
    const stage = 'MicroTaskItemService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((microTaskId) =>
        this.microTaskItemRepository.findById(microTaskId, options).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound })),
        ),
      ),
      Effect.tapError((error) =>
        Effect.sync(() => {
          const info = effectErrorInfo(error)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
        }),
      ),
    )
  }

  create(data: IbmMicroTaskItemInsert): Effect.Effect<IbmMicroTaskItem, MicroTaskItemServiceError> {
    const stage = 'MicroTaskItemService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) =>
        validateBmInputWithSchema({
          input: payload,
          schema: microTaskItemZodSchemaInsert,
          stage,
          operation: 'MicroTaskItemService::create.microTaskItemZodSchemaInsert',
          field: 'data',
        }),
      ),
      Effect.flatMap((payload) =>
        this.microTaskItemRepository.create(payload).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed })),
        ),
      ),
    )
  }

  createMicroTask(input: MicroTaskItemCreateInput): Effect.Effect<IbmMicroTaskItem, MicroTaskItemServiceError> {
    const stage = 'MicroTaskItemService::createMicroTask'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) => {
        const normalized = { ...payload } as IbmMicroTaskItemInsert
        const phaseId = normalizeString((normalized as any).phaseId)
        if (!phaseId) {
          return Effect.fail(XfErrorFactory.inputRequired({ field: 'phaseId', stage }))
        }
        if (normalized.position === undefined || normalized.position === null) {
          return pipe(
            this.listMicroTasks({ phaseId } as Partial<IbmMicroTaskItem>),
            Effect.map((items) => ({
              ...normalized,
              phaseId,
              position: items.reduce((max, item) => Math.max(max, item.position ?? -1), -1) + 1,
            })),
          )
        }
        return Effect.succeed({ ...normalized, phaseId })
      }),
      Effect.flatMap((payload) => this.create(payload)),
    )
  }

  updateMicroTask(id: string, patch: Partial<IbmMicroTaskItem>): Effect.Effect<IbmMicroTaskItem, MicroTaskItemServiceError> {
    const stage = 'MicroTaskItemService::updateMicroTask'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }
    return Effect.gen(this, function* (_) {
      const microTaskId = yield* _(validateUuidInput(id, 'id', { stage }))
      yield* _(
        validateBmInputWithSchema({
          input: patch,
          schema: microTaskItemZodSchemaInsert.partial().strict(),
          stage,
          operation: 'MicroTaskItemService::updateMicroTask.microTaskItemZodSchemaInsert.patch',
          field: 'patch',
        }),
      )
      const updated = yield* _(
        this.microTaskItemRepository.patchById(microTaskId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed })),
        ),
      )
      return updated
    }).pipe(Effect.mapError((error) => error as MicroTaskItemServiceError))
  }

  moveMicroTask(id: string, input: MicroTaskItemMoveInput): Effect.Effect<IbmMicroTaskItem, MicroTaskItemServiceError> {
    void id
    void input
    return Effect.fail(
      XfErrorFactory.configurationError({
        stage: 'MicroTaskItemService::moveMicroTask',
        message: 'Standalone microtask moves are not supported in Sprint V2',
      }),
    )
  }

  copyMicroTask(id: string, input: MicroTaskItemCopyInput): Effect.Effect<IbmMicroTaskItem, MicroTaskItemServiceError> {
    void id
    void input
    return Effect.fail(
      XfErrorFactory.configurationError({
        stage: 'MicroTaskItemService::copyMicroTask',
        message: 'Standalone microtask copies are not supported in Sprint V2',
      }),
    )
  }

  listMicroTasks(
    filter: Partial<IbmMicroTaskItem> = {},
    options?: DbQueryOptions<IbmMicroTaskItem>,
  ): Effect.Effect<IbmMicroTaskItem[], MicroTaskItemServiceError> {
    const stage = 'MicroTaskItemService::listMicroTasks'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((resolvedFilter) =>
        this.microTaskItemRepository.find({ matchEq: resolvedFilter, options } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound })),
        ),
      ),
    )
  }

  reorderMicroTasksInGroup(sprintGroupId: string, orderedTaskIds: string[]): Effect.Effect<number, MicroTaskItemServiceError> {
    const stage = 'MicroTaskItemService::reorderMicroTasksInGroup'
    return Effect.gen(this, function* (_) {
      const phaseId = yield* _(validateInput(sprintGroupId, 'sprintGroupId', { stage }))
      yield* _(validateInput(orderedTaskIds, 'orderedTaskIds', { stage }))
      let updated = 0
      for (let index = 0; index < orderedTaskIds.length; index += 1) {
        const taskId = orderedTaskIds[index]!
        yield* _(
          this.microTaskItemRepository.patchById(taskId, {
            position: index,
            phaseId,
          } as Partial<IbmMicroTaskItem>).pipe(
            Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed })),
          ),
        )
        updated += 1
      }
      return updated
    }).pipe(Effect.mapError((error) => error as MicroTaskItemServiceError))
  }

  removeMicroTask(id: string): Effect.Effect<void, MicroTaskItemServiceError> {
    const stage = 'MicroTaskItemService::removeMicroTask'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((microTaskId) =>
        this.microTaskItemRepository.deleteById(microTaskId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed })),
        ),
      ),
      Effect.map(() => undefined),
      Effect.tapError((error) =>
        Effect.sync(() => {
          const info = effectErrorInfo(error)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeMicroTask')
        }),
      ),
    )
  }
}
