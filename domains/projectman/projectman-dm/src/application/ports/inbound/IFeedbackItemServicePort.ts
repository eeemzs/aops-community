import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { FeedbackItemServiceError } from '../../errors/FeedbackItemServiceError.js'
import { IbmFeedbackItem, IbmFeedbackItemInsert } from '../../../domain/models/index.js'

export type FeedbackItemCreateInput = Omit<IbmFeedbackItemInsert, 'status' | 'type' | 'severity' | 'source' | 'recordedAt'> & {
  status?: IbmFeedbackItemInsert['status']
  type?: IbmFeedbackItemInsert['type']
  severity?: IbmFeedbackItemInsert['severity']
  source?: IbmFeedbackItemInsert['source']
  recordedAt?: Date
}

export interface IFeedbackItemServicePort {
  getById(id: string, options?: DbQueryOptions<IbmFeedbackItem>): Effect.Effect<IbmFeedbackItem | null, FeedbackItemServiceError>
  create(data: IbmFeedbackItemInsert): Effect.Effect<IbmFeedbackItem, FeedbackItemServiceError>
  createFeedback(input: FeedbackItemCreateInput): Effect.Effect<IbmFeedbackItem, FeedbackItemServiceError>
  updateFeedback(id: string, patch: Partial<IbmFeedbackItem>): Effect.Effect<IbmFeedbackItem, FeedbackItemServiceError>
  listFeedback(filter?: Partial<IbmFeedbackItem>, options?: DbQueryOptions<IbmFeedbackItem>): Effect.Effect<IbmFeedbackItem[], FeedbackItemServiceError>
  removeFeedback(id: string): Effect.Effect<void, FeedbackItemServiceError>
  //==> custom-methods
  //<==//
}

export interface IFeedbackItemLookupPort {
  getById(id: string): Effect.Effect<IbmFeedbackItem | null, FeedbackItemServiceError>
}
