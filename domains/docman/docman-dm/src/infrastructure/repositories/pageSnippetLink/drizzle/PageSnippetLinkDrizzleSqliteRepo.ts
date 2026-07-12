import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPageSnippetLink } from '../../../../domain/models/index.js'
import { IRepositoryPortPageSnippetLink } from '../../../../application/ports/repository-ports/index.js'
import { IdbPageSnippetLinkDrizzleSqlite, pageSnippetLinkTableSqlite } from '../../../db/pageSnippetLink/drizzle/drizzle.schema.pageSnippetLink.sqlite.js'
import { mapperPageSnippetLinkDrizzle } from '../../../db/pageSnippetLink/drizzle/drizzle.mapper.pageSnippetLink.js'

export class PageSnippetLinkDrizzleSqliteRepo
  extends DraBaseSqlite<IbmPageSnippetLink, IdbPageSnippetLinkDrizzleSqlite, typeof pageSnippetLinkTableSqlite>
  implements IRepositoryPortPageSnippetLink
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(pageSnippetLinkTableSqlite, { mapper: mapperPageSnippetLinkDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
