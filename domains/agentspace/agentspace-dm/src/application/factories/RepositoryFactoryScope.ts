import { IRepositoryPortScope } from '../ports/repository-ports/index.js'
import { ScopeDrizzleRepo, ScopeDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryScope = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortScope>({
  moduleName: 'RepositoryFactoryScope',
  pgRepo: ScopeDrizzleRepo,
  sqliteRepo: ScopeDrizzleSqliteRepo,
})
