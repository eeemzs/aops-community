import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum ActivityItemErrorCode {
  NotFound = 'NotFound',
  CreateFailed = 'CreateFailed',
}

export const ActivityItemErrorTag = {
  Domain: 'ActivityItemDomainError',
} as const

export class ActivityItemDomainError extends Data.TaggedError(ActivityItemErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type ActivityItemServiceError = ActivityItemDomainError | XfError | RepositoryError | XfUpsertError
