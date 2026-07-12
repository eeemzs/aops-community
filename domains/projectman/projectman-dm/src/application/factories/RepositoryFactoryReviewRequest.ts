import { createRepositoryFactory } from '@aopslab/xf-dm'
import { IRepositoryPortReviewRequest } from '../ports/repository-ports/index.js'
import { ReviewRequestDrizzleRepo, ReviewRequestDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { inferDrizzleDialectFromRepositoryConfig } from './drizzleDialect.js'

const reviewRequestPgFactory = createRepositoryFactory<IRepositoryPortReviewRequest>({
  moduleName: 'RepositoryFactoryReviewRequest',
  mongoRepo: undefined,
  drizzleRepo: ReviewRequestDrizzleRepo,
});

const reviewRequestSqliteFactory = createRepositoryFactory<IRepositoryPortReviewRequest>({
  moduleName: 'RepositoryFactoryReviewRequestSqlite',
  mongoRepo: undefined,
  drizzleRepo: ReviewRequestDrizzleSqliteRepo,
});

export const RepositoryFactoryReviewRequest = {
  create(params: Parameters<typeof reviewRequestPgFactory.create>[0]) {
    const dialect = inferDrizzleDialectFromRepositoryConfig(params.repositoryConfig)
    return (dialect === 'sqlite' ? reviewRequestSqliteFactory : reviewRequestPgFactory).create(params)
  },
}
