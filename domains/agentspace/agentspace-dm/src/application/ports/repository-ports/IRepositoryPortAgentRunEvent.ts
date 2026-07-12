import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmAgentRunEvent } from '../../../domain/models/index.js'
import { IdbAgentRunEventDrizzle } from '../../../infrastructure/db/agentRunEvent/drizzle/drizzle.schema.agentRunEvent.js'

/**
 * Repository port for AgentRunEvent
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortAgentRunEvent extends IRepositoryPortBaseCrud<IbmAgentRunEvent, IdbAgentRunEventDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByRunId(runId: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmAgentRunEvent>): import('effect').Effect<IbmAgentRunEvent[] | null, RepositoryError>
  //<==//
}
