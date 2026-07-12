import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSprintKanbanTaskLink } from '../../../../domain/models/index.js'
import { IRepositoryPortSprintKanbanTaskLink } from '../../../../application/ports/repository-ports/index.js'
import { IdbSprintKanbanTaskLinkDrizzleSqlite, sprintKanbanTaskLinkTableSqlite } from '../../../db/sprintKanbanTaskLink/drizzle/drizzle.schema.sprintKanbanTaskLink.sqlite.js'
import { mapperSprintKanbanTaskLinkDrizzle } from '../../../db/sprintKanbanTaskLink/drizzle/drizzle.mapper.sprintKanbanTaskLink.js'

export class SprintKanbanTaskLinkDrizzleSqliteRepo
  extends DraBaseSqlite<IbmSprintKanbanTaskLink, IdbSprintKanbanTaskLinkDrizzleSqlite, typeof sprintKanbanTaskLinkTableSqlite>
  implements IRepositoryPortSprintKanbanTaskLink
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(sprintKanbanTaskLinkTableSqlite, { mapper: mapperSprintKanbanTaskLinkDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
