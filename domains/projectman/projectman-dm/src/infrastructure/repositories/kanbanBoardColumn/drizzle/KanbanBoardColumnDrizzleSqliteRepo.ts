import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmKanbanBoardColumn } from '../../../../domain/models/index.js'
import { IRepositoryPortKanbanBoardColumn } from '../../../../application/ports/repository-ports/index.js'
import { IdbKanbanBoardColumnDrizzleSqlite, kanbanBoardColumnTableSqlite } from '../../../db/kanbanBoardColumn/drizzle/drizzle.schema.kanbanBoardColumn.sqlite.js'
import { mapperKanbanBoardColumnDrizzle } from '../../../db/kanbanBoardColumn/drizzle/drizzle.mapper.kanbanBoardColumn.js'

export class KanbanBoardColumnDrizzleSqliteRepo
  extends DraBaseSqlite<IbmKanbanBoardColumn, IdbKanbanBoardColumnDrizzleSqlite, typeof kanbanBoardColumnTableSqlite>
  implements IRepositoryPortKanbanBoardColumn
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(kanbanBoardColumnTableSqlite, { mapper: mapperKanbanBoardColumnDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
