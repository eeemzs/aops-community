import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum KanbanBoardColumnErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const KanbanBoardColumnErrorTag = {
  Domain: 'KanbanBoardColumnDomainError',
} as const

export class KanbanBoardColumnDomainError extends Data.TaggedError(KanbanBoardColumnErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type KanbanBoardColumnServiceError = KanbanBoardColumnDomainError | XfError | RepositoryError | XfUpsertError
