import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmAssetVersion } from '../../../../domain/models/index.js'
import { IRepositoryPortAssetVersion } from '../../../../application/ports/repository-ports/index.js'
import { assetVersionTable, IdbAssetVersionDrizzle } from '../../../db/assetVersion/drizzle/drizzle.schema.assetVersion.js'
import { mapperAssetVersionDrizzle } from '../../../db/assetVersion/drizzle/drizzle.mapper.assetVersion.js'

export class AssetVersionDrizzleRepo
  extends DraBase<IbmAssetVersion, IdbAssetVersionDrizzle, typeof assetVersionTable>
  implements IRepositoryPortAssetVersion
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(assetVersionTable, { mapper: mapperAssetVersionDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
