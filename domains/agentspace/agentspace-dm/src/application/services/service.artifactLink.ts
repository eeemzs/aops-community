import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortArtifactLink } from '../ports/repository-ports/index.js'
import type { IArtifactLinkServicePort } from '../ports/inbound/index.js'
import { ArtifactLinkServiceError } from '../errors/ArtifactLinkServiceError.js'
import { IbmArtifactLink, IbmArtifactLinkInsert, artifactLinkZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface ArtifactLinkServiceDependencies {}

export interface ArtifactLinkServiceOptions {
  artifactLinkRepository: IRepositoryPortArtifactLink
  serviceDependencies?: Partial<ArtifactLinkServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class ArtifactLinkService implements IArtifactLinkServicePort {
  private readonly artifactLinkRepository: IRepositoryPortArtifactLink
  private readonly logger?: XfLogger

  constructor(options: ArtifactLinkServiceOptions) {
    this.artifactLinkRepository = options.artifactLinkRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmArtifactLink>): Effect.Effect<IbmArtifactLink | null, ArtifactLinkServiceError> {
    const stage = 'ArtifactLinkService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.artifactLinkRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmArtifactLinkInsert): Effect.Effect<IbmArtifactLink, ArtifactLinkServiceError> {
    const stage = 'ArtifactLinkService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: artifactLinkZodSchemaInsert,
          stage,
          operation: 'ArtifactLinkService::create.artifactLinkZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.artifactLinkRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  linkArtifact(data: IbmArtifactLinkInsert): Effect.Effect<IbmArtifactLink, ArtifactLinkServiceError> {
    const stage = 'ArtifactLinkService::linkArtifact'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: artifactLinkZodSchemaInsert,
          stage,
          operation: 'ArtifactLinkService::linkArtifact.artifactLinkZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((payload) => this.create(payload)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in linkArtifact')
      }))
    )
  }

  listArtifactLinks(
    filter: Partial<IbmArtifactLink> = {},
    options?: DbQueryOptions<IbmArtifactLink>
  ): Effect.Effect<IbmArtifactLink[], ArtifactLinkServiceError> {
    const stage = 'ArtifactLinkService::listArtifactLinks'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.artifactLinkRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listArtifactLinks')
      }))
    )
  }
}
