import { IRepositoryPortPrompt } from '../ports/repository-ports/index.js'
import { PromptDrizzleRepo, PromptDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryPrompt = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortPrompt>({
  moduleName: 'RepositoryFactoryPrompt',
  pgRepo: PromptDrizzleRepo,
  sqliteRepo: PromptDrizzleSqliteRepo,
})
