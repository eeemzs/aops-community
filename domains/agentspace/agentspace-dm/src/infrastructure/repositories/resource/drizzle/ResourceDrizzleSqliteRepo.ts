import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmResource } from '../../../../domain/models/index.js'
import { IRepositoryPortResource } from '../../../../application/ports/repository-ports/index.js'
import { IdbResourceDrizzleSqlite, resourceTableSqlite } from '../../../db/resource/drizzle/drizzle.schema.resource.sqlite.js'
import { mapperResourceDrizzle } from '../../../db/resource/drizzle/drizzle.mapper.resource.js'

export class ResourceDrizzleSqliteRepo extends DraBaseSqlite<IbmResource, IdbResourceDrizzleSqlite, typeof resourceTableSqlite> implements IRepositoryPortResource {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(resourceTableSqlite, { mapper: mapperResourceDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmResource>): Effect.Effect<IbmResource | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbResourceDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
