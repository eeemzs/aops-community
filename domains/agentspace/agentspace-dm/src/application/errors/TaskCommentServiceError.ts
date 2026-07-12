import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum TaskCommentErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const TaskCommentErrorTag = {
  Domain: 'TaskCommentDomainError',
} as const

export class TaskCommentDomainError extends Data.TaggedError(TaskCommentErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type TaskCommentServiceError = TaskCommentDomainError | XfError | RepositoryError | XfUpsertError

