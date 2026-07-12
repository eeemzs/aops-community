import { Effect } from 'effect'
import { AgentSessionServiceError } from '../../errors/AgentSessionServiceError.js'
import { IbmAgentSession, IbmAgentSessionInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { ScopeResolution } from '../../../domain/types.js'

export type AgentSessionStartInput = Omit<IbmAgentSessionInsert, 'status' | 'startedAt' | 'endedAt'> & {
  status?: IbmAgentSession['status']
  startedAt?: Date
  endedAt?: Date
}

export type AgentSessionListFilter = Partial<IbmAgentSession> & {
  scopeResolution?: ScopeResolution
}

export interface IAgentSessionServicePort {
  getById(id: string, options?: DbQueryOptions<IbmAgentSession>): Effect.Effect<IbmAgentSession | null, AgentSessionServiceError>
  create(data: IbmAgentSessionInsert): Effect.Effect<IbmAgentSession, AgentSessionServiceError>
  startAgentSession(data: AgentSessionStartInput): Effect.Effect<IbmAgentSession, AgentSessionServiceError>
  endAgentSession(id: string, status?: IbmAgentSession['status'], endedAt?: Date): Effect.Effect<IbmAgentSession, AgentSessionServiceError>
  listAgentSessions(filter?: AgentSessionListFilter, options?: DbQueryOptions<IbmAgentSession>): Effect.Effect<IbmAgentSession[], AgentSessionServiceError>
}

export interface IAgentSessionLookupPort {
  getById(id: string): Effect.Effect<IbmAgentSession | null, AgentSessionServiceError>
}
