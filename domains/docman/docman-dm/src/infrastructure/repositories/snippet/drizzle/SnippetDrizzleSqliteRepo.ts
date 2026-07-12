import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSnippet } from '../../../../domain/models/index.js'
import { IRepositoryPortSnippet } from '../../../../application/ports/repository-ports/index.js'
import { IdbSnippetDrizzleSqlite, snippetTableSqlite } from '../../../db/snippet/drizzle/drizzle.schema.snippet.sqlite.js'
import { mapperSnippetDrizzle } from '../../../db/snippet/drizzle/drizzle.mapper.snippet.js'

export class SnippetDrizzleSqliteRepo
  extends DraBaseSqlite<IbmSnippet, IdbSnippetDrizzleSqlite, typeof snippetTableSqlite>
  implements IRepositoryPortSnippet
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(snippetTableSqlite, { mapper: mapperSnippetDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
