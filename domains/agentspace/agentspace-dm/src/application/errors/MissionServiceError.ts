import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum MissionErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
}

export const MissionErrorTag = {
  Domain: 'MissionDomainError',
} as const

export class MissionDomainError extends Data.TaggedError(MissionErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type MissionServiceError = MissionDomainError | XfError | RepositoryError | XfUpsertError
