import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum SectionPageLinkErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const SectionPageLinkErrorTag = {
  Domain: 'SectionPageLinkDomainError',
} as const

export class SectionPageLinkDomainError extends Data.TaggedError(SectionPageLinkErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type SectionPageLinkServiceError = SectionPageLinkDomainError | XfError | RepositoryError | XfUpsertError

