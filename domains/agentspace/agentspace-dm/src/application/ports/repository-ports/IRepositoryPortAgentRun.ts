import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmAgentRun } from '../../../domain/models/index.js'
import { IdbAgentRunDrizzle } from '../../../infrastructure/db/agentRun/drizzle/drizzle.schema.agentRun.js'

/**
 * Repository port for AgentRun
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortAgentRun extends IRepositoryPortBaseCrud<IbmAgentRun, IdbAgentRunDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmAgentRun>): import('effect').Effect<IbmAgentRun | null, RepositoryError>
  //<==//
}


