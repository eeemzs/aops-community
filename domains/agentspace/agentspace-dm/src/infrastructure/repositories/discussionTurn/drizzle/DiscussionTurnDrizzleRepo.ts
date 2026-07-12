import { Effect } from 'effect'
import { and, eq, gt } from 'drizzle-orm'
import type { DbQueryOptions, RepositoryConfig, RepositoryError } from '@aopslab/xf-db'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { XfLogger } from '@aopslab/xf-logger'

import { IbmDiscussionTurn } from '../../../../domain/models/index.js'
import { IRepositoryPortDiscussionTurn } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbDiscussionTurnDrizzle,
  discussionTurnTable,
} from '../../../db/discussionTurn/drizzle/drizzle.schema.discussionTurn.js'
import { mapperDiscussionTurnDrizzle } from '../../../db/discussionTurn/drizzle/drizzle.mapper.discussionTurn.js'

export class DiscussionTurnDrizzleRepo
  extends DraBase<IbmDiscussionTurn, IdbDiscussionTurnDrizzle, typeof discussionTurnTable>
  implements IRepositoryPortDiscussionTurn
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(discussionTurnTable, {
      mapper: mapperDiscussionTurnDrizzle,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }

  listTopicTurnsAfterSeq(
    topicId: string,
    afterSeq: number,
    options?: DbQueryOptions<IbmDiscussionTurn>
  ): Effect.Effect<IbmDiscussionTurn[], RepositoryError> {
    const queryOptions = {
      ...(options as Record<string, unknown> | undefined),
      sort: (options as any)?.sort ?? ([{ field: 'seq', type: 'asc' }] as any),
    } as DbQueryOptions<IdbDiscussionTurnDrizzle>
    return this.find({
      match: and(eq(discussionTurnTable.topicId, topicId), gt(discussionTurnTable.seq, afterSeq)),
      options: queryOptions,
    }) as Effect.Effect<IbmDiscussionTurn[], RepositoryError>
  }
}
