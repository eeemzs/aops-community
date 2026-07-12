import { IRepositoryPortSprint } from '../ports/repository-ports/index.js'
import { SprintDrizzleRepo, SprintDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactorySprint = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortSprint>({
  moduleName: 'RepositoryFactorySprint',
  pgRepo: SprintDrizzleRepo,
  sqliteRepo: SprintDrizzleSqliteRepo,
})
