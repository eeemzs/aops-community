import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum AssetErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
}

export const AssetErrorTag = {
  Domain: 'AssetDomainError',
} as const

export class AssetDomainError extends Data.TaggedError(AssetErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type AssetServiceError = AssetDomainError | XfError | RepositoryError | XfUpsertError
