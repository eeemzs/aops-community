import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmMicroTaskItem } from '../../../../domain/models/index.js'
import { IRepositoryPortMicroTaskItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbMicroTaskItemDrizzleSqlite, microTaskItemTableSqlite } from '../../../db/microTaskItem/drizzle/drizzle.schema.microTaskItem.sqlite.js'
import { mapperMicroTaskItemDrizzle } from '../../../db/microTaskItem/drizzle/drizzle.mapper.microTaskItem.js'

export class MicroTaskItemDrizzleSqliteRepo
  extends DraBaseSqlite<IbmMicroTaskItem, IdbMicroTaskItemDrizzleSqlite, typeof microTaskItemTableSqlite>
  implements IRepositoryPortMicroTaskItem
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(microTaskItemTableSqlite, { mapper: mapperMicroTaskItemDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
