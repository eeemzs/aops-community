import type { RepositoryError } from '@aopslab/xf-db'
import type { IRepositoryPortBaseCrud } from './IRepositoryPortBaseCrud.js'
import { IbmArtifact } from '../../../domain/models/index.js'
import { IdbArtifactDrizzle } from '../../../infrastructure/db/artifact/drizzle/drizzle.schema.artifact.js'

/**
 * Repository port for Artifact
 *
 * Contract between application layer and infrastructure repositories.
 */
export interface IRepositoryPortArtifact extends IRepositoryPortBaseCrud<IbmArtifact, IdbArtifactDrizzle, RepositoryError> {
  //==> custom-methods
  // Add domain-specific methods here (examples below).
  // Example:
  // findByDummyString(dummyString: string, options?: import('@aopslab/xf-db').DbQueryOptions<IbmArtifact>): import('effect').Effect<IbmArtifact | null, RepositoryError>
  //<==//
}


