import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum ChatErrorCode {
  NotFound = 'NotFound',
  CreateFailed = 'CreateFailed',
  UpdateFailed = 'UpdateFailed',
  DeleteFailed = 'DeleteFailed',
}

export const ChatErrorTag = {
  Domain: 'ChatDomainError',
} as const

export class ChatDomainError extends Data.TaggedError(ChatErrorTag.Domain)<
  WithBaseErrorFields<{ id?: string }>
> {}

export type ChatServiceError =
  | ChatDomainError
  | XfError
  | RepositoryError
  | XfUpsertError
