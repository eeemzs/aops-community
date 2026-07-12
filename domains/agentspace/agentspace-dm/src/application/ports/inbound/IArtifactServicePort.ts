import { Effect } from 'effect'
import { ArtifactServiceError } from '../../errors/ArtifactServiceError.js'
import { IbmArtifact, IbmArtifactInsert, IbmArtifactLink, IbmArtifactLinkInsert } from '../../../domain/models/index.js'
import { DbQueryOptions } from '@aopslab/xf-db'
import type { ScopeResolution } from '../../../domain/types.js'

export type ArtifactLinkInput = IbmArtifactLinkInsert
export type ArtifactListFilter = Partial<IbmArtifact> & { scopeResolution?: ScopeResolution }

export interface IArtifactServicePort {
  getById(id: string, options?: DbQueryOptions<IbmArtifact>): Effect.Effect<IbmArtifact | null, ArtifactServiceError>
  create(data: IbmArtifactInsert): Effect.Effect<IbmArtifact, ArtifactServiceError>
  getArtifact(id: string, options?: DbQueryOptions<IbmArtifact>): Effect.Effect<IbmArtifact | null, ArtifactServiceError>
  storeArtifact(data: IbmArtifactInsert): Effect.Effect<IbmArtifact, ArtifactServiceError>
  linkArtifact(data: ArtifactLinkInput): Effect.Effect<IbmArtifactLink, ArtifactServiceError>
  listArtifacts(filter?: ArtifactListFilter, options?: DbQueryOptions<IbmArtifact>): Effect.Effect<IbmArtifact[], ArtifactServiceError>
  listArtifactsByRef(
    refType: IbmArtifactLink['refType'],
    refId: string,
    scopeId?: string,
    scopeResolution?: ScopeResolution
  ): Effect.Effect<IbmArtifact[], ArtifactServiceError>
  removeArtifact(id: string): Effect.Effect<void, ArtifactServiceError>
}

export interface IArtifactLookupPort {
  getById(id: string): Effect.Effect<IbmArtifact | null, ArtifactServiceError>
}
