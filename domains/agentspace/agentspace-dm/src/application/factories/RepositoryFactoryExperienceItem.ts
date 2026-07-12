import { IRepositoryPortExperienceItem } from '../ports/repository-ports/index.js'
import { ExperienceItemDrizzleRepo, ExperienceItemDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryExperienceItem = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortExperienceItem>({
  moduleName: 'RepositoryFactoryExperienceItem',
  pgRepo: ExperienceItemDrizzleRepo,
  sqliteRepo: ExperienceItemDrizzleSqliteRepo,
})
