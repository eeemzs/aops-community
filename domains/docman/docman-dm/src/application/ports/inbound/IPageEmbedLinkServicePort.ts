import { Effect } from 'effect'
import { PageEmbedLinkServiceError } from '../../errors/PageEmbedLinkServiceError.js'
import { IbmPageEmbedLink, IbmPageEmbedLinkInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface IPageEmbedLinkServicePort {
  getById(id: string, options?: DbQueryOptions<IbmPageEmbedLink>): Effect.Effect<IbmPageEmbedLink | null, PageEmbedLinkServiceError>
  create(data: IbmPageEmbedLinkInsert): Effect.Effect<IbmPageEmbedLink, PageEmbedLinkServiceError>
  listPageEmbedLinks(filter?: Partial<IbmPageEmbedLink>, options?: DbQueryOptions<IbmPageEmbedLink>): Effect.Effect<IbmPageEmbedLink[], PageEmbedLinkServiceError>
  updatePageEmbedLink(id: string, patch: Partial<IbmPageEmbedLink>): Effect.Effect<IbmPageEmbedLink, PageEmbedLinkServiceError>
  removePageEmbedLink(id: string): Effect.Effect<void, PageEmbedLinkServiceError>

  // getByDummyString(dummy: string): Effect.Effect<IbmPageEmbedLink | null, PageEmbedLinkServiceError>
}

export interface IPageEmbedLinkLookupPort {
  getById(id: string): Effect.Effect<IbmPageEmbedLink | null, PageEmbedLinkServiceError>
}
