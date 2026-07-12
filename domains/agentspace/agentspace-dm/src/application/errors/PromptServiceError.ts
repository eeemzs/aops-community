import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum PromptErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const PromptErrorTag = {
  Domain: 'PromptDomainError',
} as const

export class PromptDomainError extends Data.TaggedError(PromptErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type PromptServiceError = PromptDomainError | XfError | RepositoryError | XfUpsertError

