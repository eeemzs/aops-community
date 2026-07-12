import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum SkillVersionErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const SkillVersionErrorTag = {
  Domain: 'SkillVersionDomainError',
} as const

export class SkillVersionDomainError extends Data.TaggedError(SkillVersionErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type SkillVersionServiceError = SkillVersionDomainError | XfError | RepositoryError | XfUpsertError

