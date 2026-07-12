import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmKanbanColumn } from '../../../domain/models/index.js'
import { IdbKanbanColumnDrizzle } from '../../../infrastructure/db/kanbanColumn/drizzle/drizzle.schema.kanbanColumn.js'

/**
 * Repository port for KanbanColumn
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortKanbanColumn extends IRepositoryBaseCrud<IbmKanbanColumn, IdbKanbanColumnDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmKanbanColumn>): import('effect').Effect<IbmKanbanColumn | null, RepositoryError>
  //<==//
}
