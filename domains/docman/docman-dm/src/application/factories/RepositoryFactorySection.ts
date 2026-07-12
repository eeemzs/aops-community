import { IRepositoryPortSection } from '../ports/repository-ports/index.js'
import { SectionDrizzleRepo, SectionDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createDocmanDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactorySection = createDocmanDrizzleRepositoryFactory<IRepositoryPortSection>({
  moduleName: 'RepositoryFactorySection',
  pgRepo: SectionDrizzleRepo,
  sqliteRepo: SectionDrizzleSqliteRepo,
})
