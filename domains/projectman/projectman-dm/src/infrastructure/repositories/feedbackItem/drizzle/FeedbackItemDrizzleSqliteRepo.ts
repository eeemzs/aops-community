import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmFeedbackItem } from '../../../../domain/models/index.js'
import { IRepositoryPortFeedbackItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbFeedbackItemDrizzleSqlite, feedbackItemTableSqlite } from '../../../db/feedbackItem/drizzle/drizzle.schema.feedbackItem.sqlite.js'
import { mapperFeedbackItemDrizzle } from '../../../db/feedbackItem/drizzle/drizzle.mapper.feedbackItem.js'

export class FeedbackItemDrizzleSqliteRepo
  extends DraBaseSqlite<IbmFeedbackItem, IdbFeedbackItemDrizzleSqlite, typeof feedbackItemTableSqlite>
  implements IRepositoryPortFeedbackItem
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(feedbackItemTableSqlite, { mapper: mapperFeedbackItemDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
