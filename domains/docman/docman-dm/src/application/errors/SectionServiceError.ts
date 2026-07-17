import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum SectionErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const SectionErrorTag = {
  Domain: 'SectionDomainError',
} as const

export class SectionDomainError extends Data.TaggedError(SectionErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type SectionServiceError = SectionDomainError | XfError | RepositoryError | XfUpsertError
