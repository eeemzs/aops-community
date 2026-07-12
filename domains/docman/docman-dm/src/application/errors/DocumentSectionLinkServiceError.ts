import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum DocumentSectionLinkErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const DocumentSectionLinkErrorTag = {
  Domain: 'DocumentSectionLinkDomainError',
} as const

export class DocumentSectionLinkDomainError extends Data.TaggedError(DocumentSectionLinkErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type DocumentSectionLinkServiceError = DocumentSectionLinkDomainError | XfError | RepositoryError | XfUpsertError

