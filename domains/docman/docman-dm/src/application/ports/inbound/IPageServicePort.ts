import { Effect } from 'effect'
import { PageServiceError } from '../../errors/PageServiceError.js'
import { IbmPage, IbmPageInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface IPageServicePort {
  getById(id: string, options?: DbQueryOptions<IbmPage>): Effect.Effect<IbmPage | null, PageServiceError>
  create(data: IbmPageInsert): Effect.Effect<IbmPage, PageServiceError>
  listPages(filter?: Partial<IbmPage>, options?: DbQueryOptions<IbmPage>): Effect.Effect<IbmPage[], PageServiceError>
  updatePage(id: string, patch: Partial<IbmPage>): Effect.Effect<IbmPage, PageServiceError>
  removePage(id: string): Effect.Effect<void, PageServiceError>
  //==> custom-methods
  // getByDummyString(dummy: string): Effect.Effect<IbmPage | null, PageServiceError>
  //<==//
}

export interface IPageLookupPort {
  getById(id: string): Effect.Effect<IbmPage | null, PageServiceError>
}

