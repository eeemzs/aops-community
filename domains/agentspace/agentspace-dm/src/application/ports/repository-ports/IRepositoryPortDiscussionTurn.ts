import type { DbQueryOptions, RepositoryError } from '@aopslab/xf-db'
import { Effect } from 'effect'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmDiscussionTurn } from '../../../domain/models/index.js'
import { IdbDiscussionTurnDrizzle } from '../../../infrastructure/db/discussionTurn/drizzle/drizzle.schema.discussionTurn.js'

/**
 * Repository port for DiscussionTurn.
 */
export interface IRepositoryPortDiscussionTurn
  extends IRepositoryPortBaseCrud<IbmDiscussionTurn, IdbDiscussionTurnDrizzle, RepositoryError> {
  listTopicTurnsAfterSeq(
    topicId: string,
    afterSeq: number,
    options?: DbQueryOptions<IbmDiscussionTurn>
  ): Effect.Effect<IbmDiscussionTurn[], RepositoryError>
}
