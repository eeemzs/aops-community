import { IRepositoryPortAgentRun } from '../ports/repository-ports/index.js'
import { AgentRunDrizzleRepo, AgentRunDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryAgentRun = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortAgentRun>({
  moduleName: 'RepositoryFactoryAgentRun',
  pgRepo: AgentRunDrizzleRepo,
  sqliteRepo: AgentRunDrizzleSqliteRepo,
})
