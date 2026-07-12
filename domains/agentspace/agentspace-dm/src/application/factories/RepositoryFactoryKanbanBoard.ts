import { IRepositoryPortKanbanBoard } from '../ports/repository-ports/index.js'
import { KanbanBoardDrizzleRepo, KanbanBoardDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryKanbanBoard = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortKanbanBoard>({
  moduleName: 'RepositoryFactoryKanbanBoard',
  pgRepo: KanbanBoardDrizzleRepo,
  sqliteRepo: KanbanBoardDrizzleSqliteRepo,
})
