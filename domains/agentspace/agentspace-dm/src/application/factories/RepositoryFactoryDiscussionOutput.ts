import { IRepositoryPortDiscussionOutput } from '../ports/repository-ports/index.js'
import { DiscussionOutputDrizzleRepo, DiscussionOutputDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryDiscussionOutput = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortDiscussionOutput>({
  moduleName: 'RepositoryFactoryDiscussionOutput',
  pgRepo: DiscussionOutputDrizzleRepo,
  sqliteRepo: DiscussionOutputDrizzleSqliteRepo,
})
