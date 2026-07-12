import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmPage } from '../../../domain/models/index.js'
import { IdbPageDrizzle } from '../../../infrastructure/db/page/drizzle/drizzle.schema.page.js'

/**
 * Repository port for Page
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortPage extends IRepositoryBaseCrud<IbmPage, IdbPageDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmPage>): import('effect').Effect<IbmPage | null, RepositoryError>
  //<==//
}

