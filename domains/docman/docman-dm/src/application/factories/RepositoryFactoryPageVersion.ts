import { IRepositoryPortPageVersion } from '../ports/repository-ports/index.js'
import { PageVersionDrizzleRepo, PageVersionDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryPageVersion = createDocmanDrizzleRepositoryFactory<IRepositoryPortPageVersion>({
  moduleName: 'RepositoryFactoryPageVersion',
  pgRepo: PageVersionDrizzleRepo,
  sqliteRepo: PageVersionDrizzleSqliteRepo,
})
