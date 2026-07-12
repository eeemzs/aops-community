import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmDocument } from '../../../domain/models/index.js'
import { IdbDocumentDrizzle } from '../../../infrastructure/db/document/drizzle/drizzle.schema.document.js'

/**
 * Repository port for Document
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortDocument extends IRepositoryBaseCrud<IbmDocument, IdbDocumentDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmDocument>): import('effect').Effect<IbmDocument | null, RepositoryError>
  //<==//
}

