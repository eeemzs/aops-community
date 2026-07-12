import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum HistoryErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const HistoryErrorTag = {
  Domain: 'HistoryDomainError',
} as const

export class HistoryDomainError extends Data.TaggedError(HistoryErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type HistoryServiceError = HistoryDomainError | XfError | RepositoryError | XfUpsertError
