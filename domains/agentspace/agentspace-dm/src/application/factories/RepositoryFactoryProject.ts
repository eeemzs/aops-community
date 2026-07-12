import { IRepositoryPortProject } from '../ports/repository-ports/index.js'
import { ProjectDrizzleRepo, ProjectDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryProject = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortProject>({
  moduleName: 'RepositoryFactoryProject',
  pgRepo: ProjectDrizzleRepo,
  sqliteRepo: ProjectDrizzleSqliteRepo,
})
