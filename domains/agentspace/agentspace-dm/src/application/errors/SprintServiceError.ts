import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum SprintErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const SprintErrorTag = {
  Domain: 'SprintDomainError',
} as const

export class SprintDomainError extends Data.TaggedError(SprintErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type SprintServiceError = SprintDomainError | XfError | RepositoryError | XfUpsertError

