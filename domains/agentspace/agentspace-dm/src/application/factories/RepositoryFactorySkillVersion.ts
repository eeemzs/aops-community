import { IRepositoryPortSkillVersion } from '../ports/repository-ports/index.js'
import { SkillVersionDrizzleRepo, SkillVersionDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactorySkillVersion = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortSkillVersion>({
  moduleName: 'RepositoryFactorySkillVersion',
  pgRepo: SkillVersionDrizzleRepo,
  sqliteRepo: SkillVersionDrizzleSqliteRepo,
})
