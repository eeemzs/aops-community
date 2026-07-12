import { IRepositoryPortTaskLabel } from '../ports/repository-ports/IRepositoryPortTaskLabel.js'
import { TaskLabelDrizzleRepo } from '../../infrastructure/repositories/taskLabel/drizzle/TaskLabelDrizzleRepo.js'
import { TaskLabelDrizzleSqliteRepo } from '../../infrastructure/repositories/taskLabel/drizzle/TaskLabelDrizzleSqliteRepo.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryTaskLabel = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortTaskLabel>({
  moduleName: 'RepositoryFactoryTaskLabel',
  pgRepo: TaskLabelDrizzleRepo,
  sqliteRepo: TaskLabelDrizzleSqliteRepo,
})
