import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmReviewRequest } from '../../../../domain/models/index.js'
import { IRepositoryPortReviewRequest } from '../../../../application/ports/repository-ports/index.js'
import { IdbReviewRequestDrizzle, reviewRequestTable } from '../../../db/reviewRequest/drizzle/drizzle.schema.reviewRequest.js'
import { mapperReviewRequestDrizzle } from '../../../db/reviewRequest/drizzle/drizzle.mapper.reviewRequest.js'

export class ReviewRequestDrizzleRepo extends DraBase<IbmReviewRequest, IdbReviewRequestDrizzle, typeof reviewRequestTable> implements IRepositoryPortReviewRequest {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(reviewRequestTable, { mapper: mapperReviewRequestDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  //<==//
}
