import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortHistory } from '../ports/repository-ports/index.js'
import type { IHistoryServicePort, HistoryCreateInput } from '../ports/inbound/index.js'
import { HistoryServiceError } from '../errors/HistoryServiceError.js'
import { IbmHistory, IbmHistoryInsert, historyZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
}

export interface HistoryServiceDependencies {}

export interface HistoryServiceOptions {
  historyRepository: IRepositoryPortHistory
  serviceDependencies?: Partial<HistoryServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class HistoryService implements IHistoryServicePort {
  private readonly historyRepository: IRepositoryPortHistory
  private readonly logger?: XfLogger

  constructor(options: HistoryServiceOptions) {
    this.historyRepository = options.historyRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmHistory>): Effect.Effect<IbmHistory | null, HistoryServiceError> {
    const stage = 'HistoryService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.historyRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmHistoryInsert): Effect.Effect<IbmHistory, HistoryServiceError> {
    const stage = 'HistoryService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: historyZodSchemaInsert,
          stage,
          operation: 'HistoryService::create.historyZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.historyRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  createHistory(input: HistoryCreateInput): Effect.Effect<IbmHistory, HistoryServiceError> {
    const stage = 'HistoryService::createHistory'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) => {
        const normalized: IbmHistoryInsert = {
          ...payload,
          slug: payload.slug ?? slugify(payload.name),
          status: payload.status ?? 'active',
        } as IbmHistoryInsert
        return this.create(normalized)
      }),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in createHistory')
      }))
    )
  }

  updateHistory(id: string, patch: Partial<IbmHistory>): Effect.Effect<IbmHistory, HistoryServiceError> {
    const stage = 'HistoryService::updateHistory'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: historyZodSchemaInsert.partial().strict(),
          stage,
          operation: 'HistoryService::updateHistory.historyZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((historyId) => this.historyRepository.patchById(historyId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateHistory')
      }))
    )
  }

  listHistories(
    filter: Partial<IbmHistory> = {},
    options?: DbQueryOptions<IbmHistory>
  ): Effect.Effect<IbmHistory[], HistoryServiceError> {
    const stage = 'HistoryService::listHistories'
    const queryOptions = options?.sort
      ? options
      : { ...options, sort: [{ field: 'createdAt', type: 'desc' }] }
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) =>
        this.historyRepository.find({ matchEq: filter, options: queryOptions } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listHistories')
      }))
    )
  }

  removeHistory(id: string): Effect.Effect<void, HistoryServiceError> {
    const stage = 'HistoryService::removeHistory'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((historyId) =>
        this.historyRepository.deleteById(historyId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeHistory')
      }))
    )
  }
}
