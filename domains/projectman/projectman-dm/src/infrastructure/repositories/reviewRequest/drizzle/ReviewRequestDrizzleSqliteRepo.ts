import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmReviewRequest } from '../../../../domain/models/index.js'
import { IRepositoryPortReviewRequest } from '../../../../application/ports/repository-ports/index.js'
import { IdbReviewRequestDrizzleSqlite, reviewRequestTableSqlite } from '../../../db/reviewRequest/drizzle/drizzle.schema.reviewRequest.sqlite.js'
import { mapperReviewRequestDrizzle } from '../../../db/reviewRequest/drizzle/drizzle.mapper.reviewRequest.js'

export class ReviewRequestDrizzleSqliteRepo
  extends DraBaseSqlite<IbmReviewRequest, IdbReviewRequestDrizzleSqlite, typeof reviewRequestTableSqlite>
  implements IRepositoryPortReviewRequest
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(reviewRequestTableSqlite, { mapper: mapperReviewRequestDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
