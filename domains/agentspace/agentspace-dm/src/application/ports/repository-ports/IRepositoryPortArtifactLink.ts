import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmArtifactLink } from '../../../domain/models/index.js'
import { IdbArtifactLinkDrizzle } from '../../../infrastructure/db/artifactLink/drizzle/drizzle.schema.artifactLink.js'

/**
 * Repository port for ArtifactLink
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortArtifactLink extends IRepositoryPortBaseCrud<IbmArtifactLink, IdbArtifactLinkDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmArtifactLink>): import('effect').Effect<IbmArtifactLink | null, RepositoryError>
  //<==//
}


