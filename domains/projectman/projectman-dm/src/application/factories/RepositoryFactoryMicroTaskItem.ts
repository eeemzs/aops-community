import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortMicroTaskItem } from '../ports/repository-ports/index.js'
import { MicroTaskItemDrizzleRepo, MicroTaskItemDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const microTaskItemPgFactory = createRepositoryFactory<IRepositoryPortMicroTaskItem>({
  moduleName: 'RepositoryFactoryMicroTaskItem',
  mongoRepo: undefined,
  drizzleRepo: MicroTaskItemDrizzleRepo,
});

const microTaskItemSqliteFactory = createRepositoryFactory<IRepositoryPortMicroTaskItem>({
  moduleName: 'RepositoryFactoryMicroTaskItemSqlite',
  mongoRepo: undefined,
  drizzleRepo: MicroTaskItemDrizzleSqliteRepo,
});

export const RepositoryFactoryMicroTaskItem = {
  create(params: Parameters<typeof microTaskItemPgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? microTaskItemSqliteFactory : microTaskItemPgFactory).create(params)
  },
}
