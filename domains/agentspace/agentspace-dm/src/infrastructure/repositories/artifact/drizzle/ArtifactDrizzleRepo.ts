import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmArtifact } from '../../../../domain/models/index.js'
import { IRepositoryPortArtifact } from '../../../../application/ports/repository-ports/index.js'
import { IdbArtifactDrizzle, artifactTable } from '../../../db/artifact/drizzle/drizzle.schema.artifact.js'
import { mapperArtifactDrizzle } from '../../../db/artifact/drizzle/drizzle.mapper.artifact.js'

export class ArtifactDrizzleRepo extends DraBase<IbmArtifact, IdbArtifactDrizzle, typeof artifactTable> implements IRepositoryPortArtifact {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(artifactTable, { mapper: mapperArtifactDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmArtifact>): Effect.Effect<IbmArtifact | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbArtifactDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

