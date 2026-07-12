import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { KanbanBoardColumnServiceError } from '../../errors/KanbanBoardColumnServiceError.js'
import { IbmKanbanBoardColumn, IbmKanbanBoardColumnInsert } from '../../../domain/models/index.js'

export type KanbanBoardColumnCreateInput = Omit<IbmKanbanBoardColumnInsert, 'position'> & {
  position?: number
}

export interface IKanbanBoardColumnServicePort {
  getById(id: string, options?: DbQueryOptions<IbmKanbanBoardColumn>): Effect.Effect<IbmKanbanBoardColumn | null, KanbanBoardColumnServiceError>
  create(data: IbmKanbanBoardColumnInsert): Effect.Effect<IbmKanbanBoardColumn, KanbanBoardColumnServiceError>
  addColumnToBoard(input: KanbanBoardColumnCreateInput): Effect.Effect<IbmKanbanBoardColumn, KanbanBoardColumnServiceError>
  updateBoardColumn(id: string, patch: Partial<IbmKanbanBoardColumn>): Effect.Effect<IbmKanbanBoardColumn, KanbanBoardColumnServiceError>
  listBoardColumns(filter?: Partial<IbmKanbanBoardColumn>, options?: DbQueryOptions<IbmKanbanBoardColumn>): Effect.Effect<IbmKanbanBoardColumn[], KanbanBoardColumnServiceError>
  reorderBoardColumns(boardId: string, orderedColumnIds: string[]): Effect.Effect<number, KanbanBoardColumnServiceError>
  removeBoardColumn(id: string): Effect.Effect<void, KanbanBoardColumnServiceError>
  //==> custom-methods
  //<==//
}

export interface IKanbanBoardColumnLookupPort {
  getById(id: string): Effect.Effect<IbmKanbanBoardColumn | null, KanbanBoardColumnServiceError>
}
