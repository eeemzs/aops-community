import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum MicroTaskItemErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const MicroTaskItemErrorTag = {
  Domain: 'MicroTaskItemDomainError',
} as const

export class MicroTaskItemDomainError extends Data.TaggedError(MicroTaskItemErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type MicroTaskItemServiceError = MicroTaskItemDomainError | XfError | RepositoryError | XfUpsertError
