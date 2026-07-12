import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { AssetServiceError } from '../../errors/AssetServiceError.js'
import { IbmAsset, IbmAssetInsert } from '../../../domain/models/index.js'

export interface IAssetServicePort {
  getById(id: string, options?: DbQueryOptions<IbmAsset>): Effect.Effect<IbmAsset | null, AssetServiceError>
  create(data: IbmAssetInsert): Effect.Effect<IbmAsset, AssetServiceError>
  listAssets(filter?: Partial<IbmAsset>, options?: DbQueryOptions<IbmAsset>): Effect.Effect<IbmAsset[], AssetServiceError>
  updateAsset(id: string, patch: Partial<IbmAsset>): Effect.Effect<IbmAsset, AssetServiceError>
  removeAsset(id: string): Effect.Effect<void, AssetServiceError>
}

export interface IAssetLookupPort {
  getById(id: string): Effect.Effect<IbmAsset | null, AssetServiceError>
}
