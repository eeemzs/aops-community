import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmEmbed } from '../../../../domain/models/index.js'
import { IRepositoryPortEmbed } from '../../../../application/ports/repository-ports/index.js'
import { IdbEmbedDrizzle, embedTable } from '../../../db/embed/drizzle/drizzle.schema.embed.js'
import { mapperEmbedDrizzle } from '../../../db/embed/drizzle/drizzle.mapper.embed.js'

export class EmbedDrizzleRepo extends DraBase<IbmEmbed, IdbEmbedDrizzle, typeof embedTable> implements IRepositoryPortEmbed {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(embedTable, { mapper: mapperEmbedDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmEmbed>): Effect.Effect<IbmEmbed | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbEmbedDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
