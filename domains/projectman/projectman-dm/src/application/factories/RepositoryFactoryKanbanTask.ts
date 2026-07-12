import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortKanbanTask } from '../ports/repository-ports/index.js'
import { KanbanTaskDrizzleRepo, KanbanTaskDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const kanbanTaskPgFactory = createRepositoryFactory<IRepositoryPortKanbanTask>({
  moduleName: 'RepositoryFactoryKanbanTask',
  mongoRepo: undefined,
  drizzleRepo: KanbanTaskDrizzleRepo,
});

const kanbanTaskSqliteFactory = createRepositoryFactory<IRepositoryPortKanbanTask>({
  moduleName: 'RepositoryFactoryKanbanTaskSqlite',
  mongoRepo: undefined,
  drizzleRepo: KanbanTaskDrizzleSqliteRepo,
});

export const RepositoryFactoryKanbanTask = {
  create(params: Parameters<typeof kanbanTaskPgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? kanbanTaskSqliteFactory : kanbanTaskPgFactory).create(params)
  },
}
