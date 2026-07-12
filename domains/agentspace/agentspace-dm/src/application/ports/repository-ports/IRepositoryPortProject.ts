import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmProject } from '../../../domain/models/index.js'
import { IdbProjectDrizzle } from '../../../infrastructure/db/project/drizzle/drizzle.schema.project.js'

/**
 * Repository port for Project
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortProject extends IRepositoryPortBaseCrud<IbmProject, IdbProjectDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmProject>): import('effect').Effect<IbmProject | null, RepositoryError>
  //<==//
}


