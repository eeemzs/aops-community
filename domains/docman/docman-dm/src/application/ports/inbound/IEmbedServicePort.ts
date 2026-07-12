import { Effect } from 'effect'
import { EmbedServiceError } from '../../errors/EmbedServiceError.js'
import { IbmEmbed, IbmEmbedInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface IEmbedServicePort {
  getById(id: string, options?: DbQueryOptions<IbmEmbed>): Effect.Effect<IbmEmbed | null, EmbedServiceError>
  create(data: IbmEmbedInsert): Effect.Effect<IbmEmbed, EmbedServiceError>
  listEmbeds(filter?: Partial<IbmEmbed>, options?: DbQueryOptions<IbmEmbed>): Effect.Effect<IbmEmbed[], EmbedServiceError>
  updateEmbed(id: string, patch: Partial<IbmEmbed>): Effect.Effect<IbmEmbed, EmbedServiceError>
  removeEmbed(id: string): Effect.Effect<void, EmbedServiceError>

  // getByDummyString(dummy: string): Effect.Effect<IbmEmbed | null, EmbedServiceError>
}

export interface IEmbedLookupPort {
  getById(id: string): Effect.Effect<IbmEmbed | null, EmbedServiceError>
}
