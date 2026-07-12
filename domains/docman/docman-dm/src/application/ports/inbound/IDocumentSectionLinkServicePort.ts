import { Effect } from 'effect'
import { DocumentSectionLinkServiceError } from '../../errors/DocumentSectionLinkServiceError.js'
import { IbmDocumentSectionLink, IbmDocumentSectionLinkInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { DocumentSectionLinkUsageItem } from '../repository-ports/IRepositoryPortDocumentSectionLink.js'

export interface IDocumentSectionLinkServicePort {
  getById(id: string, options?: DbQueryOptions<IbmDocumentSectionLink>): Effect.Effect<IbmDocumentSectionLink | null, DocumentSectionLinkServiceError>
  create(data: IbmDocumentSectionLinkInsert): Effect.Effect<IbmDocumentSectionLink, DocumentSectionLinkServiceError>
  listDocumentSectionLinks(filter?: Partial<IbmDocumentSectionLink>, options?: DbQueryOptions<IbmDocumentSectionLink>): Effect.Effect<IbmDocumentSectionLink[], DocumentSectionLinkServiceError>
  updateDocumentSectionLink(id: string, patch: Partial<IbmDocumentSectionLink>): Effect.Effect<IbmDocumentSectionLink, DocumentSectionLinkServiceError>
  removeDocumentSectionLink(id: string): Effect.Effect<void, DocumentSectionLinkServiceError>
  listDocumentSectionLinkUsageBySectionId(
    sectionId: string,
  ): Effect.Effect<DocumentSectionLinkUsageItem[], DocumentSectionLinkServiceError>
  //==> custom-methods
  // getByDummyString(dummy: string): Effect.Effect<IbmDocumentSectionLink | null, DocumentSectionLinkServiceError>
  //<==//
}

export interface IDocumentSectionLinkLookupPort {
  getById(id: string): Effect.Effect<IbmDocumentSectionLink | null, DocumentSectionLinkServiceError>
}
