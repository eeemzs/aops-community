import { IRepositoryPortResource } from '../ports/repository-ports/index.js'
import { ResourceDrizzleRepo, ResourceDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryResource = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortResource>({
  moduleName: 'RepositoryFactoryResource',
  pgRepo: ResourceDrizzleRepo,
  sqliteRepo: ResourceDrizzleSqliteRepo,
})
