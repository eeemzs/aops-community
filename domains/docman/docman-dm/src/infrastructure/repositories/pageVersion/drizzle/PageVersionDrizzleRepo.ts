import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPageVersion } from '../../../../domain/models/index.js'
import { IRepositoryPortPageVersion } from '../../../../application/ports/repository-ports/index.js'
import { IdbPageVersionDrizzle, pageVersionTable } from '../../../db/pageVersion/drizzle/drizzle.schema.pageVersion.js'
import { mapperPageVersionDrizzle } from '../../../db/pageVersion/drizzle/drizzle.mapper.pageVersion.js'

export class PageVersionDrizzleRepo extends DraBase<IbmPageVersion, IdbPageVersionDrizzle, typeof pageVersionTable> implements IRepositoryPortPageVersion {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(pageVersionTable, { mapper: mapperPageVersionDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmPageVersion>): Effect.Effect<IbmPageVersion | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbPageVersionDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
