import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmFeedbackItem } from '../../../../domain/models/index.js'
import { IRepositoryPortFeedbackItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbFeedbackItemDrizzle, feedbackItemTable } from '../../../db/feedbackItem/drizzle/drizzle.schema.feedbackItem.js'
import { mapperFeedbackItemDrizzle } from '../../../db/feedbackItem/drizzle/drizzle.mapper.feedbackItem.js'

export class FeedbackItemDrizzleRepo extends DraBase<IbmFeedbackItem, IdbFeedbackItemDrizzle, typeof feedbackItemTable> implements IRepositoryPortFeedbackItem {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(feedbackItemTable, { mapper: mapperFeedbackItemDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  //<==//
}
