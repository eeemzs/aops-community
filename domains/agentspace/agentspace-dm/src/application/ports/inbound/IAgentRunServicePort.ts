import { Effect } from 'effect'
import { AgentRunServiceError } from '../../errors/AgentRunServiceError.js'
import { IbmAgentRun, IbmAgentRunInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import { IdbAgentRunDrizzle } from '../../../infrastructure/db/agentRun/drizzle/drizzle.schema.agentRun.js'

export type AgentRunRecordInput = IbmAgentRunInsert

export interface IAgentRunServicePort {
  getById(id: string, options?: DbQueryOptions<IbmAgentRun>): Effect.Effect<IbmAgentRun | null, AgentRunServiceError>
  create(data: IbmAgentRunInsert): Effect.Effect<IbmAgentRun, AgentRunServiceError>
  getAgentRun(id: string, options?: DbQueryOptions<IbmAgentRun>): Effect.Effect<IbmAgentRun | null, AgentRunServiceError>
  recordAgentRun(data: AgentRunRecordInput): Effect.Effect<IbmAgentRun, AgentRunServiceError>
  attachRunToTask(id: string, taskId: string | null): Effect.Effect<IbmAgentRun, AgentRunServiceError>
  listAgentRuns(filter?: Partial<IbmAgentRun>, options?: DbQueryOptions<IdbAgentRunDrizzle>): Effect.Effect<IbmAgentRun[], AgentRunServiceError>
}

export interface IAgentRunLookupPort {
  getById(id: string): Effect.Effect<IbmAgentRun | null, AgentRunServiceError>
}
