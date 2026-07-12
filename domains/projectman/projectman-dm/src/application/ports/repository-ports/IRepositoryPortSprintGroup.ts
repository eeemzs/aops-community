import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmSprintGroup } from '../../../domain/models/index.js'
import { IdbSprintGroupDrizzle } from '../../../infrastructure/db/sprintGroup/drizzle/drizzle.schema.sprintGroup.js'

/**
 * Repository port for SprintGroup
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortSprintGroup extends IRepositoryBaseCrud<IbmSprintGroup, IdbSprintGroupDrizzle, RepositoryError> {
  //==> custom-methods
  //<==//
}
