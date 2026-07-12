import { Effect } from 'effect'
import { PageVersionServiceError } from '../../errors/PageVersionServiceError.js'
import { IbmPageVersion, IbmPageVersionInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface IPageVersionServicePort {
  getById(id: string, options?: DbQueryOptions<IbmPageVersion>): Effect.Effect<IbmPageVersion | null, PageVersionServiceError>
  create(data: IbmPageVersionInsert): Effect.Effect<IbmPageVersion, PageVersionServiceError>
  listPageVersions(filter?: Partial<IbmPageVersion>, options?: DbQueryOptions<IbmPageVersion>): Effect.Effect<IbmPageVersion[], PageVersionServiceError>
  updatePageVersion(id: string, patch: Partial<IbmPageVersion>): Effect.Effect<IbmPageVersion, PageVersionServiceError>
  removePageVersion(id: string): Effect.Effect<void, PageVersionServiceError>
  //==> custom-methods
  // getByDummyString(dummy: string): Effect.Effect<IbmPageVersion | null, PageVersionServiceError>
  //<==//
}

export interface IPageVersionLookupPort {
  getById(id: string): Effect.Effect<IbmPageVersion | null, PageVersionServiceError>
}

