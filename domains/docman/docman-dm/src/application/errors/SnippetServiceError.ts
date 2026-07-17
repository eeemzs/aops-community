import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum SnippetErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const SnippetErrorTag = {
  Domain: 'SnippetDomainError',
} as const

export class SnippetDomainError extends Data.TaggedError(SnippetErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type SnippetServiceError = SnippetDomainError | XfError | RepositoryError | XfUpsertError
