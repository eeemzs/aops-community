import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum WorkflowDefinitionErrorCode {
  NotFound = 'NotFound',
  CreateFailed = 'CreateFailed',
  UpdateFailed = 'UpdateFailed',
  DeleteFailed = 'DeleteFailed',
}

export const WorkflowDefinitionErrorTag = {
  Domain: 'WorkflowDefinitionDomainError',
} as const

export class WorkflowDefinitionDomainError extends Data.TaggedError(WorkflowDefinitionErrorTag.Domain)<
  WithBaseErrorFields<{ id?: string }>
> {}

export type WorkflowDefinitionServiceError =
  | WorkflowDefinitionDomainError
  | XfError
  | RepositoryError
  | XfUpsertError
