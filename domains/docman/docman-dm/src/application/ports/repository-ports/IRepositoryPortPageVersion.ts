import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmPageVersion } from '../../../domain/models/index.js'
import { IdbPageVersionDrizzle } from '../../../infrastructure/db/pageVersion/drizzle/drizzle.schema.pageVersion.js'

/**
 * Repository port for PageVersion
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortPageVersion extends IRepositoryBaseCrud<IbmPageVersion, IdbPageVersionDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmPageVersion>): import('effect').Effect<IbmPageVersion | null, RepositoryError>
  //<==//
}
