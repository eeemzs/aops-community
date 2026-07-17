import { Effect } from 'effect'
import { SectionPageLinkServiceError } from '../../errors/SectionPageLinkServiceError.js'
import { IbmSectionPageLink, IbmSectionPageLinkInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface ISectionPageLinkServicePort {
  getById(id: string, options?: DbQueryOptions<IbmSectionPageLink>): Effect.Effect<IbmSectionPageLink | null, SectionPageLinkServiceError>
  create(data: IbmSectionPageLinkInsert): Effect.Effect<IbmSectionPageLink, SectionPageLinkServiceError>
  listSectionPageLinks(filter?: Partial<IbmSectionPageLink>, options?: DbQueryOptions<IbmSectionPageLink>): Effect.Effect<IbmSectionPageLink[], SectionPageLinkServiceError>
  updateSectionPageLink(id: string, patch: Partial<IbmSectionPageLink>): Effect.Effect<IbmSectionPageLink, SectionPageLinkServiceError>
  removeSectionPageLink(id: string): Effect.Effect<void, SectionPageLinkServiceError>
  //==> custom-methods
  // getByDummyString(dummy: string): Effect.Effect<IbmSectionPageLink | null, SectionPageLinkServiceError>
  //<==//
}

export interface ISectionPageLinkLookupPort {
  getById(id: string): Effect.Effect<IbmSectionPageLink | null, SectionPageLinkServiceError>
}
