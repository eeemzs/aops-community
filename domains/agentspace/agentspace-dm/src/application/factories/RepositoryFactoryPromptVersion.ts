import { IRepositoryPortPromptVersion } from '../ports/repository-ports/index.js'
import { PromptVersionDrizzleRepo, PromptVersionDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryPromptVersion = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortPromptVersion>({
  moduleName: 'RepositoryFactoryPromptVersion',
  pgRepo: PromptVersionDrizzleRepo,
  sqliteRepo: PromptVersionDrizzleSqliteRepo,
})
