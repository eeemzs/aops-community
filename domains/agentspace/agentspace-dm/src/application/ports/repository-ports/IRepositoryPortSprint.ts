import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmSprint } from '../../../domain/models/index.js'
import { IdbSprintDrizzle } from '../../../infrastructure/db/sprint/drizzle/drizzle.schema.sprint.js'

/**
 * Repository port for Sprint
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortSprint extends IRepositoryPortBaseCrud<IbmSprint, IdbSprintDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmSprint>): import('effect').Effect<IbmSprint | null, RepositoryError>
  //<==//
}


