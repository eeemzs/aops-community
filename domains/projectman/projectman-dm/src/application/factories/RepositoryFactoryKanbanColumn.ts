import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortKanbanColumn } from '../ports/repository-ports/index.js'
import { KanbanColumnDrizzleRepo, KanbanColumnDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const kanbanColumnPgFactory = createRepositoryFactory<IRepositoryPortKanbanColumn>({
  moduleName: 'RepositoryFactoryKanbanColumn',
  mongoRepo: undefined,
  drizzleRepo: KanbanColumnDrizzleRepo,
});

const kanbanColumnSqliteFactory = createRepositoryFactory<IRepositoryPortKanbanColumn>({
  moduleName: 'RepositoryFactoryKanbanColumnSqlite',
  mongoRepo: undefined,
  drizzleRepo: KanbanColumnDrizzleSqliteRepo,
});

export const RepositoryFactoryKanbanColumn = {
  create(params: Parameters<typeof kanbanColumnPgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? kanbanColumnSqliteFactory : kanbanColumnPgFactory).create(params)
  },
}
