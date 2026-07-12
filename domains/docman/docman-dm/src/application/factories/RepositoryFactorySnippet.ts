import { IRepositoryPortSnippet } from '../ports/repository-ports/index.js'
import { SnippetDrizzleRepo, SnippetDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactorySnippet = createDocmanDrizzleRepositoryFactory<IRepositoryPortSnippet>({
  moduleName: 'RepositoryFactorySnippet',
  pgRepo: SnippetDrizzleRepo,
  sqliteRepo: SnippetDrizzleSqliteRepo,
})
