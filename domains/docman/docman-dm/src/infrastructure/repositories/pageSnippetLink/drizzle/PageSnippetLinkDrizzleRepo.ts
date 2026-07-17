import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPageSnippetLink } from '../../../../domain/models/index.js'
import { IRepositoryPortPageSnippetLink } from '../../../../application/ports/repository-ports/index.js'
import { IdbPageSnippetLinkDrizzle, pageSnippetLinkTable } from '../../../db/pageSnippetLink/drizzle/drizzle.schema.pageSnippetLink.js'
import { mapperPageSnippetLinkDrizzle } from '../../../db/pageSnippetLink/drizzle/drizzle.mapper.pageSnippetLink.js'

export class PageSnippetLinkDrizzleRepo extends DraBase<IbmPageSnippetLink, IdbPageSnippetLinkDrizzle, typeof pageSnippetLinkTable> implements IRepositoryPortPageSnippetLink {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(pageSnippetLinkTable, { mapper: mapperPageSnippetLinkDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmPageSnippetLink>): Effect.Effect<IbmPageSnippetLink | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbPageSnippetLinkDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
