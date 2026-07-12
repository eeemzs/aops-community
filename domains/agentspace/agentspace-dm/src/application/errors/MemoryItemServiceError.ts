import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum MemoryItemErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const MemoryItemErrorTag = {
  Domain: 'MemoryItemDomainError',
} as const

export class MemoryItemDomainError extends Data.TaggedError(MemoryItemErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type MemoryItemServiceError = MemoryItemDomainError | XfError | RepositoryError | XfUpsertError

