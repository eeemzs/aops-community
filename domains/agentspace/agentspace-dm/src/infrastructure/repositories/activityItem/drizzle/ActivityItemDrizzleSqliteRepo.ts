import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmActivityItem } from '../../../../domain/models/index.js'
import { IRepositoryPortActivityItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbActivityItemDrizzleSqlite, activityItemTableSqlite } from '../../../db/activityItem/drizzle/drizzle.schema.activityItem.sqlite.js'
import { mapperActivityItemDrizzle } from '../../../db/activityItem/drizzle/drizzle.mapper.activityItem.js'

export class ActivityItemDrizzleSqliteRepo extends DraBaseSqlite<IbmActivityItem, IdbActivityItemDrizzleSqlite, typeof activityItemTableSqlite> implements IRepositoryPortActivityItem {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(activityItemTableSqlite, { mapper: mapperActivityItemDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
