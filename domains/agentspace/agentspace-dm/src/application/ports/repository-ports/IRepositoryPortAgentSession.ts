import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmAgentSession } from '../../../domain/models/index.js'
import { IdbAgentSessionDrizzle } from '../../../infrastructure/db/agentSession/drizzle/drizzle.schema.agentSession.js'

/**
 * Repository port for AgentSession
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortAgentSession extends IRepositoryPortBaseCrud<IbmAgentSession, IdbAgentSessionDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmAgentSession>): import('effect').Effect<IbmAgentSession | null, RepositoryError>
  //<==//
}


