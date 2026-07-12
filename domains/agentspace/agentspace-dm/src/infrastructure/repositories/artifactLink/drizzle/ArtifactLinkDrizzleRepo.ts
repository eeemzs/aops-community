import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmArtifactLink } from '../../../../domain/models/index.js'
import { IRepositoryPortArtifactLink } from '../../../../application/ports/repository-ports/index.js'
import { IdbArtifactLinkDrizzle, artifactLinkTable } from '../../../db/artifactLink/drizzle/drizzle.schema.artifactLink.js'
import { mapperArtifactLinkDrizzle } from '../../../db/artifactLink/drizzle/drizzle.mapper.artifactLink.js'

export class ArtifactLinkDrizzleRepo extends DraBase<IbmArtifactLink, IdbArtifactLinkDrizzle, typeof artifactLinkTable> implements IRepositoryPortArtifactLink {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(artifactLinkTable, { mapper: mapperArtifactLinkDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmArtifactLink>): Effect.Effect<IbmArtifactLink | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbArtifactLinkDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

