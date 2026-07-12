import { IRepositoryPortSectionPageLink } from '../ports/repository-ports/index.js'
import { SectionPageLinkDrizzleRepo, SectionPageLinkDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactorySectionPageLink = createDocmanDrizzleRepositoryFactory<IRepositoryPortSectionPageLink>({
  moduleName: 'RepositoryFactorySectionPageLink',
  pgRepo: SectionPageLinkDrizzleRepo,
  sqliteRepo: SectionPageLinkDrizzleSqliteRepo,
})
