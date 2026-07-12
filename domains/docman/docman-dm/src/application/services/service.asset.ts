import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import type { IRepositoryPortAsset } from '../ports/repository-ports/index.js'
import type { IAssetServicePort } from '../ports/inbound/index.js'
import { AssetServiceError } from '../errors/AssetServiceError.js'
import { IbmAsset, IbmAssetInsert, assetZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'

export interface AssetServiceDependencies {}

export interface AssetServiceOptions {
  assetRepository: IRepositoryPortAsset
  serviceDependencies?: Partial<AssetServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class AssetService implements IAssetServicePort {
  private readonly assetRepository: IRepositoryPortAsset
  private readonly logger?: XfLogger

  constructor(options: AssetServiceOptions) {
    this.assetRepository = options.assetRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmAsset>): Effect.Effect<IbmAsset | null, AssetServiceError> {
    const stage = 'AssetService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) => this.assetRepository.findById(entityId, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      })),
    )
  }

  create(data: IbmAssetInsert): Effect.Effect<IbmAsset, AssetServiceError> {
    const stage = 'AssetService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input) =>
        validateBmInputWithSchema({
          input,
          schema: assetZodSchemaInsert,
          stage,
          operation: 'AssetService::create.assetZodSchemaInsert',
          field: 'data',
        }),
      ),
      Effect.flatMap((input) => this.assetRepository.create(input).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      )),
    )
  }

  listAssets(filter: Partial<IbmAsset> = {}, options?: DbQueryOptions<IbmAsset>): Effect.Effect<IbmAsset[], AssetServiceError> {
    const stage = 'AssetService::listAssets'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((matchEq) => this.assetRepository.find({ matchEq, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listAssets')
      })),
    )
  }

  updateAsset(id: string, patch: Partial<IbmAsset>): Effect.Effect<IbmAsset, AssetServiceError> {
    const stage = 'AssetService::updateAsset'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: assetZodSchemaInsert.partial().strict(),
          stage,
          operation: 'AssetService::updateAsset.assetZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(Effect.map(() => entityId)),
      ),
      Effect.flatMap((entityId) =>
        this.assetRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateAsset')
      })),
    )
  }

  removeAsset(id: string): Effect.Effect<void, AssetServiceError> {
    const stage = 'AssetService::removeAsset'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        this.assetRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined),
    )
  }
}
