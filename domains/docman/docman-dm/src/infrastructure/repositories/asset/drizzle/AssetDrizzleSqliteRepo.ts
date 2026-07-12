import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmAsset } from '../../../../domain/models/index.js'
import { IRepositoryPortAsset } from '../../../../application/ports/repository-ports/index.js'
import { IdbAssetDrizzleSqlite, assetTableSqlite } from '../../../db/asset/drizzle/drizzle.schema.asset.sqlite.js'
import { mapperAssetDrizzle } from '../../../db/asset/drizzle/drizzle.mapper.asset.js'

export class AssetDrizzleSqliteRepo
  extends DraBaseSqlite<IbmAsset, IdbAssetDrizzleSqlite, typeof assetTableSqlite>
  implements IRepositoryPortAsset
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(assetTableSqlite, { mapper: mapperAssetDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
