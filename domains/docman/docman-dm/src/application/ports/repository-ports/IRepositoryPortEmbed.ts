import { IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { IbmEmbed } from '../../../domain/models/index.js'
import { IdbEmbedDrizzle } from '../../../infrastructure/db/embed/drizzle/drizzle.schema.embed.js'

/**
 * Repository port for Embed
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortEmbed extends IRepositoryBaseCrud<IbmEmbed, IdbEmbedDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmEmbed>): import('effect').Effect<IbmEmbed | null, RepositoryError>
  //<==//
}
