import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmAsset } from '../../../../domain/models/index.js'
import { IRepositoryPortAsset } from '../../../../application/ports/repository-ports/index.js'
import { IdbAssetDrizzle, assetTable } from '../../../db/asset/drizzle/drizzle.schema.asset.js'
import { mapperAssetDrizzle } from '../../../db/asset/drizzle/drizzle.mapper.asset.js'

export class AssetDrizzleRepo extends DraBase<IbmAsset, IdbAssetDrizzle, typeof assetTable> implements IRepositoryPortAsset {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(assetTable, { mapper: mapperAssetDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
