import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortResource, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import type { IResourceServicePort, ResourceListFilter } from '../ports/inbound/index.js'
import { ResourceServiceError } from '../errors/ResourceServiceError.js'
import { IbmResource, IbmResourceInsert, resourceZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

export interface ResourceServiceDependencies {}

export interface ResourceServiceOptions {
  resourceRepository: IRepositoryPortResource
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<ResourceServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class ResourceService implements IResourceServicePort {
  private readonly resourceRepository: IRepositoryPortResource
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: ResourceServiceOptions) {
    this.resourceRepository = options.resourceRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmResource>): Effect.Effect<IbmResource | null, ResourceServiceError> {
    const stage = 'ResourceService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.resourceRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmResourceInsert): Effect.Effect<IbmResource, ResourceServiceError> {
    const stage = 'ResourceService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: resourceZodSchemaInsert,
          stage,
          operation: 'ResourceService::create.resourceZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.resourceRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  getResource(id: string, options?: DbQueryOptions<IbmResource>): Effect.Effect<IbmResource | null, ResourceServiceError> {
    return this.getById(id, options)
  }

  createResource(data: IbmResourceInsert): Effect.Effect<IbmResource, ResourceServiceError> {
    const stage = 'ResourceService::createResource'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: resourceZodSchemaInsert,
          stage,
          operation: 'ResourceService::createResource.resourceZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((payload) => this.create(payload)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in createResource')
      }))
    )
  }

  updateResource(id: string, patch: Partial<IbmResource>): Effect.Effect<IbmResource, ResourceServiceError> {
    const stage = 'ResourceService::updateResource'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: resourceZodSchemaInsert.partial().strict(),
          stage,
          operation: 'ResourceService::updateResource.resourceZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((resourceId) =>
        this.resourceRepository.patchById(resourceId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateResource')
      }))
    )
  }

  listResources(
    filter: ResourceListFilter = {},
    options?: DbQueryOptions<IbmResource>
  ): Effect.Effect<IbmResource[], ResourceServiceError> {
    const stage = 'ResourceService::listResources'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) => listRecordsByScopeResolution(this.resourceRepository as any, this.scopeRepository, value, options, {
        stage,
        defaultResolution: 'cascade',
        dedupeKey: (item) => String(item?.name ?? '').trim().toLowerCase() || undefined,
      }).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        if ((info.unwrapped as { _tag?: string } | undefined)?._tag === 'NotFoundError') return
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listResources')
      }))
    )
  }

  removeResource(id: string): Effect.Effect<void, ResourceServiceError> {
    const stage = 'ResourceService::removeResource'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((resourceId) =>
        this.resourceRepository.deleteById(resourceId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
}
