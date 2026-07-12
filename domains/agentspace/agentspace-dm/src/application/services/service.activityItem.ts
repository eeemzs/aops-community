import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import type { IRepositoryPortActivityItem, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import type { ActivityItemListFilter, IActivityItemServicePort } from '../ports/inbound/index.js'
import { ActivityItemServiceError } from '../errors/ActivityItemServiceError.js'
import { IbmActivityItem, IbmActivityItemInsert, activityItemZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

export interface ActivityItemServiceDependencies {}

export interface ActivityItemServiceOptions {
  activityItemRepository: IRepositoryPortActivityItem
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<ActivityItemServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class ActivityItemService implements IActivityItemServicePort {
  private readonly activityItemRepository: IRepositoryPortActivityItem
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: ActivityItemServiceOptions) {
    this.activityItemRepository = options.activityItemRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmActivityItem>): Effect.Effect<IbmActivityItem | null, ActivityItemServiceError> {
    const stage = 'ActivityItemService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((value) =>
        this.activityItemRepository.findById(value, options).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound })),
        ),
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      })),
    )
  }

  create(data: IbmActivityItemInsert): Effect.Effect<IbmActivityItem, ActivityItemServiceError> {
    const stage = 'ActivityItemService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((value) =>
        validateBmInputWithSchema({
          input: value,
          schema: activityItemZodSchemaInsert,
          stage,
          operation: 'ActivityItemService::create.activityItemZodSchemaInsert',
          field: 'data',
        }),
      ),
      Effect.flatMap((value) =>
        this.activityItemRepository.create(value).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed })),
        ),
      ),
    )
  }

  addActivityItem(data: IbmActivityItemInsert): Effect.Effect<IbmActivityItem, ActivityItemServiceError> {
    return this.create(data)
  }

  listActivityItems(
    filter: ActivityItemListFilter = {},
    options?: DbQueryOptions<IbmActivityItem>,
  ): Effect.Effect<IbmActivityItem[], ActivityItemServiceError> {
    const stage = 'ActivityItemService::listActivityItems'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) =>
        listRecordsByScopeResolution(
          this.activityItemRepository as any,
          this.scopeRepository,
          value as Record<string, unknown> & ActivityItemListFilter,
          options,
          {
            stage,
            defaultResolution: 'explicit',
          },
        ).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound })),
        ),
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listActivityItems')
      })),
    )
  }
}
