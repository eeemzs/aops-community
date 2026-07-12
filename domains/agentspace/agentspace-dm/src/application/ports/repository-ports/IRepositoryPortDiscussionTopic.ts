import { Effect } from 'effect'
import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmDiscussionTopic } from '../../../domain/models/index.js'
import { IdbDiscussionTopicDrizzle } from '../../../infrastructure/db/discussionTopic/drizzle/drizzle.schema.discussionTopic.js'

/**
 * Repository port for DiscussionTopic.
 */
export interface IRepositoryPortDiscussionTopic
  extends IRepositoryPortBaseCrud<IbmDiscussionTopic, IdbDiscussionTopicDrizzle, RepositoryError> {
  allocateNextSeq(
    topicId: string,
    patch?: Partial<IbmDiscussionTopic>
  ): Effect.Effect<IbmDiscussionTopic, RepositoryError>
}
