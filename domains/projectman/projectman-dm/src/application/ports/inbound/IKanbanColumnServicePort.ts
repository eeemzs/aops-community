import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { KanbanColumnServiceError } from '../../errors/KanbanColumnServiceError.js'
import { IbmKanbanColumn, IbmKanbanColumnInsert } from '../../../domain/models/index.js'

export type KanbanColumnCreateInput = IbmKanbanColumnInsert

export interface IKanbanColumnServicePort {
  getById(id: string, options?: DbQueryOptions<IbmKanbanColumn>): Effect.Effect<IbmKanbanColumn | null, KanbanColumnServiceError>
  create(data: IbmKanbanColumnInsert): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError>
  createColumn(input: KanbanColumnCreateInput): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError>
  updateColumn(id: string, patch: Partial<IbmKanbanColumn>): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError>
  setColumnWipLimit(id: string, wipLimit?: number | null): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError>
  listColumns(filter?: Partial<IbmKanbanColumn>, options?: DbQueryOptions<IbmKanbanColumn>): Effect.Effect<IbmKanbanColumn[], KanbanColumnServiceError>
  removeColumn(id: string): Effect.Effect<void, KanbanColumnServiceError>
  //==> custom-methods
  //<==//
}

export interface IKanbanColumnLookupPort {
  getById(id: string): Effect.Effect<IbmKanbanColumn | null, KanbanColumnServiceError>
}
