import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum KanbanTaskErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const KanbanTaskErrorTag = {
  Domain: 'KanbanTaskDomainError',
} as const

export class KanbanTaskDomainError extends Data.TaggedError(KanbanTaskErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type KanbanTaskServiceError = KanbanTaskDomainError | XfError | RepositoryError | XfUpsertError
