import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum PageEmbedLinkErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const PageEmbedLinkErrorTag = {
  Domain: 'PageEmbedLinkDomainError',
} as const

export class PageEmbedLinkDomainError extends Data.TaggedError(PageEmbedLinkErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type PageEmbedLinkServiceError = PageEmbedLinkDomainError | XfError | RepositoryError | XfUpsertError
