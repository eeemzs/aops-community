import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmAssetVersion } from '../../../../domain/models/index.js'
import { IRepositoryPortAssetVersion } from '../../../../application/ports/repository-ports/index.js'
import {
  assetVersionTableSqlite,
  IdbAssetVersionDrizzleSqlite,
} from '../../../db/assetVersion/drizzle/drizzle.schema.assetVersion.sqlite.js'
import { mapperAssetVersionDrizzle } from '../../../db/assetVersion/drizzle/drizzle.mapper.assetVersion.js'

export class AssetVersionDrizzleSqliteRepo
  extends DraBaseSqlite<IbmAssetVersion, IdbAssetVersionDrizzleSqlite, typeof assetVersionTableSqlite>
  implements IRepositoryPortAssetVersion
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(assetVersionTableSqlite, {
      mapper: mapperAssetVersionDrizzle as any,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
