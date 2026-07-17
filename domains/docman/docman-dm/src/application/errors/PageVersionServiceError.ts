import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum PageVersionErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const PageVersionErrorTag = {
  Domain: 'PageVersionDomainError',
} as const

export class PageVersionDomainError extends Data.TaggedError(PageVersionErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type PageVersionServiceError = PageVersionDomainError | XfError | RepositoryError | XfUpsertError
