import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'
import { IbmTaskChecklistItem } from '../../../../domain/models/index.js'
import { IRepositoryPortTaskChecklistItem } from '../../../../application/ports/repository-ports/IRepositoryPortTaskChecklistItem.js'
import { IdbTaskChecklistItemDrizzle, taskChecklistItemTable } from '../../../db/taskChecklistItem/drizzle/drizzle.schema.taskChecklistItem.js'
import { mapperTaskChecklistItemDrizzle } from '../../../db/taskChecklistItem/drizzle/drizzle.mapper.taskChecklistItem.js'

export class TaskChecklistItemDrizzleRepo
  extends DraBase<IbmTaskChecklistItem, IdbTaskChecklistItemDrizzle, typeof taskChecklistItemTable>
  implements IRepositoryPortTaskChecklistItem {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(taskChecklistItemTable, { mapper: mapperTaskChecklistItemDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
