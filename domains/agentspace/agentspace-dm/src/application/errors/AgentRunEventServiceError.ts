import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum AgentRunEventErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const AgentRunEventErrorTag = {
  Domain: 'AgentRunEventDomainError',
} as const

export class AgentRunEventDomainError extends Data.TaggedError(AgentRunEventErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type AgentRunEventServiceError = AgentRunEventDomainError | XfError | RepositoryError | XfUpsertError
