import { IRepositoryPortDiscussionTurn } from '../ports/repository-ports/index.js'
import { DiscussionTurnDrizzleRepo, DiscussionTurnDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryDiscussionTurn = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortDiscussionTurn>({
  moduleName: 'RepositoryFactoryDiscussionTurn',
  pgRepo: DiscussionTurnDrizzleRepo,
  sqliteRepo: DiscussionTurnDrizzleSqliteRepo,
})
