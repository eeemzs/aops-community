import { IRepositoryPortAgentProfile } from '../ports/repository-ports/index.js'
import { AgentProfileDrizzleRepo, AgentProfileDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryAgentProfile = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortAgentProfile>({
  moduleName: 'RepositoryFactoryAgentProfile',
  pgRepo: AgentProfileDrizzleRepo,
  sqliteRepo: AgentProfileDrizzleSqliteRepo,
})
