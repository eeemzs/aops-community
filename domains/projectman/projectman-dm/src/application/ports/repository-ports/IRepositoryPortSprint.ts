import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmSprint } from '../../../domain/models/index.js'
import { IdbSprintDrizzle } from '../../../infrastructure/db/sprint/drizzle/drizzle.schema.sprint.js'

/**
 * Repository port for Sprint
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortSprint extends IRepositoryBaseCrud<IbmSprint, IdbSprintDrizzle, RepositoryError> {
  //==> custom-methods
  //<==//
}
