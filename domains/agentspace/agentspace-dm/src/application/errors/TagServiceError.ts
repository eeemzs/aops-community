import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum TagErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const TagErrorTag = {
  Domain: 'TagDomainError',
} as const

export class TagDomainError extends Data.TaggedError(TagErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type TagServiceError = TagDomainError | XfError | RepositoryError | XfUpsertError
