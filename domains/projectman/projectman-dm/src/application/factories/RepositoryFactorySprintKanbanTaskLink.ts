import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortSprintKanbanTaskLink } from '../ports/repository-ports/index.js'
import { SprintKanbanTaskLinkDrizzleRepo, SprintKanbanTaskLinkDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const sprintKanbanTaskLinkPgFactory = createRepositoryFactory<IRepositoryPortSprintKanbanTaskLink>({
  moduleName: 'RepositoryFactorySprintKanbanTaskLink',
  mongoRepo: undefined,
  drizzleRepo: SprintKanbanTaskLinkDrizzleRepo,
});

const sprintKanbanTaskLinkSqliteFactory = createRepositoryFactory<IRepositoryPortSprintKanbanTaskLink>({
  moduleName: 'RepositoryFactorySprintKanbanTaskLinkSqlite',
  mongoRepo: undefined,
  drizzleRepo: SprintKanbanTaskLinkDrizzleSqliteRepo,
});

export const RepositoryFactorySprintKanbanTaskLink = {
  create(params: Parameters<typeof sprintKanbanTaskLinkPgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? sprintKanbanTaskLinkSqliteFactory : sprintKanbanTaskLinkPgFactory).create(params)
  },
}
