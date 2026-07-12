import { IRepositoryPortSkill } from '../ports/repository-ports/index.js'
import { SkillDrizzleRepo, SkillDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactorySkill = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortSkill>({
  moduleName: 'RepositoryFactorySkill',
  pgRepo: SkillDrizzleRepo,
  sqliteRepo: SkillDrizzleSqliteRepo,
})
