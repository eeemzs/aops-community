import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import { ReviewRequestServiceError } from '../../errors/ReviewRequestServiceError.js'
import { IbmReviewRequest, IbmReviewRequestInsert, IbmReviewRequestResult } from '../../../domain/models/index.js'

export type ReviewRequestCreateInput = Omit<IbmReviewRequestInsert, 'status' | 'priority' | 'source' | 'requestedAt' | 'results'> & {
  status?: IbmReviewRequestInsert['status']
  priority?: IbmReviewRequestInsert['priority']
  source?: IbmReviewRequestInsert['source']
  requestedAt?: Date
  results?: IbmReviewRequestResult[]
  idempotencyKey?: string
}

export type ReviewRequestResultInput = Omit<IbmReviewRequestResult, 'id' | 'createdAt'> & {
  id?: string
  createdAt?: Date
  collabResultEventId?: string
}

export interface IReviewRequestServicePort {
  getById(id: string, options?: DbQueryOptions<IbmReviewRequest>): Effect.Effect<IbmReviewRequest | null, ReviewRequestServiceError>
  create(data: IbmReviewRequestInsert): Effect.Effect<IbmReviewRequest, ReviewRequestServiceError>
  createReviewRequest(input: ReviewRequestCreateInput): Effect.Effect<IbmReviewRequest, ReviewRequestServiceError>
  updateReviewRequest(id: string, patch: Partial<IbmReviewRequest>): Effect.Effect<IbmReviewRequest, ReviewRequestServiceError>
  addResult(id: string, result: ReviewRequestResultInput): Effect.Effect<IbmReviewRequest, ReviewRequestServiceError>
  listReviewRequests(filter?: Partial<IbmReviewRequest>, options?: DbQueryOptions<IbmReviewRequest>): Effect.Effect<IbmReviewRequest[], ReviewRequestServiceError>
  removeReviewRequest(id: string): Effect.Effect<void, ReviewRequestServiceError>
}

export interface IReviewRequestLookupPort {
  getById(id: string): Effect.Effect<IbmReviewRequest | null, ReviewRequestServiceError>
}
