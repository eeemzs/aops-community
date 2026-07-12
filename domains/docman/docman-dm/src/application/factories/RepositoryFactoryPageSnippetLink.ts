import { IRepositoryPortPageSnippetLink } from '../ports/repository-ports/index.js'
import { PageSnippetLinkDrizzleRepo, PageSnippetLinkDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryPageSnippetLink = createDocmanDrizzleRepositoryFactory<IRepositoryPortPageSnippetLink>({
  moduleName: 'RepositoryFactoryPageSnippetLink',
  pgRepo: PageSnippetLinkDrizzleRepo,
  sqliteRepo: PageSnippetLinkDrizzleSqliteRepo,
})
