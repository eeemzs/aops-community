import { IRepositoryPortProjectPath } from '../ports/repository-ports/index.js'
import { ProjectPathDrizzleRepo, ProjectPathDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryProjectPath = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortProjectPath>({
  moduleName: 'RepositoryFactoryProjectPath',
  pgRepo: ProjectPathDrizzleRepo,
  sqliteRepo: ProjectPathDrizzleSqliteRepo,
})
