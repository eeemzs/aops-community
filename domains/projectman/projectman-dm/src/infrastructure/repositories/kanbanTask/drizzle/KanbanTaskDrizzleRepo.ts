import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmKanbanTask } from '../../../../domain/models/index.js'
import { IRepositoryPortKanbanTask } from '../../../../application/ports/repository-ports/index.js'
import { IdbKanbanTaskDrizzle, kanbanTaskTable } from '../../../db/kanbanTask/drizzle/drizzle.schema.kanbanTask.js'
import { mapperKanbanTaskDrizzle } from '../../../db/kanbanTask/drizzle/drizzle.mapper.kanbanTask.js'

export class KanbanTaskDrizzleRepo extends DraBase<IbmKanbanTask, IdbKanbanTaskDrizzle, typeof kanbanTaskTable> implements IRepositoryPortKanbanTask {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(kanbanTaskTable, { mapper: mapperKanbanTaskDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here.
  //<==//
}
