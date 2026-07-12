import { IRepositoryPortTaskChecklistItem } from '../ports/repository-ports/IRepositoryPortTaskChecklistItem.js'
import { TaskChecklistItemDrizzleRepo } from '../../infrastructure/repositories/taskChecklistItem/drizzle/TaskChecklistItemDrizzleRepo.js'
import { TaskChecklistItemDrizzleSqliteRepo } from '../../infrastructure/repositories/taskChecklistItem/drizzle/TaskChecklistItemDrizzleSqliteRepo.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryTaskChecklistItem = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortTaskChecklistItem>({
  moduleName: 'RepositoryFactoryTaskChecklistItem',
  pgRepo: TaskChecklistItemDrizzleRepo,
  sqliteRepo: TaskChecklistItemDrizzleSqliteRepo,
})
