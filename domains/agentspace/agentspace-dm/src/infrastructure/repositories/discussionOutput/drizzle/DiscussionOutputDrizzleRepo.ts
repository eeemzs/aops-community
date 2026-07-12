import type { RepositoryConfig } from '@aopslab/xf-db'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { XfLogger } from '@aopslab/xf-logger'

import { IbmDiscussionOutput } from '../../../../domain/models/index.js'
import { IRepositoryPortDiscussionOutput } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbDiscussionOutputDrizzle,
  discussionOutputTable,
} from '../../../db/discussionOutput/drizzle/drizzle.schema.discussionOutput.js'
import { mapperDiscussionOutputDrizzle } from '../../../db/discussionOutput/drizzle/drizzle.mapper.discussionOutput.js'

export class DiscussionOutputDrizzleRepo
  extends DraBase<IbmDiscussionOutput, IdbDiscussionOutputDrizzle, typeof discussionOutputTable>
  implements IRepositoryPortDiscussionOutput
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(discussionOutputTable, {
      mapper: mapperDiscussionOutputDrizzle,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
