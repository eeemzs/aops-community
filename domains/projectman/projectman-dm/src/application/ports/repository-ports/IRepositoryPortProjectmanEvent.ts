import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmProjectmanEvent } from '../../../domain/models/index.js'
import { IdbProjectmanEventDrizzle } from '../../../infrastructure/db/projectmanEvent/drizzle/drizzle.schema.projectmanEvent.js'

/**
 * Repository port for ProjectmanEvent
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortProjectmanEvent extends IRepositoryBaseCrud<IbmProjectmanEvent, IdbProjectmanEventDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here.
  //<==//
}
