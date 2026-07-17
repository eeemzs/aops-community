import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSnippet } from '../../../../domain/models/index.js'
import { IRepositoryPortSnippet } from '../../../../application/ports/repository-ports/index.js'
import { IdbSnippetDrizzle, snippetTable } from '../../../db/snippet/drizzle/drizzle.schema.snippet.js'
import { mapperSnippetDrizzle } from '../../../db/snippet/drizzle/drizzle.mapper.snippet.js'

export class SnippetDrizzleRepo extends DraBase<IbmSnippet, IdbSnippetDrizzle, typeof snippetTable> implements IRepositoryPortSnippet {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(snippetTable, { mapper: mapperSnippetDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmSnippet>): Effect.Effect<IbmSnippet | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbSnippetDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
