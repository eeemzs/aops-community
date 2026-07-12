import { IRepositoryPortTaskRelation } from '../ports/repository-ports/IRepositoryPortTaskRelation.js'
import { TaskRelationDrizzleRepo } from '../../infrastructure/repositories/taskRelation/drizzle/TaskRelationDrizzleRepo.js'
import { TaskRelationDrizzleSqliteRepo } from '../../infrastructure/repositories/taskRelation/drizzle/TaskRelationDrizzleSqliteRepo.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryTaskRelation = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortTaskRelation>({
  moduleName: 'RepositoryFactoryTaskRelation',
  pgRepo: TaskRelationDrizzleRepo,
  sqliteRepo: TaskRelationDrizzleSqliteRepo,
})
