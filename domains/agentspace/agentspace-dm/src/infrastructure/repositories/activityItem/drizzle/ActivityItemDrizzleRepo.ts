import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmActivityItem } from '../../../../domain/models/index.js'
import { IRepositoryPortActivityItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbActivityItemDrizzle, activityItemTable } from '../../../db/activityItem/drizzle/drizzle.schema.activityItem.js'
import { mapperActivityItemDrizzle } from '../../../db/activityItem/drizzle/drizzle.mapper.activityItem.js'

export class ActivityItemDrizzleRepo extends DraBase<IbmActivityItem, IdbActivityItemDrizzle, typeof activityItemTable> implements IRepositoryPortActivityItem {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(activityItemTable, { mapper: mapperActivityItemDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
