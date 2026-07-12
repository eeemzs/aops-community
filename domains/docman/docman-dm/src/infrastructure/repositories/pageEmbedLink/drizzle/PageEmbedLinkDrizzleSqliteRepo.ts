import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPageEmbedLink } from '../../../../domain/models/index.js'
import { IRepositoryPortPageEmbedLink } from '../../../../application/ports/repository-ports/index.js'
import { IdbPageEmbedLinkDrizzleSqlite, pageEmbedLinkTableSqlite } from '../../../db/pageEmbedLink/drizzle/drizzle.schema.pageEmbedLink.sqlite.js'
import { mapperPageEmbedLinkDrizzle } from '../../../db/pageEmbedLink/drizzle/drizzle.mapper.pageEmbedLink.js'

export class PageEmbedLinkDrizzleSqliteRepo
  extends DraBaseSqlite<IbmPageEmbedLink, IdbPageEmbedLinkDrizzleSqlite, typeof pageEmbedLinkTableSqlite>
  implements IRepositoryPortPageEmbedLink
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(pageEmbedLinkTableSqlite, { mapper: mapperPageEmbedLinkDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
