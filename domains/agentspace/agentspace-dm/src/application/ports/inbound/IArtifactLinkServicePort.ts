import { Effect } from 'effect'
import { ArtifactLinkServiceError } from '../../errors/ArtifactLinkServiceError.js'
import { IbmArtifactLink, IbmArtifactLinkInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'

export interface IArtifactLinkServicePort {
  getById(id: string, options?: DbQueryOptions<IbmArtifactLink>): Effect.Effect<IbmArtifactLink | null, ArtifactLinkServiceError>
  create(data: IbmArtifactLinkInsert): Effect.Effect<IbmArtifactLink, ArtifactLinkServiceError>
  linkArtifact(data: IbmArtifactLinkInsert): Effect.Effect<IbmArtifactLink, ArtifactLinkServiceError>
  listArtifactLinks(filter?: Partial<IbmArtifactLink>, options?: DbQueryOptions<IbmArtifactLink>): Effect.Effect<IbmArtifactLink[], ArtifactLinkServiceError>
}

export interface IArtifactLinkLookupPort {
  getById(id: string): Effect.Effect<IbmArtifactLink | null, ArtifactLinkServiceError>
}
