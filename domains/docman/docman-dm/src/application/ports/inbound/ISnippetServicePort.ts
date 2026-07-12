import { Effect } from 'effect'
import { SnippetServiceError } from '../../errors/SnippetServiceError.js'
import { IbmSnippet, IbmSnippetInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface ISnippetServicePort {
  getById(id: string, options?: DbQueryOptions<IbmSnippet>): Effect.Effect<IbmSnippet | null, SnippetServiceError>
  create(data: IbmSnippetInsert): Effect.Effect<IbmSnippet, SnippetServiceError>
  listSnippets(filter?: Partial<IbmSnippet>, options?: DbQueryOptions<IbmSnippet>): Effect.Effect<IbmSnippet[], SnippetServiceError>
  updateSnippet(id: string, patch: Partial<IbmSnippet>): Effect.Effect<IbmSnippet, SnippetServiceError>
  removeSnippet(id: string): Effect.Effect<void, SnippetServiceError>
  //==> custom-methods
  // getByDummyString(dummy: string): Effect.Effect<IbmSnippet | null, SnippetServiceError>
  //<==//
}

export interface ISnippetLookupPort {
  getById(id: string): Effect.Effect<IbmSnippet | null, SnippetServiceError>
}

