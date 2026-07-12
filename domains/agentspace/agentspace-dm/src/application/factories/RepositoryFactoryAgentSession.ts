import { IRepositoryPortAgentSession } from '../ports/repository-ports/index.js'
import { AgentSessionDrizzleRepo, AgentSessionDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryAgentSession = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortAgentSession>({
  moduleName: 'RepositoryFactoryAgentSession',
  pgRepo: AgentSessionDrizzleRepo,
  sqliteRepo: AgentSessionDrizzleSqliteRepo,
})
