import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum AgentRunErrorCode {
  NotFound = "NotFound",
  CreateFailed = "CreateFailed",
  UpdateFailed = "UpdateFailed",
  DeleteFailed = "DeleteFailed",
  //==> domain-specific error codes
  // CustomError = "CustomError",
  //<==//
}

export const AgentRunErrorTag = {
  Domain: 'AgentRunDomainError',
} as const

export class AgentRunDomainError extends Data.TaggedError(AgentRunErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type AgentRunServiceError = AgentRunDomainError | XfError | RepositoryError | XfUpsertError

