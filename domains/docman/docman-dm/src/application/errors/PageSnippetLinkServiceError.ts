import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum PageSnippetLinkErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const PageSnippetLinkErrorTag = {
  Domain: 'PageSnippetLinkDomainError',
} as const

export class PageSnippetLinkDomainError extends Data.TaggedError(PageSnippetLinkErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type PageSnippetLinkServiceError = PageSnippetLinkDomainError | XfError | RepositoryError | XfUpsertError
