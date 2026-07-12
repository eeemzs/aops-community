import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmSection } from '../../../domain/models/index.js'
import { IdbSectionDrizzle } from '../../../infrastructure/db/section/drizzle/drizzle.schema.section.js'

/**
 * Repository port for Section
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortSection extends IRepositoryBaseCrud<IbmSection, IdbSectionDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmSection>): import('effect').Effect<IbmSection | null, RepositoryError>
  //<==//
}

