import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmProjectmanEvent } from '../../../../domain/models/index.js'
import { IRepositoryPortProjectmanEvent } from '../../../../application/ports/repository-ports/index.js'
import { IdbProjectmanEventDrizzleSqlite, projectmanEventTableSqlite } from '../../../db/projectmanEvent/drizzle/drizzle.schema.projectmanEvent.sqlite.js'
import { mapperProjectmanEventDrizzle } from '../../../db/projectmanEvent/drizzle/drizzle.mapper.projectmanEvent.js'

export class ProjectmanEventDrizzleSqliteRepo
  extends DraBaseSqlite<IbmProjectmanEvent, IdbProjectmanEventDrizzleSqlite, typeof projectmanEventTableSqlite>
  implements IRepositoryPortProjectmanEvent
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(projectmanEventTableSqlite, { mapper: mapperProjectmanEventDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
