import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum CodexChatSettingErrorCode {
  NotFound = 'NotFound',
  CreateFailed = 'CreateFailed',
  UpdateFailed = 'UpdateFailed',
  DeleteFailed = 'DeleteFailed',
}

export const CodexChatSettingErrorTag = {
  Domain: 'CodexChatSettingDomainError',
} as const

export class CodexChatSettingDomainError extends Data.TaggedError(CodexChatSettingErrorTag.Domain)<
  WithBaseErrorFields<{ id?: string }>
> {}

export type CodexChatSettingServiceError =
  | CodexChatSettingDomainError
  | XfError
  | RepositoryError
  | XfUpsertError

