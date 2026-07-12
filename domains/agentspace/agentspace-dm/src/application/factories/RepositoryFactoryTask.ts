import { IRepositoryPortTask } from '../ports/repository-ports/index.js'
import { TaskDrizzleRepo, TaskDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryTask = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortTask>({
  moduleName: 'RepositoryFactoryTask',
  pgRepo: TaskDrizzleRepo,
  sqliteRepo: TaskDrizzleSqliteRepo,
})
