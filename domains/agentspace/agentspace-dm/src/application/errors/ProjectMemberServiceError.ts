import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum ProjectMemberErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const ProjectMemberErrorTag = {
  Domain: 'ProjectMemberDomainError',
} as const

export class ProjectMemberDomainError extends Data.TaggedError(ProjectMemberErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type ProjectMemberServiceError = ProjectMemberDomainError | XfError | RepositoryError | XfUpsertError
