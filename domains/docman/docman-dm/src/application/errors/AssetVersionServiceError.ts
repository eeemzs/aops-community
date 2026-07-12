import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum AssetVersionErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
}

export const AssetVersionErrorTag = {
  Domain: 'AssetVersionDomainError',
} as const

export class AssetVersionDomainError extends Data.TaggedError(AssetVersionErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type AssetVersionServiceError = AssetVersionDomainError | XfError | RepositoryError | XfUpsertError
