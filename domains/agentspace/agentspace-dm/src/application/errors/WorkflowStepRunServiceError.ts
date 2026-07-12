import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum WorkflowStepRunErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const WorkflowStepRunErrorTag = {
  Domain: 'WorkflowStepRunDomainError',
} as const

export class WorkflowStepRunDomainError extends Data.TaggedError(WorkflowStepRunErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type WorkflowStepRunServiceError = WorkflowStepRunDomainError | XfError | RepositoryError | XfUpsertError
