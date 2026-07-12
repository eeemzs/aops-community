import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum EmbedErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const EmbedErrorTag = {
  Domain: 'EmbedDomainError',
} as const

export class EmbedDomainError extends Data.TaggedError(EmbedErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type EmbedServiceError = EmbedDomainError | XfError | RepositoryError | XfUpsertError
