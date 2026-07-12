import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { Effect } from 'effect'
import { IbmDocumentSectionLink } from '../../../domain/models/index.js'
import { IdbDocumentSectionLinkDrizzle } from '../../../infrastructure/db/documentSectionLink/drizzle/drizzle.schema.documentSectionLink.js'

export interface DocumentSectionLinkUsageItem {
  id: string
  documentId: string
  documentVersionId: string
  documentVersion: number
  documentTitle: string
  sectionId: string
  position: number
}

/**
 * Repository port for DocumentSectionLink
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortDocumentSectionLink extends IRepositoryBaseCrud<IbmDocumentSectionLink, IdbDocumentSectionLinkDrizzle, RepositoryError> {
  //==> custom-methods
  listDocumentSectionLinkUsageBySectionId(
    sectionId: string,
  ): Effect.Effect<DocumentSectionLinkUsageItem[], RepositoryError>
  //<==//
}
