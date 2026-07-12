import { IRepositoryPortTaskLabelLink } from '../ports/repository-ports/IRepositoryPortTaskLabelLink.js'
import { TaskLabelLinkDrizzleRepo } from '../../infrastructure/repositories/taskLabelLink/drizzle/TaskLabelLinkDrizzleRepo.js'
import { TaskLabelLinkDrizzleSqliteRepo } from '../../infrastructure/repositories/taskLabelLink/drizzle/TaskLabelLinkDrizzleSqliteRepo.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryTaskLabelLink = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortTaskLabelLink>({
  moduleName: 'RepositoryFactoryTaskLabelLink',
  pgRepo: TaskLabelLinkDrizzleRepo,
  sqliteRepo: TaskLabelLinkDrizzleSqliteRepo,
})
