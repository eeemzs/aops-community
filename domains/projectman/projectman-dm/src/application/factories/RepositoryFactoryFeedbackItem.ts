import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortFeedbackItem } from '../ports/repository-ports/index.js'
import { FeedbackItemDrizzleRepo, FeedbackItemDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const feedbackItemPgFactory = createRepositoryFactory<IRepositoryPortFeedbackItem>({
  moduleName: 'RepositoryFactoryFeedbackItem',
  mongoRepo: undefined,
  drizzleRepo: FeedbackItemDrizzleRepo,
});

const feedbackItemSqliteFactory = createRepositoryFactory<IRepositoryPortFeedbackItem>({
  moduleName: 'RepositoryFactoryFeedbackItemSqlite',
  mongoRepo: undefined,
  drizzleRepo: FeedbackItemDrizzleSqliteRepo,
});

export const RepositoryFactoryFeedbackItem = {
  create(params: Parameters<typeof feedbackItemPgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? feedbackItemSqliteFactory : feedbackItemPgFactory).create(params)
  },
}
