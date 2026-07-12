import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortKanbanBoard } from '../ports/repository-ports/index.js'
import { KanbanBoardDrizzleRepo, KanbanBoardDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const kanbanBoardPgFactory = createRepositoryFactory<IRepositoryPortKanbanBoard>({
  moduleName: 'RepositoryFactoryKanbanBoard',
  mongoRepo: undefined,
  drizzleRepo: KanbanBoardDrizzleRepo,
});

const kanbanBoardSqliteFactory = createRepositoryFactory<IRepositoryPortKanbanBoard>({
  moduleName: 'RepositoryFactoryKanbanBoardSqlite',
  mongoRepo: undefined,
  drizzleRepo: KanbanBoardDrizzleSqliteRepo,
});

export const RepositoryFactoryKanbanBoard = {
  create(params: Parameters<typeof kanbanBoardPgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? kanbanBoardSqliteFactory : kanbanBoardPgFactory).create(params)
  },
}
