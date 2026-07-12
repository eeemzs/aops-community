import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmKanbanTask } from '../../../../domain/models/index.js'
import { IRepositoryPortKanbanTask } from '../../../../application/ports/repository-ports/index.js'
import { IdbKanbanTaskDrizzleSqlite, kanbanTaskTableSqlite } from '../../../db/kanbanTask/drizzle/drizzle.schema.kanbanTask.sqlite.js'
import { mapperKanbanTaskDrizzle } from '../../../db/kanbanTask/drizzle/drizzle.mapper.kanbanTask.js'

export class KanbanTaskDrizzleSqliteRepo
  extends DraBaseSqlite<IbmKanbanTask, IdbKanbanTaskDrizzleSqlite, typeof kanbanTaskTableSqlite>
  implements IRepositoryPortKanbanTask
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(kanbanTaskTableSqlite, { mapper: mapperKanbanTaskDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
