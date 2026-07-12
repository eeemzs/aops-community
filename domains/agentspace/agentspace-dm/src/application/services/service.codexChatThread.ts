import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortCodexChatThread, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import type { CodexChatThreadListFilter, ICodexChatThreadServicePort } from '../ports/inbound/index.js'
import { CodexChatThreadServiceError } from '../errors/CodexChatThreadServiceError.js'
import { IbmCodexChatThread, IbmCodexChatThreadInsert, codexChatThreadZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

export interface CodexChatThreadServiceDependencies {}

export interface CodexChatThreadServiceOptions {
  codexChatThreadRepository: IRepositoryPortCodexChatThread
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<CodexChatThreadServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class CodexChatThreadService implements ICodexChatThreadServicePort {
  private readonly codexChatThreadRepository: IRepositoryPortCodexChatThread
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: CodexChatThreadServiceOptions) {
    this.codexChatThreadRepository = options.codexChatThreadRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(
    id: string,
    options?: DbQueryOptions<IbmCodexChatThread>
  ): Effect.Effect<IbmCodexChatThread | null, CodexChatThreadServiceError> {
    const stage = 'CodexChatThreadService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((value) =>
        this.codexChatThreadRepository.findById(value, options).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
        })
      )
    )
  }

  create(data: IbmCodexChatThreadInsert): Effect.Effect<IbmCodexChatThread, CodexChatThreadServiceError> {
    const stage = 'CodexChatThreadService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: codexChatThreadZodSchemaInsert,
          stage,
          operation: 'CodexChatThreadService::create.codexChatThreadZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((value) =>
        this.codexChatThreadRepository.create(value).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
        )
      )
    )
  }

  addThread(data: IbmCodexChatThreadInsert): Effect.Effect<IbmCodexChatThread, CodexChatThreadServiceError> {
    const stage = 'CodexChatThreadService::addThread'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: codexChatThreadZodSchemaInsert,
          stage,
          operation: 'CodexChatThreadService::addThread.codexChatThreadZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((payload) => this.create(payload)),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in addThread')
        })
      )
    )
  }

  updateThread(
    id: string,
    patch: Partial<IbmCodexChatThread>
  ): Effect.Effect<IbmCodexChatThread, CodexChatThreadServiceError> {
    const stage = 'CodexChatThreadService::updateThread'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: codexChatThreadZodSchemaInsert.partial().strict(),
          stage,
          operation: 'CodexChatThreadService::updateThread.codexChatThreadZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((threadId) =>
        this.codexChatThreadRepository.patchById(threadId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateThread')
        })
      )
    )
  }

  listThreads(
    filter: CodexChatThreadListFilter = {},
    options?: DbQueryOptions<IbmCodexChatThread>
  ): Effect.Effect<IbmCodexChatThread[], CodexChatThreadServiceError> {
    const stage = 'CodexChatThreadService::listThreads'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) =>
        listRecordsByScopeResolution(this.codexChatThreadRepository as any, this.scopeRepository, value, options, {
          stage,
          defaultResolution: 'explicit',
        }).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in listThreads')
        })
      )
    )
  }

  removeThread(id: string): Effect.Effect<void, CodexChatThreadServiceError> {
    const stage = 'CodexChatThreadService::removeThread'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((threadId) =>
        this.codexChatThreadRepository.deleteById(threadId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
}
