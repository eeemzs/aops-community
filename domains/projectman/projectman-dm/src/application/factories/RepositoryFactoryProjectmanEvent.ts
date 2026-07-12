import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortProjectmanEvent } from '../ports/repository-ports/index.js'
import { ProjectmanEventDrizzleRepo, ProjectmanEventDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const projectmanEventPgFactory = createRepositoryFactory<IRepositoryPortProjectmanEvent>({
  moduleName: 'RepositoryFactoryProjectmanEvent',
  mongoRepo: undefined,
  drizzleRepo: ProjectmanEventDrizzleRepo,
});

const projectmanEventSqliteFactory = createRepositoryFactory<IRepositoryPortProjectmanEvent>({
  moduleName: 'RepositoryFactoryProjectmanEventSqlite',
  mongoRepo: undefined,
  drizzleRepo: ProjectmanEventDrizzleSqliteRepo,
});

export const RepositoryFactoryProjectmanEvent = {
  create(params: Parameters<typeof projectmanEventPgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? projectmanEventSqliteFactory : projectmanEventPgFactory).create(params)
  },
}
