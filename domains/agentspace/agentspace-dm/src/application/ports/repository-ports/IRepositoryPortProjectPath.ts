import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmProjectPath } from '../../../domain/models/index.js'
import { IdbProjectPathDrizzle } from '../../../infrastructure/db/projectPath/drizzle/drizzle.schema.projectPath.js'

/**
 * Repository port for ProjectPath
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortProjectPath extends IRepositoryPortBaseCrud<IbmProjectPath, IdbProjectPathDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmProjectPath>): import('effect').Effect<IbmProjectPath | null, RepositoryError>
  //<==//
}

