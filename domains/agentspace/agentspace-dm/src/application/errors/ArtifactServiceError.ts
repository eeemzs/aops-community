import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum ArtifactErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const ArtifactErrorTag = {
  Domain: 'ArtifactDomainError',
} as const

export class ArtifactDomainError extends Data.TaggedError(ArtifactErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type ArtifactServiceError = ArtifactDomainError | XfError | RepositoryError | XfUpsertError

