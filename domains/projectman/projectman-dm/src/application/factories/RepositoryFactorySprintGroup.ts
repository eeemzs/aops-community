import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortSprintGroup } from '../ports/repository-ports/index.js'
import { SprintGroupDrizzleRepo, SprintGroupDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const sprintGroupPgFactory = createRepositoryFactory<IRepositoryPortSprintGroup>({
  moduleName: 'RepositoryFactorySprintGroup',
  mongoRepo: undefined,
  drizzleRepo: SprintGroupDrizzleRepo,
});

const sprintGroupSqliteFactory = createRepositoryFactory<IRepositoryPortSprintGroup>({
  moduleName: 'RepositoryFactorySprintGroupSqlite',
  mongoRepo: undefined,
  drizzleRepo: SprintGroupDrizzleSqliteRepo,
});

export const RepositoryFactorySprintGroup = {
  create(params: Parameters<typeof sprintGroupPgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? sprintGroupSqliteFactory : sprintGroupPgFactory).create(params)
  },
}
