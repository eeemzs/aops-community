import { IRepositoryPortTaskComment } from '../ports/repository-ports/index.js'
import { TaskCommentDrizzleRepo, TaskCommentDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryTaskComment = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortTaskComment>({
  moduleName: 'RepositoryFactoryTaskComment',
  pgRepo: TaskCommentDrizzleRepo,
  sqliteRepo: TaskCommentDrizzleSqliteRepo,
})
