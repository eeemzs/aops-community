import { Effect } from 'effect'
import { KanbanBoardServiceError } from '../../errors/KanbanBoardServiceError.js'
import { IbmKanbanBoard, IbmKanbanBoardInsert, IbmKanbanColumn, IbmTask } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { KanbanColumnCreateInput } from './IKanbanColumnServicePort.js'

export type KanbanBoardColumn = IbmKanbanColumn & { tasks: IbmTask[] }

export type KanbanBoardView = {
  board: IbmKanbanBoard
  columns: KanbanBoardColumn[]
}

export interface IKanbanBoardServicePort {
  getById(id: string, options?: DbQueryOptions<IbmKanbanBoard>): Effect.Effect<IbmKanbanBoard | null, KanbanBoardServiceError>
  create(data: IbmKanbanBoardInsert): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError>
  createBoard(data: IbmKanbanBoardInsert): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError>
  updateBoard(id: string, patch: Partial<IbmKanbanBoard>): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError>
  ensureDefaultBoard(projectId: string): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError>
  listBoards(filter?: Partial<IbmKanbanBoard>, options?: DbQueryOptions<IbmKanbanBoard>): Effect.Effect<IbmKanbanBoard[], KanbanBoardServiceError>
  listBoard(boardId: string): Effect.Effect<KanbanBoardView, KanbanBoardServiceError>
  addColumn(data: KanbanColumnCreateInput): Effect.Effect<IbmKanbanColumn, KanbanBoardServiceError>
  updateColumn(id: string, patch: Partial<IbmKanbanColumn>): Effect.Effect<IbmKanbanColumn, KanbanBoardServiceError>
  setColumnWipLimit(id: string, wipLimit?: number | null): Effect.Effect<IbmKanbanColumn, KanbanBoardServiceError>
  reorderColumns(boardId: string, orderedColumnIds: string[]): Effect.Effect<number, KanbanBoardServiceError>
  moveTaskToColumn(taskId: string, toColumnId: string, toPosition?: number): Effect.Effect<IbmTask, KanbanBoardServiceError>
  reorderTasksInColumn(columnId: string, orderedTaskIds: string[]): Effect.Effect<number, KanbanBoardServiceError>
}

export interface IKanbanBoardLookupPort {
  getById(id: string): Effect.Effect<IbmKanbanBoard | null, KanbanBoardServiceError>
}
