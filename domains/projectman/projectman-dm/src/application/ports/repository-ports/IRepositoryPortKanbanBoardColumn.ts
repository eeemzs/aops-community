import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmKanbanBoardColumn } from '../../../domain/models/index.js'
import { IdbKanbanBoardColumnDrizzle } from '../../../infrastructure/db/kanbanBoardColumn/drizzle/drizzle.schema.kanbanBoardColumn.js'

/**
 * Repository port for KanbanBoardColumn
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortKanbanBoardColumn extends IRepositoryBaseCrud<IbmKanbanBoardColumn, IdbKanbanBoardColumnDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmKanbanBoardColumn>): import('effect').Effect<IbmKanbanBoardColumn | null, RepositoryError>
  //<==//
}
