import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum ReviewRequestErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const ReviewRequestErrorTag = {
  Domain: 'ReviewRequestDomainError',
} as const

export class ReviewRequestDomainError extends Data.TaggedError(ReviewRequestErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type ReviewRequestServiceError = ReviewRequestDomainError | XfError | RepositoryError | XfUpsertError
