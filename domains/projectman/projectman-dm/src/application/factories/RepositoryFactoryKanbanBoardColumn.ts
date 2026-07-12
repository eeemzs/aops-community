import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortKanbanBoardColumn } from '../ports/repository-ports/index.js'
import { KanbanBoardColumnDrizzleRepo, KanbanBoardColumnDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const kanbanBoardColumnPgFactory = createRepositoryFactory<IRepositoryPortKanbanBoardColumn>({
  moduleName: 'RepositoryFactoryKanbanBoardColumn',
  mongoRepo: undefined,
  drizzleRepo: KanbanBoardColumnDrizzleRepo,
});

const kanbanBoardColumnSqliteFactory = createRepositoryFactory<IRepositoryPortKanbanBoardColumn>({
  moduleName: 'RepositoryFactoryKanbanBoardColumnSqlite',
  mongoRepo: undefined,
  drizzleRepo: KanbanBoardColumnDrizzleSqliteRepo,
});

export const RepositoryFactoryKanbanBoardColumn = {
  create(params: Parameters<typeof kanbanBoardColumnPgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? kanbanBoardColumnSqliteFactory : kanbanBoardColumnPgFactory).create(params)
  },
}
