import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortSnippet } from '../ports/repository-ports/index.js'
import type { ISnippetServicePort } from '../ports/inbound/index.js'
import { SnippetServiceError } from '../errors/SnippetServiceError.js'
import { IbmSnippet, IbmSnippetInsert, snippetZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface SnippetServiceDependencies {}

export interface SnippetServiceOptions {
  snippetRepository: IRepositoryPortSnippet
  serviceDependencies?: Partial<SnippetServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class SnippetService implements ISnippetServicePort {
  private readonly snippetRepository: IRepositoryPortSnippet
  private readonly logger?: XfLogger

  constructor(options: SnippetServiceOptions) {
    this.snippetRepository = options.snippetRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmSnippet>): Effect.Effect<IbmSnippet | null, SnippetServiceError> {
    const stage = 'SnippetService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.snippetRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmSnippetInsert): Effect.Effect<IbmSnippet, SnippetServiceError> {
    const stage = 'SnippetService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: snippetZodSchemaInsert,
          stage,
          operation: 'SnippetService::create.snippetZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.snippetRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  
  listSnippets(filter: Partial<IbmSnippet> = {}, options?: DbQueryOptions<IbmSnippet>): Effect.Effect<IbmSnippet[], SnippetServiceError> {
    const stage = 'SnippetService::listSnippets'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.snippetRepository.find({ matchEq: filter, options } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listSnippets')
      }))
    )
  }

  updateSnippet(id: string, patch: Partial<IbmSnippet>): Effect.Effect<IbmSnippet, SnippetServiceError> {
    const stage = 'SnippetService::updateSnippet'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: snippetZodSchemaInsert.partial().strict(),
          stage,
          operation: 'SnippetService::updateSnippet.snippetZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((entityId) =>
        this.snippetRepository.patchById(entityId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateSnippet')
      }))
    )
  }

  removeSnippet(id: string): Effect.Effect<void, SnippetServiceError> {
    const stage = 'SnippetService::removeSnippet'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        this.snippetRepository.deleteById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
  //==> custom-methods
  // Add domain-specific service methods here (example below).
  // getByDummyString(dummy: string): Effect.Effect<IbmSnippet | null, SnippetServiceError> {
  //   return this.repository.findByDummyString(dummy).pipe(
  //     Effect.mapError(mapDbError({ stage: 'getByDummyString', operation: 'find', factory: XfErrorFactory.notFound }))
  //   );
  // }
  //<==//
}
