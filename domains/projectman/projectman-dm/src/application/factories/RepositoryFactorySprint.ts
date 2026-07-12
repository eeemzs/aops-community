import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortSprint } from '../ports/repository-ports/index.js'
import { SprintDrizzleRepo, SprintDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const sprintPgFactory = createRepositoryFactory<IRepositoryPortSprint>({
  moduleName: 'RepositoryFactorySprint',
  mongoRepo: undefined,
  drizzleRepo: SprintDrizzleRepo,
});

const sprintSqliteFactory = createRepositoryFactory<IRepositoryPortSprint>({
  moduleName: 'RepositoryFactorySprintSqlite',
  mongoRepo: undefined,
  drizzleRepo: SprintDrizzleSqliteRepo,
});

export const RepositoryFactorySprint = {
  create(params: Parameters<typeof sprintPgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? sprintSqliteFactory : sprintPgFactory).create(params)
  },
}
