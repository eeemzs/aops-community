import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmReviewRequest } from '../../../domain/models/index.js'
import { IdbReviewRequestDrizzle } from '../../../infrastructure/db/reviewRequest/drizzle/drizzle.schema.reviewRequest.js'

/**
 * Repository port for ReviewRequest
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortReviewRequest extends IRepositoryBaseCrud<IbmReviewRequest, IdbReviewRequestDrizzle, RepositoryError> {
  //==> custom-methods
  //<==//
}
