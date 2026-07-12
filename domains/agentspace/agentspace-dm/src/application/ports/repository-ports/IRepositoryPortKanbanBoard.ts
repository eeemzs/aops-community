import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmKanbanBoard } from '../../../domain/models/index.js'
import { IdbKanbanBoardDrizzle } from '../../../infrastructure/db/kanbanBoard/drizzle/drizzle.schema.kanbanBoard.js'

/**
 * Repository port for KanbanBoard
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortKanbanBoard extends IRepositoryPortBaseCrud<IbmKanbanBoard, IdbKanbanBoardDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmKanbanBoard>): import('effect').Effect<IbmKanbanBoard | null, RepositoryError>
  //<==//
}


