import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum IssueItemErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const IssueItemErrorTag = {
  Domain: 'IssueItemDomainError',
} as const

export class IssueItemDomainError extends Data.TaggedError(IssueItemErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type IssueItemServiceError = IssueItemDomainError | XfError | RepositoryError | XfUpsertError
