import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmPageEmbedLink } from '../../../domain/models/index.js'
import { IdbPageEmbedLinkDrizzle } from '../../../infrastructure/db/pageEmbedLink/drizzle/drizzle.schema.pageEmbedLink.js'

/**
 * Repository port for PageEmbedLink
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortPageEmbedLink extends IRepositoryBaseCrud<IbmPageEmbedLink, IdbPageEmbedLinkDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmPageEmbedLink>): import('effect').Effect<IbmPageEmbedLink | null, RepositoryError>
  //<==//
}
