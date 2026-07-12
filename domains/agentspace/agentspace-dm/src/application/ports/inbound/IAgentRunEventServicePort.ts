import { Effect } from 'effect'
import { AgentRunEventServiceError } from '../../errors/AgentRunEventServiceError.js'
import { IbmAgentRunEvent, IbmAgentRunEventInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { ScopeResolution } from '../../../domain/types.js'

export interface AgentRunEventListFilter {
  scopeId?: string
  scopeResolution?: ScopeResolution
  agentRunId?: string
  runId?: string
  eventId?: string
  eventType?: string
  status?: string
}

export interface IAgentRunEventServicePort {
  getById(id: string, options?: DbQueryOptions<IbmAgentRunEvent>): Effect.Effect<IbmAgentRunEvent | null, AgentRunEventServiceError>
  create(data: IbmAgentRunEventInsert): Effect.Effect<IbmAgentRunEvent, AgentRunEventServiceError>
  listAgentRunEvents(
    filter?: AgentRunEventListFilter,
    options?: DbQueryOptions<IbmAgentRunEvent>
  ): Effect.Effect<IbmAgentRunEvent[], AgentRunEventServiceError>
}

export interface IAgentRunEventLookupPort {
  getById(id: string): Effect.Effect<IbmAgentRunEvent | null, AgentRunEventServiceError>
}
