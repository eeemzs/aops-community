import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmIssueItem } from '../../../../domain/models/index.js'
import { IRepositoryPortIssueItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbIssueItemDrizzleSqlite, issueItemTableSqlite } from '../../../db/issueItem/drizzle/drizzle.schema.issueItem.sqlite.js'
import { mapperIssueItemDrizzle } from '../../../db/issueItem/drizzle/drizzle.mapper.issueItem.js'

export class IssueItemDrizzleSqliteRepo
  extends DraBaseSqlite<IbmIssueItem, IdbIssueItemDrizzleSqlite, typeof issueItemTableSqlite>
  implements IRepositoryPortIssueItem
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(issueItemTableSqlite, { mapper: mapperIssueItemDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
