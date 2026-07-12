import { Effect } from 'effect'
import type { RepositoryConfig, RepositoryError } from '@aopslab/xf-db'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { XfLogger } from '@aopslab/xf-logger'

import { IbmDiscussionTopic } from '../../../../domain/models/index.js'
import { IRepositoryPortDiscussionTopic } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbDiscussionTopicDrizzle,
  discussionTopicTable,
} from '../../../db/discussionTopic/drizzle/drizzle.schema.discussionTopic.js'
import { mapperDiscussionTopicDrizzle } from '../../../db/discussionTopic/drizzle/drizzle.mapper.discussionTopic.js'

export class DiscussionTopicDrizzleRepo
  extends DraBase<IbmDiscussionTopic, IdbDiscussionTopicDrizzle, typeof discussionTopicTable>
  implements IRepositoryPortDiscussionTopic
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(discussionTopicTable, {
      mapper: mapperDiscussionTopicDrizzle,
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
