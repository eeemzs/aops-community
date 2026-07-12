import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmSprintKanbanTaskLink } from '../../../domain/models/index.js'
import { IdbSprintKanbanTaskLinkDrizzle } from '../../../infrastructure/db/sprintKanbanTaskLink/drizzle/drizzle.schema.sprintKanbanTaskLink.js'

/**
 * Repository port for SprintKanbanTaskLink
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortSprintKanbanTaskLink extends IRepositoryBaseCrud<IbmSprintKanbanTaskLink, IdbSprintKanbanTaskLinkDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here.
  //<==//
}
