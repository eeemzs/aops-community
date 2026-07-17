import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum PageErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const PageErrorTag = {
  Domain: 'PageDomainError',
} as const

export class PageDomainError extends Data.TaggedError(PageErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type PageServiceError = PageDomainError | XfError | RepositoryError | XfUpsertError
