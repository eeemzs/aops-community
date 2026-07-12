import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum SkillErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const SkillErrorTag = {
  Domain: 'SkillDomainError',
} as const

export class SkillDomainError extends Data.TaggedError(SkillErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type SkillServiceError = SkillDomainError | XfError | RepositoryError | XfUpsertError

