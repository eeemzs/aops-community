import { IRepositoryPortTag } from '../ports/repository-ports/index.js'
import { TagDrizzleRepo, TagDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryTag = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortTag>({
  moduleName: 'RepositoryFactoryTag',
  pgRepo: TagDrizzleRepo,
  sqliteRepo: TagDrizzleSqliteRepo,
})
