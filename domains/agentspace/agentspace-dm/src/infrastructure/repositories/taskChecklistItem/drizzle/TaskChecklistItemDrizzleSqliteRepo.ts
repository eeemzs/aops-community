import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'
import { IbmTaskChecklistItem } from '../../../../domain/models/index.js'
import { IRepositoryPortTaskChecklistItem } from '../../../../application/ports/repository-ports/IRepositoryPortTaskChecklistItem.js'
import { IdbTaskChecklistItemDrizzleSqlite, taskChecklistItemTableSqlite } from '../../../db/taskChecklistItem/drizzle/drizzle.schema.taskChecklistItem.sqlite.js'
import { mapperTaskChecklistItemDrizzle } from '../../../db/taskChecklistItem/drizzle/drizzle.mapper.taskChecklistItem.js'

export class TaskChecklistItemDrizzleSqliteRepo
  extends DraBaseSqlite<IbmTaskChecklistItem, IdbTaskChecklistItemDrizzleSqlite, typeof taskChecklistItemTableSqlite>
  implements IRepositoryPortTaskChecklistItem {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(taskChecklistItemTableSqlite, { mapper: mapperTaskChecklistItemDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
