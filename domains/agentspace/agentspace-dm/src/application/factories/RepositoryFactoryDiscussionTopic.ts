import { IRepositoryPortDiscussionTopic } from '../ports/repository-ports/index.js'
import { DiscussionTopicDrizzleRepo, DiscussionTopicDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryDiscussionTopic = createAgentspaceDrizzleRepositoryFactory<IRepositoryPortDiscussionTopic>({
  moduleName: 'RepositoryFactoryDiscussionTopic',
  pgRepo: DiscussionTopicDrizzleRepo,
  sqliteRepo: DiscussionTopicDrizzleSqliteRepo,
})
