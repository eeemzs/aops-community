import { IRepositoryPortKanbanColumn } from '../ports/repository-ports/index.js'
import { KanbanColumnDrizzleRepo, KanbanColumnDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryKanbanColumn = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortKanbanColumn>({
  moduleName: 'RepositoryFactoryKanbanColumn',
  pgRepo: KanbanColumnDrizzleRepo,
  sqliteRepo: KanbanColumnDrizzleSqliteRepo,
})
