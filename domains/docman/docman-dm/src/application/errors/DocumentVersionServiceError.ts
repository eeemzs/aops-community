import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum DocumentVersionErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const DocumentVersionErrorTag = {
  Domain: 'DocumentVersionDomainError',
} as const

export class DocumentVersionDomainError extends Data.TaggedError(DocumentVersionErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type DocumentVersionServiceError = DocumentVersionDomainError | XfError | RepositoryError | XfUpsertError

