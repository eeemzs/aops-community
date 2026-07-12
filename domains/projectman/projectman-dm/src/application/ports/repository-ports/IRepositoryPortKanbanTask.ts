import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmKanbanTask } from '../../../domain/models/index.js'
import { IdbKanbanTaskDrizzle } from '../../../infrastructure/db/kanbanTask/drizzle/drizzle.schema.kanbanTask.js'

/**
 * Repository port for KanbanTask
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortKanbanTask extends IRepositoryBaseCrud<IbmKanbanTask, IdbKanbanTaskDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here.
  //<==//
}
