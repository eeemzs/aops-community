import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmResource } from '../../../domain/models/index.js'
import { IdbResourceDrizzle } from '../../../infrastructure/db/resource/drizzle/drizzle.schema.resource.js'

/**
 * Repository port for Resource
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortResource extends IRepositoryPortBaseCrud<IbmResource, IdbResourceDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmResource>): import('effect').Effect<IbmResource | null, RepositoryError>
  //<==//
}


