import { Effect } from 'effect'
import { DocumentGroupServiceError } from '../../errors/DocumentGroupServiceError.js'
import { IbmDocumentGroup, IbmDocumentGroupInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface IDocumentGroupServicePort {
  getById(id: string, options?: DbQueryOptions<IbmDocumentGroup>): Effect.Effect<IbmDocumentGroup | null, DocumentGroupServiceError>
  create(data: IbmDocumentGroupInsert): Effect.Effect<IbmDocumentGroup, DocumentGroupServiceError>
  listDocumentGroups(filter?: Partial<IbmDocumentGroup>, options?: DbQueryOptions<IbmDocumentGroup>): Effect.Effect<IbmDocumentGroup[], DocumentGroupServiceError>
  updateDocumentGroup(id: string, patch: Partial<IbmDocumentGroup>): Effect.Effect<IbmDocumentGroup, DocumentGroupServiceError>
  removeDocumentGroup(id: string): Effect.Effect<void, DocumentGroupServiceError>
  //==> custom-methods
  // getByDummyString(dummy: string): Effect.Effect<IbmDocumentGroup | null, DocumentGroupServiceError>
  //<==//
}

export interface IDocumentGroupLookupPort {
  getById(id: string): Effect.Effect<IbmDocumentGroup | null, DocumentGroupServiceError>
}
