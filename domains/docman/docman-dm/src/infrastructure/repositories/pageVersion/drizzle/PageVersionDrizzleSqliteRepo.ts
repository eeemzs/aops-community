import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPageVersion } from '../../../../domain/models/index.js'
import { IRepositoryPortPageVersion } from '../../../../application/ports/repository-ports/index.js'
import { IdbPageVersionDrizzleSqlite, pageVersionTableSqlite } from '../../../db/pageVersion/drizzle/drizzle.schema.pageVersion.sqlite.js'
import { mapperPageVersionDrizzle } from '../../../db/pageVersion/drizzle/drizzle.mapper.pageVersion.js'

export class PageVersionDrizzleSqliteRepo
  extends DraBaseSqlite<IbmPageVersion, IdbPageVersionDrizzleSqlite, typeof pageVersionTableSqlite>
  implements IRepositoryPortPageVersion
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(pageVersionTableSqlite, { mapper: mapperPageVersionDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
