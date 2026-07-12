import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum ExperienceItemErrorCode {
  NotFound = 'NotFound',
  CreateFailed = 'CreateFailed',
  UpdateFailed = 'UpdateFailed',
  DeleteFailed = 'DeleteFailed',
}

export const ExperienceItemErrorTag = {
  Domain: 'ExperienceItemDomainError',
} as const

export class ExperienceItemDomainError extends Data.TaggedError(ExperienceItemErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type ExperienceItemServiceError = ExperienceItemDomainError | XfError | RepositoryError | XfUpsertError
