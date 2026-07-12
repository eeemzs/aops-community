import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSprintKanbanTaskLink } from '../../../../domain/models/index.js'
import { IRepositoryPortSprintKanbanTaskLink } from '../../../../application/ports/repository-ports/index.js'
import { IdbSprintKanbanTaskLinkDrizzle, sprintKanbanTaskLinkTable } from '../../../db/sprintKanbanTaskLink/drizzle/drizzle.schema.sprintKanbanTaskLink.js'
import { mapperSprintKanbanTaskLinkDrizzle } from '../../../db/sprintKanbanTaskLink/drizzle/drizzle.mapper.sprintKanbanTaskLink.js'

export class SprintKanbanTaskLinkDrizzleRepo extends DraBase<IbmSprintKanbanTaskLink, IdbSprintKanbanTaskLinkDrizzle, typeof sprintKanbanTaskLinkTable> implements IRepositoryPortSprintKanbanTaskLink {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(sprintKanbanTaskLinkTable, { mapper: mapperSprintKanbanTaskLinkDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here.
  //<==//
}
