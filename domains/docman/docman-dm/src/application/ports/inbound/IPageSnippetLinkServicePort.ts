import { Effect } from 'effect'
import { PageSnippetLinkServiceError } from '../../errors/PageSnippetLinkServiceError.js'
import { IbmPageSnippetLink, IbmPageSnippetLinkInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface IPageSnippetLinkServicePort {
  getById(id: string, options?: DbQueryOptions<IbmPageSnippetLink>): Effect.Effect<IbmPageSnippetLink | null, PageSnippetLinkServiceError>
  create(data: IbmPageSnippetLinkInsert): Effect.Effect<IbmPageSnippetLink, PageSnippetLinkServiceError>
  listPageSnippetLinks(filter?: Partial<IbmPageSnippetLink>, options?: DbQueryOptions<IbmPageSnippetLink>): Effect.Effect<IbmPageSnippetLink[], PageSnippetLinkServiceError>
  updatePageSnippetLink(id: string, patch: Partial<IbmPageSnippetLink>): Effect.Effect<IbmPageSnippetLink, PageSnippetLinkServiceError>
  removePageSnippetLink(id: string): Effect.Effect<void, PageSnippetLinkServiceError>
  //==> custom-methods
  // getByDummyString(dummy: string): Effect.Effect<IbmPageSnippetLink | null, PageSnippetLinkServiceError>
  //<==//
}

export interface IPageSnippetLinkLookupPort {
  getById(id: string): Effect.Effect<IbmPageSnippetLink | null, PageSnippetLinkServiceError>
}
