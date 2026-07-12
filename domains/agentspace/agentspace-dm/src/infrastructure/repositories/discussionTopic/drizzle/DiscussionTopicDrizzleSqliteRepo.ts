import { Effect } from 'effect'
import type { RepositoryConfig, RepositoryError } from '@aopslab/xf-db'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { XfLogger } from '@aopslab/xf-logger'

import { IbmDiscussionTopic } from '../../../../domain/models/index.js'
import { IRepositoryPortDiscussionTopic } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbDiscussionTopicDrizzleSqlite,
  discussionTopicTableSqlite,
} from '../../../db/discussionTopic/drizzle/drizzle.schema.discussionTopic.sqlite.js'
import { mapperDiscussionTopicDrizzle } from '../../../db/discussionTopic/drizzle/drizzle.mapper.discussionTopic.js'

export class DiscussionTopicDrizzleSqliteRepo
  extends DraBaseSqlite<IbmDiscussionTopic, IdbDiscussionTopicDrizzleSqlite, typeof discussionTopicTableSqlite>
  implements IRepositoryPortDiscussionTopic
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(discussionTopicTableSqlite, {
      mapper: mapperDiscussionTopicDrizzle as any,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }

  allocateNextSeq(
    topicId: string,
    patch: Partial<IbmDiscussionTopic> = {}
  ): Effect.Effect<IbmDiscussionTopic, RepositoryError> {
    return this.findSingle({ matchEq: { id: topicId } as any, forUpdate: true }).pipe(
      Effect.flatMap((topic) =>
        this.patchById(topicId, {
          ...patch,
          lastSeq: Number(topic.lastSeq ?? 0) + 1,
        })
      )
    ) as Effect.Effect<IbmDiscussionTopic, RepositoryError>
  }
}
