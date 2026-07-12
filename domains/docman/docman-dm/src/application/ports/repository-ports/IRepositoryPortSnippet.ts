import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmSnippet } from '../../../domain/models/index.js'
import { IdbSnippetDrizzle } from '../../../infrastructure/db/snippet/drizzle/drizzle.schema.snippet.js'

/**
 * Repository port for Snippet
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortSnippet extends IRepositoryBaseCrud<IbmSnippet, IdbSnippetDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmSnippet>): import('effect').Effect<IbmSnippet | null, RepositoryError>
  //<==//
}

