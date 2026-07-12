import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPage } from '../../../../domain/models/index.js'
import { IRepositoryPortPage } from '../../../../application/ports/repository-ports/index.js'
import { IdbPageDrizzleSqlite, pageTableSqlite } from '../../../db/page/drizzle/drizzle.schema.page.sqlite.js'
import { mapperPageDrizzle } from '../../../db/page/drizzle/drizzle.mapper.page.js'

export class PageDrizzleSqliteRepo
  extends DraBaseSqlite<IbmPage, IdbPageDrizzleSqlite, typeof pageTableSqlite>
  implements IRepositoryPortPage
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(pageTableSqlite, { mapper: mapperPageDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
