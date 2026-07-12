import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmAssetVersion } from '../../../domain/models/index.js'
import { IdbAssetVersionDrizzle } from '../../../infrastructure/db/assetVersion/drizzle/drizzle.schema.assetVersion.js'

export interface IRepositoryPortAssetVersion extends IRepositoryBaseCrud<IbmAssetVersion, IdbAssetVersionDrizzle, RepositoryError> {}
