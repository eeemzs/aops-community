import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { XfLogger } from '@aopslab/xf-logger'

import type { IRepositoryPortExperienceItem, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import type { ExperienceItemListFilter, IExperienceItemServicePort } from '../ports/inbound/index.js'
import { ExperienceItemServiceError } from '../errors/ExperienceItemServiceError.js'
import { IbmExperienceItem, IbmExperienceItemInsert, experienceItemZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

export interface ExperienceItemServiceDependencies {}

export interface ExperienceItemServiceOptions {
  experienceItemRepository: IRepositoryPortExperienceItem
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<ExperienceItemServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class ExperienceItemService implements IExperienceItemServicePort {
  private readonly experienceItemRepository: IRepositoryPortExperienceItem
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: ExperienceItemServiceOptions) {
    this.experienceItemRepository = options.experienceItemRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmExperienceItem>): Effect.Effect<IbmExperienceItem | null, ExperienceItemServiceError> {
    const stage = 'ExperienceItemService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entryId) => this.experienceItemRepository.findById(entryId, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound })),
      )),
      Effect.tapError((error) => Effect.sync(() => {
        const info = effectErrorInfo(error)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      })),
    )
  }

  create(data: IbmExperienceItemInsert): Effect.Effect<IbmExperienceItem, ExperienceItemServiceError> {
    const stage = 'ExperienceItemService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) =>
        validateBmInputWithSchema({
          input: payload,
          schema: experienceItemZodSchemaInsert,
          stage,
          operation: 'ExperienceItemService::create.experienceItemZodSchemaInsert',
          field: 'data',
        }),
      ),
      Effect.flatMap((payload) => this.experienceItemRepository.create(payload).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed })),
      )),
    )
  }

  getExperienceItem(id: string, options?: DbQueryOptions<IbmExperienceItem>): Effect.Effect<IbmExperienceItem | null, ExperienceItemServiceError> {
    return this.getById(id, options)
  }

  addExperienceItem(data: IbmExperienceItemInsert): Effect.Effect<IbmExperienceItem, ExperienceItemServiceError> {
    const stage = 'ExperienceItemService::addExperienceItem'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((payload) =>
        validateBmInputWithSchema({
          input: payload,
          schema: experienceItemZodSchemaInsert,
          stage,
          operation: 'ExperienceItemService::addExperienceItem.experienceItemZodSchemaInsert',
          field: 'data',
        }),
      ),
      Effect.flatMap((payload) => this.create(payload)),
      Effect.tapError((error) => Effect.sync(() => {
        const info = effectErrorInfo(error)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in addExperienceItem')
      })),
    )
  }

  updateExperienceItem(id: string, patch: Partial<IbmExperienceItem>): Effect.Effect<IbmExperienceItem, ExperienceItemServiceError> {
    const stage = 'ExperienceItemService::updateExperienceItem'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entryId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: experienceItemZodSchemaInsert.partial().strict(),
          stage,
          operation: 'ExperienceItemService::updateExperienceItem.experienceItemZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(Effect.map(() => entryId)),
      ),
      Effect.flatMap((entryId) =>
        this.experienceItemRepository.patchById(entryId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed })),
        ),
      ),
      Effect.tapError((error) => Effect.sync(() => {
        const info = effectErrorInfo(error)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateExperienceItem')
      })),
    )
  }

  listExperienceItems(
    filter: ExperienceItemListFilter = {},
    options?: DbQueryOptions<IbmExperienceItem>,
  ): Effect.Effect<IbmExperienceItem[], ExperienceItemServiceError> {
    const stage = 'ExperienceItemService::listExperienceItems'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) => listRecordsByScopeResolution(this.experienceItemRepository as any, this.scopeRepository, value, options, {
        stage,
        defaultResolution: 'cascade',
        dedupeKey: (item) => String(item?.title ?? '').trim().toLowerCase() || undefined,
      }).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound })),
      )),
      Effect.tapError((error) => Effect.sync(() => {
        const info = effectErrorInfo(error)
        if ((info.unwrapped as { _tag?: string } | undefined)?._tag === 'NotFoundError') return
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listExperienceItems')
      })),
    )
  }

  removeExperienceItem(id: string): Effect.Effect<void, ExperienceItemServiceError> {
    const stage = 'ExperienceItemService::removeExperienceItem'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entryId) =>
        this.experienceItemRepository.deleteById(entryId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed })),
        ),
      ),
      Effect.map(() => undefined),
    )
  }
}
