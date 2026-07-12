import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPageEmbedLink } from '../../../../domain/models/index.js'
import { IRepositoryPortPageEmbedLink } from '../../../../application/ports/repository-ports/index.js'
import { IdbPageEmbedLinkDrizzle, pageEmbedLinkTable } from '../../../db/pageEmbedLink/drizzle/drizzle.schema.pageEmbedLink.js'
import { mapperPageEmbedLinkDrizzle } from '../../../db/pageEmbedLink/drizzle/drizzle.mapper.pageEmbedLink.js'

export class PageEmbedLinkDrizzleRepo extends DraBase<IbmPageEmbedLink, IdbPageEmbedLinkDrizzle, typeof pageEmbedLinkTable> implements IRepositoryPortPageEmbedLink {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(pageEmbedLinkTable, { mapper: mapperPageEmbedLinkDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmPageEmbedLink>): Effect.Effect<IbmPageEmbedLink | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbPageEmbedLinkDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
