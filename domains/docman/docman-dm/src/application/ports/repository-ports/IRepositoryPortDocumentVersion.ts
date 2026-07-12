import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmDocumentVersion } from '../../../domain/models/index.js'
import { IdbDocumentVersionDrizzle } from '../../../infrastructure/db/documentVersion/drizzle/drizzle.schema.documentVersion.js'

/**
 * Repository port for DocumentVersion
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortDocumentVersion extends IRepositoryBaseCrud<IbmDocumentVersion, IdbDocumentVersionDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmDocumentVersion>): import('effect').Effect<IbmDocumentVersion | null, RepositoryError>
  //<==//
}

