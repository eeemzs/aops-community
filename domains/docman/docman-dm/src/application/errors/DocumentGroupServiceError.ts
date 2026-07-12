import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum DocumentGroupErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const DocumentGroupErrorTag = {
  Domain: 'DocumentGroupDomainError',
} as const

export class DocumentGroupDomainError extends Data.TaggedError(DocumentGroupErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type DocumentGroupServiceError = DocumentGroupDomainError | XfError | RepositoryError | XfUpsertError
