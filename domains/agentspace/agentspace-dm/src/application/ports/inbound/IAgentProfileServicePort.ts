import { Effect } from 'effect'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { ScopeResolution } from '../../../domain/types.js'
import { AgentProfileServiceError } from '../../errors/AgentProfileServiceError.js'
import { IbmAgentProfile, IbmAgentProfileInsert } from '../../../domain/models/index.js'

export type AgentProfileListFilter = Partial<IbmAgentProfile> & {
  scopeResolution?: ScopeResolution
  // Convenience filter: keep only profiles whose defaultAgents array contains this agent id.
  defaultAgent?: string
}

export interface IAgentProfileServicePort {
  createProfile(data: IbmAgentProfileInsert): Effect.Effect<IbmAgentProfile, AgentProfileServiceError>
  getProfileById(id: string, options?: DbQueryOptions<IbmAgentProfile>): Effect.Effect<IbmAgentProfile | null, AgentProfileServiceError>
  listProfiles(filter?: AgentProfileListFilter, options?: DbQueryOptions<IbmAgentProfile>): Effect.Effect<IbmAgentProfile[], AgentProfileServiceError>
  updateProfile(id: string, patch: Partial<IbmAgentProfile>): Effect.Effect<IbmAgentProfile, AgentProfileServiceError>
  deleteProfile(id: string): Effect.Effect<void, AgentProfileServiceError>
}

export interface IAgentProfileLookupPort {
  getProfileById(id: string): Effect.Effect<IbmAgentProfile | null, AgentProfileServiceError>
}
