import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmSprintItem } from '../../../domain/models/index.js'
import { IdbSprintItemDrizzle } from '../../../infrastructure/db/sprintItem/drizzle/drizzle.schema.sprintItem.js'

/**
 * Repository port for SprintItem
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortSprintItem extends IRepositoryPortBaseCrud<IbmSprintItem, IdbSprintItemDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmSprintItem>): import('effect').Effect<IbmSprintItem | null, RepositoryError>
  //<==//
}


