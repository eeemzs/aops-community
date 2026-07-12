import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortSprintItem } from '../ports/repository-ports/index.js'
import type { ISprintItemServicePort, SprintItemCreateInput } from '../ports/inbound/index.js'
import { SprintItemServiceError } from '../errors/SprintItemServiceError.js'
import { IbmSprintItem, IbmSprintItemInsert, sprintItemZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface SprintItemServiceOptions {
  sprintItemRepository: IRepositoryPortSprintItem
  logger?: XfLogger
  locale?: string
}

export class SprintItemService implements ISprintItemServicePort {
  private readonly sprintItemRepository: IRepositoryPortSprintItem
  private readonly logger?: XfLogger

  constructor(options: SprintItemServiceOptions) {
    this.sprintItemRepository = options.sprintItemRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmSprintItem>): Effect.Effect<IbmSprintItem | null, SprintItemServiceError> {
    const stage = 'SprintItemService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.sprintItemRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmSprintItemInsert): Effect.Effect<IbmSprintItem, SprintItemServiceError> {
    const stage = 'SprintItemService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) => {
        if (data.position === undefined || data.position === null) {
          return pipe(
            this.listSprintItems({ sprintId: data.sprintId }),
            Effect.map((items) => {
              const next = (items ?? []).reduce(
                (max, item) => Math.max(max, Number.isFinite(item?.position) ? item.position : -1),
                -1,
              )
              return { ...data, position: next + 1 }
            })
          )
        }
        return Effect.succeed(data)
      }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: sprintItemZodSchemaInsert,
          stage,
          operation: 'SprintItemService::create.sprintItemZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.sprintItemRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  addSprintItem(data: SprintItemCreateInput): Effect.Effect<IbmSprintItem, SprintItemServiceError> {
    const stage = 'SprintItemService::addSprintItem'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) => this.create(payload as IbmSprintItemInsert))
    )
  }

  updateSprintItem(id: string, patch: Partial<IbmSprintItem>): Effect.Effect<IbmSprintItem, SprintItemServiceError> {
    const stage = 'SprintItemService::updateSprintItem'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: sprintItemZodSchemaInsert.partial().strict(),
          stage,
          operation: 'SprintItemService::updateSprintItem.sprintItemZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((itemId) => this.sprintItemRepository.patchById(itemId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateSprintItem')
      }))
    )
  }

  listSprintItems(
    filter: Partial<IbmSprintItem> = {},
    options?: DbQueryOptions<IbmSprintItem>
  ): Effect.Effect<IbmSprintItem[], SprintItemServiceError> {
    const stage = 'SprintItemService::listSprintItems'
    const queryOptions = options?.sort
      ? options
      : { ...options, sort: [{ field: 'position', type: 'asc' }] }
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.sprintItemRepository.find({ matchEq: filter, options: queryOptions } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listSprintItems')
      }))
    )
  }

  reorderSprintItems(sprintId: string, orderedItemIds: string[]): Effect.Effect<number, SprintItemServiceError> {
    const stage = 'SprintItemService::reorderSprintItems'
    const tempBase = 1000000
    return pipe(
      validateInput(sprintId, 'sprintId', { stage }),
      Effect.flatMap(() => validateInput(orderedItemIds, 'orderedItemIds', { stage })),
      Effect.flatMap(() =>
        Effect.forEach(
          orderedItemIds,
          (id, index) =>
            this.sprintItemRepository.patchById(id, { position: tempBase + index } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(temp)', factory: XfErrorFactory.upsertFailed }))
            ),
          { concurrency: 1 }
        )
      ),
      Effect.flatMap(() =>
        Effect.forEach(
          orderedItemIds,
          (id, index) =>
            this.sprintItemRepository.patchById(id, { position: index } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(final)', factory: XfErrorFactory.upsertFailed }))
            ),
          { concurrency: 1 }
        )
      ),
      Effect.map(() => orderedItemIds.length),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in reorderSprintItems')
      }))
    )
  }

  closeSprintItem(id: string, closedAt?: Date): Effect.Effect<IbmSprintItem, SprintItemServiceError> {
    const stage = 'SprintItemService::closeSprintItem'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap(() =>
        this.updateSprintItem(id, { status: 'completed', closedAt: closedAt ?? new Date() })
      )
    )
  }

  removeSprintItem(id: string): Effect.Effect<void, SprintItemServiceError> {
    const stage = 'SprintItemService::removeSprintItem'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((itemId) =>
        this.sprintItemRepository.deleteById(itemId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
}
