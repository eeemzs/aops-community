import { IRepositoryPortPage } from '../ports/repository-ports/index.js'
import { PageDrizzleRepo, PageDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryPage = createDocmanDrizzleRepositoryFactory<IRepositoryPortPage>({
  moduleName: 'RepositoryFactoryPage',
  pgRepo: PageDrizzleRepo,
  sqliteRepo: PageDrizzleSqliteRepo,
})
