import { IRepositoryPortPageEmbedLink } from '../ports/repository-ports/index.js'
import { PageEmbedLinkDrizzleRepo, PageEmbedLinkDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryPageEmbedLink = createDocmanDrizzleRepositoryFactory<IRepositoryPortPageEmbedLink>({
  moduleName: 'RepositoryFactoryPageEmbedLink',
  pgRepo: PageEmbedLinkDrizzleRepo,
  sqliteRepo: PageEmbedLinkDrizzleSqliteRepo,
})
