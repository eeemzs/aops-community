import { IRepositoryPortActivityItem } from '../ports/repository-ports/index.js'
import { ActivityItemDrizzleRepo, ActivityItemDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryActivityItem = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortActivityItem>({
  moduleName: 'RepositoryFactoryActivityItem',
  pgRepo: ActivityItemDrizzleRepo,
  sqliteRepo: ActivityItemDrizzleSqliteRepo,
})
