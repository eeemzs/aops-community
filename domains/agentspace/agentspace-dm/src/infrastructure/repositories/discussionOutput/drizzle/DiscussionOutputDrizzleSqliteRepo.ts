import type { RepositoryConfig } from '@aopslab/xf-db'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { XfLogger } from '@aopslab/xf-logger'

import { IbmDiscussionOutput } from '../../../../domain/models/index.js'
import { IRepositoryPortDiscussionOutput } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbDiscussionOutputDrizzleSqlite,
  discussionOutputTableSqlite,
} from '../../../db/discussionOutput/drizzle/drizzle.schema.discussionOutput.sqlite.js'
import { mapperDiscussionOutputDrizzle } from '../../../db/discussionOutput/drizzle/drizzle.mapper.discussionOutput.js'

export class DiscussionOutputDrizzleSqliteRepo
  extends DraBaseSqlite<IbmDiscussionOutput, IdbDiscussionOutputDrizzleSqlite, typeof discussionOutputTableSqlite>
  implements IRepositoryPortDiscussionOutput
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(discussionOutputTableSqlite, {
      mapper: mapperDiscussionOutputDrizzle as any,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
