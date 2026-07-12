import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortFeedbackItem } from '../ports/repository-ports/index.js'
import type { IFeedbackItemServicePort, FeedbackItemCreateInput } from '../ports/inbound/index.js'
import { FeedbackItemServiceError } from '../errors/FeedbackItemServiceError.js'
import { IbmFeedbackItem, IbmFeedbackItemInsert, feedbackItemZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface FeedbackItemServiceDependencies {}

export interface FeedbackItemServiceOptions {
  feedbackItemRepository: IRepositoryPortFeedbackItem
  serviceDependencies?: Partial<FeedbackItemServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class FeedbackItemService implements IFeedbackItemServicePort {
  private readonly feedbackItemRepository: IRepositoryPortFeedbackItem
  private readonly logger?: XfLogger

  constructor(options: FeedbackItemServiceOptions) {
    this.feedbackItemRepository = options.feedbackItemRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmFeedbackItem>): Effect.Effect<IbmFeedbackItem | null, FeedbackItemServiceError> {
    const stage = 'FeedbackItemService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.feedbackItemRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmFeedbackItemInsert): Effect.Effect<IbmFeedbackItem, FeedbackItemServiceError> {
    const stage = 'FeedbackItemService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: feedbackItemZodSchemaInsert,
          stage,
          operation: 'FeedbackItemService::create.feedbackItemZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.feedbackItemRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  createFeedback(input: FeedbackItemCreateInput): Effect.Effect<IbmFeedbackItem, FeedbackItemServiceError> {
    const stage = 'FeedbackItemService::createFeedback'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) => {
        const normalized: IbmFeedbackItemInsert = {
          ...payload,
          status: payload.status ?? 'new',
          type: payload.type ?? 'observation',
          severity: payload.severity ?? 'medium',
          source: payload.source ?? 'human',
          recordedAt: payload.recordedAt ?? new Date(),
        } as IbmFeedbackItemInsert
        return this.create(normalized)
      }),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in createFeedback')
      }))
    )
  }

  updateFeedback(id: string, patch: Partial<IbmFeedbackItem>): Effect.Effect<IbmFeedbackItem, FeedbackItemServiceError> {
    const stage = 'FeedbackItemService::updateFeedback'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: feedbackItemZodSchemaInsert.partial().strict(),
          stage,
          operation: 'FeedbackItemService::updateFeedback.feedbackItemZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((feedbackId) => this.feedbackItemRepository.patchById(feedbackId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateFeedback')
      }))
    )
  }

  listFeedback(
    filter: Partial<IbmFeedbackItem> = {},
    options?: DbQueryOptions<IbmFeedbackItem>
  ): Effect.Effect<IbmFeedbackItem[], FeedbackItemServiceError> {
    const stage = 'FeedbackItemService::listFeedback'
    const queryOptions = options?.sort
      ? options
      : { ...options, sort: [{ field: 'createdAt', type: 'desc' }] }
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) =>
        this.feedbackItemRepository.find({ matchEq: filter, options: queryOptions } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listFeedback')
      }))
    )
  }

  removeFeedback(id: string): Effect.Effect<void, FeedbackItemServiceError> {
    const stage = 'FeedbackItemService::removeFeedback'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((feedbackId) =>
        this.feedbackItemRepository.deleteById(feedbackId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeFeedback')
      }))
    )
  }
}
