import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmAsset } from '../../../domain/models/index.js'
import { IdbAssetDrizzle } from '../../../infrastructure/db/asset/drizzle/drizzle.schema.asset.js'

export interface IRepositoryPortAsset extends IRepositoryBaseCrud<IbmAsset, IdbAssetDrizzle, RepositoryError> {}
