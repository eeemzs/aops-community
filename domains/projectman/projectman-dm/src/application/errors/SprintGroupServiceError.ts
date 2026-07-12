import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum SprintGroupErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const SprintGroupErrorTag = {
  Domain: 'SprintGroupDomainError',
} as const

export class SprintGroupDomainError extends Data.TaggedError(SprintGroupErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type SprintGroupServiceError = SprintGroupDomainError | XfError | RepositoryError | XfUpsertError
