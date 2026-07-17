import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum DocumentErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const DocumentErrorTag = {
  Domain: 'DocumentDomainError',
} as const

export class DocumentDomainError extends Data.TaggedError(DocumentErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type DocumentServiceError = DocumentDomainError | XfError | RepositoryError | XfUpsertError
