import { IRepositoryPortAgentRunEvent } from '../ports/repository-ports/index.js'
import { AgentRunEventDrizzleRepo, AgentRunEventDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryAgentRunEvent = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortAgentRunEvent>({
  moduleName: 'RepositoryFactoryAgentRunEvent',
  pgRepo: AgentRunEventDrizzleRepo,
  sqliteRepo: AgentRunEventDrizzleSqliteRepo,
})
