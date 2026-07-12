import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortCodexChatMessage } from '../ports/repository-ports/index.js'
import type { ICodexChatMessageServicePort } from '../ports/inbound/index.js'
import { CodexChatMessageServiceError } from '../errors/CodexChatMessageServiceError.js'
import { IbmCodexChatMessage, IbmCodexChatMessageInsert, codexChatMessageZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface CodexChatMessageServiceDependencies {}

export interface CodexChatMessageServiceOptions {
  codexChatMessageRepository: IRepositoryPortCodexChatMessage
  serviceDependencies?: Partial<CodexChatMessageServiceDependencies>
  logger?: XfLogger
  locale?: string
}

function normalizeMessageAtValue(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      const parsed = new Date(trimmed)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
  }
  return new Date()
}

function normalizeCodexChatMessageInsertInput(data: IbmCodexChatMessageInsert): IbmCodexChatMessageInsert {
  const payload = { ...(data as Record<string, unknown>) }
  payload.messageAt = normalizeMessageAtValue(payload.messageAt)
  return payload as IbmCodexChatMessageInsert
}

export class CodexChatMessageService implements ICodexChatMessageServicePort {
  private readonly codexChatMessageRepository: IRepositoryPortCodexChatMessage
  private readonly logger?: XfLogger

  constructor(options: CodexChatMessageServiceOptions) {
    this.codexChatMessageRepository = options.codexChatMessageRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(
    id: string,
    options?: DbQueryOptions<IbmCodexChatMessage>
  ): Effect.Effect<IbmCodexChatMessage | null, CodexChatMessageServiceError> {
    const stage = 'CodexChatMessageService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((value) =>
        this.codexChatMessageRepository.findById(value, options).pipe(
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

  create(data: IbmCodexChatMessageInsert): Effect.Effect<IbmCodexChatMessage, CodexChatMessageServiceError> {
    const stage = 'CodexChatMessageService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: normalizeCodexChatMessageInsertInput(data),
          schema: codexChatMessageZodSchemaInsert,
          stage,
          operation: 'CodexChatMessageService::create.codexChatMessageZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((value) =>
        this.codexChatMessageRepository.create(value).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
        )
      )
    )
  }

  addMessage(data: IbmCodexChatMessageInsert): Effect.Effect<IbmCodexChatMessage, CodexChatMessageServiceError> {
    const stage = 'CodexChatMessageService::addMessage'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: normalizeCodexChatMessageInsertInput(data),
          schema: codexChatMessageZodSchemaInsert,
          stage,
          operation: 'CodexChatMessageService::addMessage.codexChatMessageZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((payload) => this.create(payload)),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in addMessage')
        })
      )
    )
  }

  updateMessage(
    id: string,
    patch: Partial<IbmCodexChatMessage>
  ): Effect.Effect<IbmCodexChatMessage, CodexChatMessageServiceError> {
    const stage = 'CodexChatMessageService::updateMessage'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: codexChatMessageZodSchemaInsert.partial().strict(),
          stage,
          operation: 'CodexChatMessageService::updateMessage.codexChatMessageZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((messageId) =>
        this.codexChatMessageRepository.patchById(messageId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateMessage')
        })
      )
    )
  }

  listMessages(
    filter: Partial<IbmCodexChatMessage> = {},
    options?: DbQueryOptions<IbmCodexChatMessage>
  ): Effect.Effect<IbmCodexChatMessage[], CodexChatMessageServiceError> {
    const stage = 'CodexChatMessageService::listMessages'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) =>
        this.codexChatMessageRepository.find({ matchEq: value, options } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, stage }, 'Error in listMessages')
        })
      )
    )
  }

  removeMessage(id: string): Effect.Effect<void, CodexChatMessageServiceError> {
    const stage = 'CodexChatMessageService::removeMessage'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((messageId) =>
        this.codexChatMessageRepository.deleteById(messageId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
}
