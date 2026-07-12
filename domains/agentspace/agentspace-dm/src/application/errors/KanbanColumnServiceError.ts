import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum KanbanColumnErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const KanbanColumnErrorTag = {
  Domain: 'KanbanColumnDomainError',
} as const

export class KanbanColumnDomainError extends Data.TaggedError(KanbanColumnErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type KanbanColumnServiceError = KanbanColumnDomainError | XfError | RepositoryError | XfUpsertError

