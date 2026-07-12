import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum PromptVersionErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const PromptVersionErrorTag = {
  Domain: 'PromptVersionDomainError',
} as const

export class PromptVersionDomainError extends Data.TaggedError(PromptVersionErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type PromptVersionServiceError = PromptVersionDomainError | XfError | RepositoryError | XfUpsertError

