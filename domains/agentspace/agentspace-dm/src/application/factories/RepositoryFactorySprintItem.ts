import { IRepositoryPortSprintItem } from '../ports/repository-ports/index.js'
import { SprintItemDrizzleRepo, SprintItemDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactorySprintItem = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortSprintItem>({
  moduleName: 'RepositoryFactorySprintItem',
  pgRepo: SprintItemDrizzleRepo,
  sqliteRepo: SprintItemDrizzleSqliteRepo,
})
