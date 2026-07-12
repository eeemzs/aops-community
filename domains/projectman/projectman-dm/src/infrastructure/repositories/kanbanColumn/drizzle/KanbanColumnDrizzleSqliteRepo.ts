import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmKanbanColumn } from '../../../../domain/models/index.js'
import { IRepositoryPortKanbanColumn } from '../../../../application/ports/repository-ports/index.js'
import { IdbKanbanColumnDrizzleSqlite, kanbanColumnTableSqlite } from '../../../db/kanbanColumn/drizzle/drizzle.schema.kanbanColumn.sqlite.js'
import { mapperKanbanColumnDrizzle } from '../../../db/kanbanColumn/drizzle/drizzle.mapper.kanbanColumn.js'

export class KanbanColumnDrizzleSqliteRepo
  extends DraBaseSqlite<IbmKanbanColumn, IdbKanbanColumnDrizzleSqlite, typeof kanbanColumnTableSqlite>
  implements IRepositoryPortKanbanColumn
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(kanbanColumnTableSqlite, { mapper: mapperKanbanColumnDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
