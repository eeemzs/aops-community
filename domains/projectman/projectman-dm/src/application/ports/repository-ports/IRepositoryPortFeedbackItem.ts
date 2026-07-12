import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmFeedbackItem } from '../../../domain/models/index.js'
import { IdbFeedbackItemDrizzle } from '../../../infrastructure/db/feedbackItem/drizzle/drizzle.schema.feedbackItem.js'

/**
 * Repository port for FeedbackItem
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortFeedbackItem extends IRepositoryBaseCrud<IbmFeedbackItem, IdbFeedbackItemDrizzle, RepositoryError> {
  //==> custom-methods
  //<==//
}
