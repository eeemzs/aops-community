import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmResource } from '../../../../domain/models/index.js'
import { IRepositoryPortResource } from '../../../../application/ports/repository-ports/index.js'
import { IdbResourceDrizzle, resourceTable } from '../../../db/resource/drizzle/drizzle.schema.resource.js'
import { mapperResourceDrizzle } from '../../../db/resource/drizzle/drizzle.mapper.resource.js'

export class ResourceDrizzleRepo extends DraBase<IbmResource, IdbResourceDrizzle, typeof resourceTable> implements IRepositoryPortResource {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(resourceTable, { mapper: mapperResourceDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmResource>): Effect.Effect<IbmResource | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbResourceDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

