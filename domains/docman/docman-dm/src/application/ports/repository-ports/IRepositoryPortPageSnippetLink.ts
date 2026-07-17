import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmPageSnippetLink } from '../../../domain/models/index.js'
import { IdbPageSnippetLinkDrizzle } from '../../../infrastructure/db/pageSnippetLink/drizzle/drizzle.schema.pageSnippetLink.js'

/**
 * Repository port for PageSnippetLink
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortPageSnippetLink extends IRepositoryBaseCrud<IbmPageSnippetLink, IdbPageSnippetLinkDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmPageSnippetLink>): import('effect').Effect<IbmPageSnippetLink | null, RepositoryError>
  //<==//
}
