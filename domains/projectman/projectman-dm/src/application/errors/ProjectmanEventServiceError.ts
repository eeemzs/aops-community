import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum ProjectmanEventErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const ProjectmanEventErrorTag = {
  Domain: 'ProjectmanEventDomainError',
} as const

export class ProjectmanEventDomainError extends Data.TaggedError(ProjectmanEventErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type ProjectmanEventServiceError = ProjectmanEventDomainError | XfError | RepositoryError | XfUpsertError
