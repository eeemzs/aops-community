import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum ProjectPathErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const ProjectPathErrorTag = {
  Domain: 'ProjectPathDomainError',
} as const

export class ProjectPathDomainError extends Data.TaggedError(ProjectPathErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type ProjectPathServiceError = ProjectPathDomainError | XfError | RepositoryError | XfUpsertError
