import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmDocumentGroup } from '../../../domain/models/index.js'
import { IdbDocumentGroupDrizzle } from '../../../infrastructure/db/documentGroup/drizzle/drizzle.schema.documentGroup.js'

/**
 * Repository port for DocumentGroup
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortDocumentGroup extends IRepositoryBaseCrud<IbmDocumentGroup, IdbDocumentGroupDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmDocumentGroup>): import('effect').Effect<IbmDocumentGroup | null, RepositoryError>
  //<==//
}
