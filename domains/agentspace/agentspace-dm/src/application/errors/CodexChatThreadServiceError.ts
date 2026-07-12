import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum CodexChatThreadErrorCode {
  NotFound = 'NotFound',
  CreateFailed = 'CreateFailed',
  UpdateFailed = 'UpdateFailed',
  DeleteFailed = 'DeleteFailed',
}

export const CodexChatThreadErrorTag = {
  Domain: 'CodexChatThreadDomainError',
} as const

export class CodexChatThreadDomainError extends Data.TaggedError(CodexChatThreadErrorTag.Domain)<
  WithBaseErrorFields<{ id?: string }>
> {}

export type CodexChatThreadServiceError =
  | CodexChatThreadDomainError
  | XfError
  | RepositoryError
  | XfUpsertError

