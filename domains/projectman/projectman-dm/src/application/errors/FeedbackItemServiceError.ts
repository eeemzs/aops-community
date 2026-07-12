import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum FeedbackItemErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const FeedbackItemErrorTag = {
  Domain: 'FeedbackItemDomainError',
} as const

export class FeedbackItemDomainError extends Data.TaggedError(FeedbackItemErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type FeedbackItemServiceError = FeedbackItemDomainError | XfError | RepositoryError | XfUpsertError
