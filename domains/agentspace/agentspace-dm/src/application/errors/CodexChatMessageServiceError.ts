import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum CodexChatMessageErrorCode {
  NotFound = 'NotFound',
  CreateFailed = 'CreateFailed',
  UpdateFailed = 'UpdateFailed',
  DeleteFailed = 'DeleteFailed',
}

export const CodexChatMessageErrorTag = {
  Domain: 'CodexChatMessageDomainError',
} as const

export class CodexChatMessageDomainError extends Data.TaggedError(CodexChatMessageErrorTag.Domain)<
  WithBaseErrorFields<{ id?: string }>
> {}

export type CodexChatMessageServiceError =
  | CodexChatMessageDomainError
  | XfError
  | RepositoryError
  | XfUpsertError

