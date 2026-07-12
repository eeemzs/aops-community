import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum TaskErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const TaskErrorTag = {
  Domain: 'TaskDomainError',
} as const

export class TaskDomainError extends Data.TaggedError(TaskErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type TaskServiceError = TaskDomainError | XfError | RepositoryError | XfUpsertError

