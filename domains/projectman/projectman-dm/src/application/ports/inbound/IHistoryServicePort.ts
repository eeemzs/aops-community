import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { HistoryServiceError } from '../../errors/HistoryServiceError.js'
import { IbmHistory, IbmHistoryInsert } from '../../../domain/models/index.js'

export type HistoryCreateInput = Omit<IbmHistoryInsert, 'status' | 'slug'> & {
  status?: IbmHistoryInsert['status']
  slug?: IbmHistoryInsert['slug']
}

export interface IHistoryServicePort {
  getById(id: string, options?: DbQueryOptions<IbmHistory>): Effect.Effect<IbmHistory | null, HistoryServiceError>
  create(data: IbmHistoryInsert): Effect.Effect<IbmHistory, HistoryServiceError>
  createHistory(input: HistoryCreateInput): Effect.Effect<IbmHistory, HistoryServiceError>
  updateHistory(id: string, patch: Partial<IbmHistory>): Effect.Effect<IbmHistory, HistoryServiceError>
  listHistories(filter?: Partial<IbmHistory>, options?: DbQueryOptions<IbmHistory>): Effect.Effect<IbmHistory[], HistoryServiceError>
  removeHistory(id: string): Effect.Effect<void, HistoryServiceError>
  //==> custom-methods
  //<==//
}

export interface IHistoryLookupPort {
  getById(id: string): Effect.Effect<IbmHistory | null, HistoryServiceError>
}
