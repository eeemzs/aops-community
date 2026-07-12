import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum WorkflowInstanceErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const WorkflowInstanceErrorTag = {
  Domain: 'WorkflowInstanceDomainError',
} as const

export class WorkflowInstanceDomainError extends Data.TaggedError(WorkflowInstanceErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type WorkflowInstanceServiceError = WorkflowInstanceDomainError | XfError | RepositoryError | XfUpsertError
