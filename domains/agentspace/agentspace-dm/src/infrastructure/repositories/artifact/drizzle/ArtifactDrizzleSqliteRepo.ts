import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmArtifact } from '../../../../domain/models/index.js'
import { IRepositoryPortArtifact } from '../../../../application/ports/repository-ports/index.js'
import { IdbArtifactDrizzleSqlite, artifactTableSqlite } from '../../../db/artifact/drizzle/drizzle.schema.artifact.sqlite.js'
import { mapperArtifactDrizzle } from '../../../db/artifact/drizzle/drizzle.mapper.artifact.js'

export class ArtifactDrizzleSqliteRepo extends DraBaseSqlite<IbmArtifact, IdbArtifactDrizzleSqlite, typeof artifactTableSqlite> implements IRepositoryPortArtifact {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(artifactTableSqlite, { mapper: mapperArtifactDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmArtifact>): Effect.Effect<IbmArtifact | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbArtifactDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
