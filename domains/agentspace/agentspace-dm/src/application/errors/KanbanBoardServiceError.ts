import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum KanbanBoardErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const KanbanBoardErrorTag = {
  Domain: 'KanbanBoardDomainError',
} as const

export class KanbanBoardDomainError extends Data.TaggedError(KanbanBoardErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type KanbanBoardServiceError = KanbanBoardDomainError | XfError | RepositoryError | XfUpsertError

