import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmTask } from '../../../domain/models/index.js'
import { IdbTaskDrizzle } from '../../../infrastructure/db/task/drizzle/drizzle.schema.task.js'

/**
 * Repository port for Task
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortTask extends IRepositoryPortBaseCrud<IbmTask, IdbTaskDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmTask>): import('effect').Effect<IbmTask | null, RepositoryError>
  //<==//
}


