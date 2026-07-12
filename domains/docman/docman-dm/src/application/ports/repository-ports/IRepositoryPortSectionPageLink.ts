import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmSectionPageLink } from '../../../domain/models/index.js'
import { IdbSectionPageLinkDrizzle } from '../../../infrastructure/db/sectionPageLink/drizzle/drizzle.schema.sectionPageLink.js'

/**
 * Repository port for SectionPageLink
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortSectionPageLink extends IRepositoryBaseCrud<IbmSectionPageLink, IdbSectionPageLinkDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmSectionPageLink>): import('effect').Effect<IbmSectionPageLink | null, RepositoryError>
  //<==//
}

