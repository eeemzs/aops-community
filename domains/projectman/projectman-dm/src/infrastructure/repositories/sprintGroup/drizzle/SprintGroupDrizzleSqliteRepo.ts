import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSprintGroup } from '../../../../domain/models/index.js'
import { IRepositoryPortSprintGroup } from '../../../../application/ports/repository-ports/index.js'
import { IdbSprintGroupDrizzleSqlite, sprintGroupTableSqlite } from '../../../db/sprintGroup/drizzle/drizzle.schema.sprintGroup.sqlite.js'
import { mapperSprintGroupDrizzle } from '../../../db/sprintGroup/drizzle/drizzle.mapper.sprintGroup.js'

export class SprintGroupDrizzleSqliteRepo
  extends DraBaseSqlite<IbmSprintGroup, IdbSprintGroupDrizzleSqlite, typeof sprintGroupTableSqlite>
  implements IRepositoryPortSprintGroup
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(sprintGroupTableSqlite, { mapper: mapperSprintGroupDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
