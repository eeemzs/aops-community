import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { AssetVersionServiceError } from '../../errors/AssetVersionServiceError.js'
import { IbmAssetVersion, IbmAssetVersionInsert, IbmAssetVersionPatch } from '../../../domain/models/index.js'

export interface IAssetVersionServicePort {
  getById(id: string, options?: DbQueryOptions<IbmAssetVersion>): Effect.Effect<IbmAssetVersion | null, AssetVersionServiceError>
  create(data: IbmAssetVersionInsert): Effect.Effect<IbmAssetVersion, AssetVersionServiceError>
  listAssetVersions(
    filter?: Partial<IbmAssetVersion>,
    options?: DbQueryOptions<IbmAssetVersion>,
  ): Effect.Effect<IbmAssetVersion[], AssetVersionServiceError>
  updateAssetVersion(id: string, patch: IbmAssetVersionPatch): Effect.Effect<IbmAssetVersion, AssetVersionServiceError>
  removeAssetVersion(id: string): Effect.Effect<void, AssetVersionServiceError>
}

export interface IAssetVersionLookupPort {
  getById(id: string): Effect.Effect<IbmAssetVersion | null, AssetVersionServiceError>
}
