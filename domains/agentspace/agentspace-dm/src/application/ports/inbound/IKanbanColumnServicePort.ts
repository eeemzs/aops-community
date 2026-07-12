import { Effect } from 'effect'
import { KanbanColumnServiceError } from '../../errors/KanbanColumnServiceError.js'
import { IbmKanbanColumn, IbmKanbanColumnInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export type KanbanColumnCreateInput = Omit<IbmKanbanColumnInsert, 'position'> & { position?: number }

export interface IKanbanColumnServicePort {
  getById(id: string, options?: DbQueryOptions<IbmKanbanColumn>): Effect.Effect<IbmKanbanColumn | null, KanbanColumnServiceError>
  create(data: IbmKanbanColumnInsert): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError>
  addColumn(data: KanbanColumnCreateInput): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError>
  updateColumn(id: string, patch: Partial<IbmKanbanColumn>): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError>
  setColumnWipLimit(id: string, wipLimit?: number | null): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError>
  listColumns(
    filter?: Partial<IbmKanbanColumn>,
    options?: DbQueryOptions<IbmKanbanColumn>
  ): Effect.Effect<IbmKanbanColumn[], KanbanColumnServiceError>
  reorderColumns(boardId: string, orderedColumnIds: string[]): Effect.Effect<number, KanbanColumnServiceError>
}

export interface IKanbanColumnLookupPort {
  getById(id: string): Effect.Effect<IbmKanbanColumn | null, KanbanColumnServiceError>
}
