import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum SprintItemErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const SprintItemErrorTag = {
  Domain: 'SprintItemDomainError',
} as const

export class SprintItemDomainError extends Data.TaggedError(SprintItemErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type SprintItemServiceError = SprintItemDomainError | XfError | RepositoryError | XfUpsertError

