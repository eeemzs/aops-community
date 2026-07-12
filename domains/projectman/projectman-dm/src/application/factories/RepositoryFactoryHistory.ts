import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortHistory } from '../ports/repository-ports/index.js'
import { HistoryDrizzleRepo, HistoryDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const historyPgFactory = createRepositoryFactory<IRepositoryPortHistory>({
  moduleName: 'RepositoryFactoryHistory',
  mongoRepo: undefined,
  drizzleRepo: HistoryDrizzleRepo,
});

const historySqliteFactory = createRepositoryFactory<IRepositoryPortHistory>({
  moduleName: 'RepositoryFactoryHistorySqlite',
  mongoRepo: undefined,
  drizzleRepo: HistoryDrizzleSqliteRepo,
});

export const RepositoryFactoryHistory = {
  create(params: Parameters<typeof historyPgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? historySqliteFactory : historyPgFactory).create(params)
  },
}
