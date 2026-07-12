import { randomUUID } from 'node:crypto'
import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortReviewRequest } from '../ports/repository-ports/index.js'
import type { IReviewRequestServicePort, ReviewRequestCreateInput, ReviewRequestResultInput } from '../ports/inbound/index.js'
import { ReviewRequestServiceError } from '../errors/ReviewRequestServiceError.js'
import { IbmReviewRequest, IbmReviewRequestInsert, IbmReviewRequestResult, reviewRequestResultZodSchema, reviewRequestZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

export interface ReviewRequestServiceDependencies {}

export interface ReviewRequestServiceOptions {
  reviewRequestRepository: IRepositoryPortReviewRequest
  serviceDependencies?: Partial<ReviewRequestServiceDependencies>
  logger?: XfLogger
  locale?: string
}

function nextStatusForOutcome(outcome: IbmReviewRequestResult['outcome']): IbmReviewRequest['status'] {
  if (outcome === 'approved') return 'accepted'
  if (outcome === 'changes_requested' || outcome === 'blocked') return 'changes_requested'
  return 'responded'
}

const reviewRequestPatchZodSchema = reviewRequestZodSchemaInsert.omit({
  results: true,
  status: true,
  collabResultEventIds: true,
  parentReviewRequestId: true,
  rootReviewRequestId: true,
}).partial().strict()

function metaRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function idempotencyKeyFor(value: { idempotencyKey?: string; meta?: unknown }): string | undefined {
  const meta = metaRecord(value.meta)
  return value.idempotencyKey ?? (typeof meta.idempotencyKey === 'string' ? meta.idempotencyKey : undefined)
}

function withIdempotencyMeta<T extends { idempotencyKey?: string; meta?: unknown }>(value: T): T {
  const idempotencyKey = idempotencyKeyFor(value)
  if (!idempotencyKey) return value
  return {
    ...value,
    idempotencyKey,
    meta: {
      ...metaRecord(value.meta),
      idempotencyKey,
    },
  }
}

export class ReviewRequestService implements IReviewRequestServicePort {
  private readonly reviewRequestRepository: IRepositoryPortReviewRequest
  private readonly logger?: XfLogger

  constructor(options: ReviewRequestServiceOptions) {
    this.reviewRequestRepository = options.reviewRequestRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmReviewRequest>): Effect.Effect<IbmReviewRequest | null, ReviewRequestServiceError> {
    const stage = 'ReviewRequestService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.reviewRequestRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmReviewRequestInsert): Effect.Effect<IbmReviewRequest, ReviewRequestServiceError> {
    const stage = 'ReviewRequestService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: reviewRequestZodSchemaInsert,
          stage,
          operation: 'ReviewRequestService::create.reviewRequestZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.reviewRequestRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  createReviewRequest(input: ReviewRequestCreateInput): Effect.Effect<IbmReviewRequest, ReviewRequestServiceError> {
    const stage = 'ReviewRequestService::createReviewRequest'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) => Effect.gen(this, function* (_) {
        const idempotencyKey = idempotencyKeyFor(payload)
        if (idempotencyKey) {
          const existing = yield* _(this.reviewRequestRepository.find({ matchEq: { scopeId: payload.scopeId, idempotencyKey }, options: { limit: 1 } } as any).pipe(
            Effect.mapError(mapDbError({ stage, operation: 'find(idempotencyKey)', factory: XfErrorFactory.notFound }))
          ))
          if (existing[0]) return existing[0]
        }
        const rootReviewRequestId = payload.rootReviewRequestId
          ? payload.rootReviewRequestId
          : payload.parentReviewRequestId
            ? (yield* _(this.reviewRequestRepository.findById(payload.parentReviewRequestId).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'findById(parent)', factory: XfErrorFactory.notFound }))
            )))?.rootReviewRequestId ?? payload.parentReviewRequestId
            : undefined
        const normalized: IbmReviewRequestInsert = {
          ...withIdempotencyMeta(payload),
          rootReviewRequestId,
          status: payload.status ?? 'requested',
          priority: payload.priority ?? 'medium',
          source: payload.source ?? 'agent',
          results: payload.results ?? [],
          requestedAt: payload.requestedAt ?? new Date(),
        } as IbmReviewRequestInsert
        return yield* _(this.create(normalized))
      })),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in createReviewRequest')
      }))
    )
  }

  updateReviewRequest(id: string, patch: Partial<IbmReviewRequest>): Effect.Effect<IbmReviewRequest, ReviewRequestServiceError> {
    const stage = 'ReviewRequestService::updateReviewRequest'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: reviewRequestPatchZodSchema,
          stage,
          operation: 'ReviewRequestService::updateReviewRequest.reviewRequestZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((reviewRequestId) => this.reviewRequestRepository.patchById(reviewRequestId, patch).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateReviewRequest')
      }))
    )
  }

  addResult(id: string, result: ReviewRequestResultInput): Effect.Effect<IbmReviewRequest, ReviewRequestServiceError> {
    const stage = 'ReviewRequestService::addResult'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((reviewRequestId) =>
        this.reviewRequestRepository.findById(reviewRequestId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound })),
          Effect.flatMap((current): Effect.Effect<IbmReviewRequest, ReviewRequestServiceError> => {
            if (!current) {
              return Effect.fail(XfErrorFactory.notFound({ field: 'id', value: reviewRequestId, stage } as any) as ReviewRequestServiceError)
            }
            const idempotencyKey = idempotencyKeyFor(result)
            if (idempotencyKey && (current.results ?? []).some((entry) => idempotencyKeyFor(entry) === idempotencyKey)) {
              return Effect.succeed(current)
            }
            const normalizedResult: IbmReviewRequestResult = {
              ...withIdempotencyMeta(result),
              id: result.id ?? randomUUID(),
              createdAt: result.createdAt ?? new Date(),
            }
            return validateBmInputWithSchema({
              input: normalizedResult,
              schema: reviewRequestResultZodSchema,
              stage,
              operation: 'ReviewRequestService::addResult.reviewRequestResultZodSchema',
              field: 'result',
            }).pipe(
              Effect.flatMap((validated) => this.reviewRequestRepository.patchById(reviewRequestId, {
                results: [...(current.results ?? []), validated],
                collabResultEventIds: result.collabResultEventId
                  ? [...new Set([...(current.collabResultEventIds ?? []), result.collabResultEventId])]
                  : current.collabResultEventIds,
                status: nextStatusForOutcome(validated.outcome),
                updatedAt: new Date(),
              } as Partial<IbmReviewRequest>).pipe(
                Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
              )),
            )
          }),
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in addResult')
      }))
    )
  }

  listReviewRequests(
    filter: Partial<IbmReviewRequest> = {},
    options?: DbQueryOptions<IbmReviewRequest>
  ): Effect.Effect<IbmReviewRequest[], ReviewRequestServiceError> {
    const stage = 'ReviewRequestService::listReviewRequests'
    const queryOptions = options?.sort
      ? options
      : { ...options, sort: [{ field: 'createdAt', type: 'desc' }] }
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) =>
        this.reviewRequestRepository.find({ matchEq: filter, options: queryOptions } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listReviewRequests')
      }))
    )
  }

  removeReviewRequest(id: string): Effect.Effect<void, ReviewRequestServiceError> {
    const stage = 'ReviewRequestService::removeReviewRequest'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((reviewRequestId) =>
        this.reviewRequestRepository.deleteById(reviewRequestId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeReviewRequest')
      }))
    )
  }
}
