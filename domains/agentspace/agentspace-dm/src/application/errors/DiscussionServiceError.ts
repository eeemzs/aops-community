import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum DiscussionErrorCode {
  NotFound = 'NotFound',
  CreateFailed = 'CreateFailed',
  UpdateFailed = 'UpdateFailed',
  DeleteFailed = 'DeleteFailed',
}

export const DiscussionErrorTag = {
  Domain: 'DiscussionDomainError',
} as const

export class DiscussionDomainError extends Data.TaggedError(DiscussionErrorTag.Domain)<
  WithBaseErrorFields<{ id?: string }>
> {}

export type DiscussionServiceError =
  | DiscussionDomainError
  | XfError
  | RepositoryError
  | XfUpsertError
