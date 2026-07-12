import { IRepositoryPortProjectMember } from '../ports/repository-ports/index.js'
import { ProjectMemberDrizzleRepo, ProjectMemberDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryProjectMember = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortProjectMember>({
  moduleName: 'RepositoryFactoryProjectMember',
  pgRepo: ProjectMemberDrizzleRepo,
  sqliteRepo: ProjectMemberDrizzleSqliteRepo,
})
