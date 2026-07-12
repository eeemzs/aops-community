import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum ArtifactLinkErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const ArtifactLinkErrorTag = {
  Domain: 'ArtifactLinkDomainError',
} as const

export class ArtifactLinkDomainError extends Data.TaggedError(ArtifactLinkErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type ArtifactLinkServiceError = ArtifactLinkDomainError | XfError | RepositoryError | XfUpsertError

