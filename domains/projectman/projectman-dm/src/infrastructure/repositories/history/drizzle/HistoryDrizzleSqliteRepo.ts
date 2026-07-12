import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmHistory } from '../../../../domain/models/index.js'
import { IRepositoryPortHistory } from '../../../../application/ports/repository-ports/index.js'
import { IdbHistoryDrizzleSqlite, historyTableSqlite } from '../../../db/history/drizzle/drizzle.schema.history.sqlite.js'
import { mapperHistoryDrizzle } from '../../../db/history/drizzle/drizzle.mapper.history.js'

export class HistoryDrizzleSqliteRepo
  extends DraBaseSqlite<IbmHistory, IdbHistoryDrizzleSqlite, typeof historyTableSqlite>
  implements IRepositoryPortHistory
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(historyTableSqlite, { mapper: mapperHistoryDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
