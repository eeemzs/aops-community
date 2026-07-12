import { XfError, XfUpsertError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'

export enum AgentProfileErrorCode {
  NotFound = 'NotFound',
  CreateFailed = 'CreateFailed',
  UpdateFailed = 'UpdateFailed',
  DeleteFailed = 'DeleteFailed',
}

export const AgentProfileErrorTag = {
  Domain: 'AgentProfileDomainError',
} as const

export class AgentProfileDomainError extends Data.TaggedError(AgentProfileErrorTag.Domain)<WithBaseErrorFields<{ id?: string }>> {}

export type AgentProfileServiceError = AgentProfileDomainError | XfError | RepositoryError | XfUpsertError
