import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortIssueItem } from '../ports/repository-ports/index.js'
import { IssueItemDrizzleRepo, IssueItemDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const issueItemPgFactory = createRepositoryFactory<IRepositoryPortIssueItem>({
  moduleName: 'RepositoryFactoryIssueItem',
  mongoRepo: undefined,
  drizzleRepo: IssueItemDrizzleRepo,
});

const issueItemSqliteFactory = createRepositoryFactory<IRepositoryPortIssueItem>({
  moduleName: 'RepositoryFactoryIssueItemSqlite',
  mongoRepo: undefined,
  drizzleRepo: IssueItemDrizzleSqliteRepo,
});

export const RepositoryFactoryIssueItem = {
  create(params: Parameters<typeof issueItemPgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? issueItemSqliteFactory : issueItemPgFactory).create(params)
  },
}
