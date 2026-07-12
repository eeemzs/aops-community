import { IRepositoryPortMemoryItem } from '../ports/repository-ports/index.js'
import { MemoryItemDrizzleRepo, MemoryItemDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryMemoryItem = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortMemoryItem>({
  moduleName: 'RepositoryFactoryMemoryItem',
  pgRepo: MemoryItemDrizzleRepo,
  sqliteRepo: MemoryItemDrizzleSqliteRepo,
})
