import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortEmbed } from '../ports/repository-ports/index.js'
import type { IEmbedServicePort } from '../ports/inbound/index.js'
import { EmbedServiceError } from '../errors/EmbedServiceError.js'
import { IbmEmbed, IbmEmbedInsert, embedZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface EmbedServiceDependencies {}

export interface EmbedServiceOptions {
  embedRepository: IRepositoryPortEmbed
  serviceDependencies?: Partial<EmbedServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class EmbedService implements IEmbedServicePort {
  private readonly embedRepository: IRepositoryPortEmbed
  private readonly logger?: XfLogger

  constructor(options: EmbedServiceOptions) {
    this.embedRepository = options.embedRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmEmbed>): Effect.Effect<IbmEmbed | null, EmbedServiceError> {
    const stage = 'EmbedService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.embedRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmEmbedInsert): Effect.Effect<IbmEmbed, EmbedServiceError> {
    const stage = 'EmbedService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: embedZodSchemaInsert,
          stage,
          operation: 'EmbedService::create.embedZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.embedRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  listEmbeds(filter: Partial<IbmEmbed> = {}, options?: DbQueryOptions<IbmEmbed>): Effect.Effect<IbmEmbed[], EmbedServiceError> {
    const stage = 'EmbedService::listEmbeds'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.embedRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listEmbeds')
      }))
    )
  }

  updateEmbed(id: string, patch: Partial<IbmEmbed>): Effect.Effect<IbmEmbed, EmbedServiceError> {
    const stage = 'EmbedService::updateEmbed'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: embedZodSchemaInsert.partial().strict(),
          stage,
          operation: 'EmbedService::updateEmbed.embedZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((entityId) =>
        this.embedRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateEmbed')
      }))
    )
  }

  removeEmbed(id: string): Effect.Effect<void, EmbedServiceError> {
    const stage = 'EmbedService::removeEmbed'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        this.embedRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
  //==> custom-methods
  // Add domain-specific service methods here (example below).
  // getByDummyString(dummy: string): Effect.Effect<IbmEmbed | null, EmbedServiceError> {
  //   return this.repository.findByDummyString(dummy).pipe(
  //     Effect.mapError(mapDbError({ stage: 'getByDummyString', operation: 'find', factory: XfErrorFactory.notFound }))
  //   );
  // }
  //<==//
}
