import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { KanbanBoardServiceError } from '../../errors/KanbanBoardServiceError.js'
import { IbmKanbanBoard, IbmKanbanBoardInsert } from '../../../domain/models/index.js'
export type KanbanBoardCreateInput = Omit<IbmKanbanBoardInsert, 'position'> & {
  position?: number
}

export interface IKanbanBoardServicePort {
  getById(id: string, options?: DbQueryOptions<IbmKanbanBoard>): Effect.Effect<IbmKanbanBoard | null, KanbanBoardServiceError>
  create(data: IbmKanbanBoardInsert): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError>
  createBoard(input: KanbanBoardCreateInput): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError>
  updateBoard(id: string, patch: Partial<IbmKanbanBoard>): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError>
  archiveBoard(id: string): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError>
  unarchiveBoard(id: string): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError>
  listBoards(filter?: Partial<IbmKanbanBoard>, options?: DbQueryOptions<IbmKanbanBoard>, listOptions?: { includeArchived?: boolean }): Effect.Effect<IbmKanbanBoard[], KanbanBoardServiceError>
  reorderBoards(orderedBoardIds: string[]): Effect.Effect<number, KanbanBoardServiceError>
  removeBoard(id: string): Effect.Effect<void, KanbanBoardServiceError>
  //==> custom-methods
  //<==//
}

export interface IKanbanBoardLookupPort {
  getById(id: string): Effect.Effect<IbmKanbanBoard | null, KanbanBoardServiceError>
}
