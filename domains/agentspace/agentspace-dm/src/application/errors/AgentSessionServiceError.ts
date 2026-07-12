import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum AgentSessionErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const AgentSessionErrorTag = {
  Domain: 'AgentSessionDomainError',
} as const

export class AgentSessionDomainError extends Data.TaggedError(AgentSessionErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type AgentSessionServiceError = AgentSessionDomainError | XfError | RepositoryError | XfUpsertError

