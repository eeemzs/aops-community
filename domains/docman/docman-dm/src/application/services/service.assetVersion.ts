import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import type { IRepositoryPortAssetVersion } from '../ports/repository-ports/index.js'
import type { IAssetVersionServicePort } from '../ports/inbound/index.js'
import { AssetVersionServiceError } from '../errors/AssetVersionServiceError.js'
import {
  assetVersionMutablePatchZodSchema,
  assetVersionZodSchemaInsert,
  IbmAssetVersion,
  IbmAssetVersionInsert,
  IbmAssetVersionPatch,
} from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'

export interface AssetVersionServiceDependencies {}

export interface AssetVersionServiceOptions {
  assetVersionRepository: IRepositoryPortAssetVersion
  serviceDependencies?: Partial<AssetVersionServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class AssetVersionService implements IAssetVersionServicePort {
  private readonly assetVersionRepository: IRepositoryPortAssetVersion
  private readonly logger?: XfLogger

  constructor(options: AssetVersionServiceOptions) {
    this.assetVersionRepository = options.assetVersionRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmAssetVersion>): Effect.Effect<IbmAssetVersion | null, AssetVersionServiceError> {
    const stage = 'AssetVersionService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) => this.assetVersionRepository.findById(entityId, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      })),
    )
  }

  create(data: IbmAssetVersionInsert): Effect.Effect<IbmAssetVersion, AssetVersionServiceError> {
    const stage = 'AssetVersionService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((input) =>
        validateBmInputWithSchema({
          input,
          schema: assetVersionZodSchemaInsert,
          stage,
          operation: 'AssetVersionService::create.assetVersionZodSchemaInsert',
          field: 'data',
        }),
      ),
      Effect.flatMap((input) => this.assetVersionRepository.create(input).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      )),
    )
  }

  listAssetVersions(
    filter: Partial<IbmAssetVersion> = {},
    options?: DbQueryOptions<IbmAssetVersion>,
  ): Effect.Effect<IbmAssetVersion[], AssetVersionServiceError> {
    const stage = 'AssetVersionService::listAssetVersions'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((matchEq) => this.assetVersionRepository.find({ matchEq, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listAssetVersions')
      })),
    )
  }

  updateAssetVersion(id: string, patch: IbmAssetVersionPatch): Effect.Effect<IbmAssetVersion, AssetVersionServiceError> {
    const stage = 'AssetVersionService::updateAssetVersion'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: assetVersionMutablePatchZodSchema,
          stage,
          operation: 'AssetVersionService::updateAssetVersion.assetVersionMutablePatchZodSchema',
          field: 'patch',
        }).pipe(Effect.map(() => entityId)),
      ),
      Effect.flatMap((entityId) =>
        this.assetVersionRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateAssetVersion')
      })),
    )
  }

  removeAssetVersion(id: string): Effect.Effect<void, AssetVersionServiceError> {
    const stage = 'AssetVersionService::removeAssetVersion'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        this.assetVersionRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined),
    )
  }
}
