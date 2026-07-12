import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum ProjectErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const ProjectErrorTag = {
  Domain: 'ProjectDomainError',
} as const

export class ProjectDomainError extends Data.TaggedError(ProjectErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type ProjectServiceError = ProjectDomainError | XfError | RepositoryError | XfUpsertError

