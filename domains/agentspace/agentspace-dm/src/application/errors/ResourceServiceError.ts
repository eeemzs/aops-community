import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum ResourceErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const ResourceErrorTag = {
  Domain: 'ResourceDomainError',
} as const

export class ResourceDomainError extends Data.TaggedError(ResourceErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type ResourceServiceError = ResourceDomainError | XfError | RepositoryError | XfUpsertError

