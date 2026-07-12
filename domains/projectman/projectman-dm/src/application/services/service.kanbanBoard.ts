import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortKanbanBoard } from '../ports/repository-ports/index.js'
import type { IKanbanBoardServicePort, KanbanBoardCreateInput } from '../ports/inbound/index.js'
import { KanbanBoardServiceError } from '../errors/KanbanBoardServiceError.js'
import { IbmKanbanBoard, IbmKanbanBoardInsert, kanbanBoardZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

const normalizeBoardSlug = (value: unknown): string | undefined => {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return undefined
  const normalized = raw.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '')
  return normalized || undefined
}

const isNotFoundLikeError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '')
  const normalized = message.trim().toLowerCase()
  if (!normalized) return false
  return normalized.includes('failed to find') || normalized.includes('not found')
}

export interface KanbanBoardServiceDependencies {}

export interface KanbanBoardServiceOptions {
  kanbanBoardRepository: IRepositoryPortKanbanBoard
  serviceDependencies?: Partial<KanbanBoardServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class KanbanBoardService implements IKanbanBoardServicePort {
  private readonly kanbanBoardRepository: IRepositoryPortKanbanBoard
  private readonly logger?: XfLogger

  constructor(options: KanbanBoardServiceOptions) {
    this.kanbanBoardRepository = options.kanbanBoardRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  private resolveUniqueSlug(params: {
    scopeId: string
    name?: unknown
    slug?: unknown
    excludeId?: string
  }): Effect.Effect<string | undefined, KanbanBoardServiceError> {
    const baseSlug = normalizeBoardSlug(params.slug) ?? normalizeBoardSlug(params.name)
    if (!baseSlug) return Effect.succeed(undefined)

    return pipe(
      this.listBoards({ scopeId: params.scopeId } as any, undefined, { includeArchived: true }),
      Effect.map((items) => {
        const used = new Set(
          items
            .filter((item) => String(item?.id ?? '') !== String(params.excludeId ?? ''))
            .map((item) => normalizeBoardSlug((item as any)?.slug))
            .filter((value): value is string => Boolean(value)),
        )
        if (!used.has(baseSlug)) return baseSlug

        let suffix = 2
        let candidate = `${baseSlug}-${suffix}`
        while (used.has(candidate)) {
          suffix += 1
          candidate = `${baseSlug}-${suffix}`
        }
        return candidate
      }),
    )
  }

  getById(id: string, options?: DbQueryOptions<IbmKanbanBoard>): Effect.Effect<IbmKanbanBoard | null, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.kanbanBoardRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmKanbanBoardInsert): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: kanbanBoardZodSchemaInsert,
          stage,
          operation: 'KanbanBoardService::create.kanbanBoardZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.kanbanBoardRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  createBoard(input: KanbanBoardCreateInput): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::createBoard'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) => {
        const normalized = { ...payload } as IbmKanbanBoardInsert

        if (normalized.position === undefined || normalized.position === null) {
          const filter: Partial<IbmKanbanBoard> = {
            scopeId: normalized.scopeId,
          }

          return pipe(
            this.listBoards(filter, { sort: [{ field: 'position', type: 'desc' }], limit: 1 }, { includeArchived: true }),
            Effect.map((items) => {
              const next = items?.[0]?.position ?? -1
              return { ...normalized, position: next + 1 }
            })
          )
        }

        return Effect.succeed(normalized)
      }),
      Effect.flatMap((normalized) =>
        this.resolveUniqueSlug({
          scopeId: normalized.scopeId,
          name: normalized.name,
          slug: normalized.slug,
        }).pipe(
          Effect.map((slug) => (slug ? ({ ...normalized, slug } as IbmKanbanBoardInsert) : normalized)),
        )
      ),
      Effect.flatMap((data) => this.create(data)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in createBoard')
      }))
    )
  }

  updateBoard(id: string, patch: Partial<IbmKanbanBoard>): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::updateBoard'
    const normalizedPatch = { ...patch } as Partial<IbmKanbanBoard>
    if ('slug' in normalizedPatch) {
      normalizedPatch.slug = normalizeBoardSlug(normalizedPatch.slug) as any
      if (!normalizedPatch.slug) delete normalizedPatch.slug
    }

    if (!normalizedPatch || Object.keys(normalizedPatch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return (Effect.gen(this, function* (_) {
      const entityId = yield* _(validateUuidInput(id, 'id', { stage }))
      yield* _(
        validateBmInputWithSchema({
          input: normalizedPatch,
          schema: kanbanBoardZodSchemaInsert.partial().strict(),
          stage,
          operation: 'KanbanBoardService::updateBoard.kanbanBoardZodSchemaInsert.patch',
          field: 'patch',
        })
      )

      const existing = yield* _(
        this.kanbanBoardRepository.findById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
        )
      )
      if (!existing) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: entityId })))
      }

      if (normalizedPatch.slug !== undefined) {
        normalizedPatch.slug = yield* _(
          this.resolveUniqueSlug({
            scopeId: existing.scopeId,
            name: normalizedPatch.name ?? existing.name,
            slug: normalizedPatch.slug,
            excludeId: entityId,
          })
        ) as any
      }

      return yield* _(
        this.kanbanBoardRepository.patchById(entityId, normalizedPatch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      )
    }) as Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError>).pipe(
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateBoard')
      }))
    )
  }

  archiveBoard(id: string): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::archiveBoard'
    return this.updateBoard(id, { archivedAt: new Date() }).pipe(
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in archiveBoard')
      }))
    )
  }

  unarchiveBoard(id: string): Effect.Effect<IbmKanbanBoard, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::unarchiveBoard'
    return this.updateBoard(id, { archivedAt: null }).pipe(
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in unarchiveBoard')
      }))
    )
  }

  listBoards(
    filter: Partial<IbmKanbanBoard> = {},
    options?: DbQueryOptions<IbmKanbanBoard>,
    listOptions?: { includeArchived?: boolean }
  ): Effect.Effect<IbmKanbanBoard[], KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::listBoards'
    const queryOptions = options?.sort
      ? options
      : { ...options, sort: [{ field: 'position', type: 'asc' }] }
    const includeArchived = listOptions?.includeArchived === true
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) => this.kanbanBoardRepository.find({ matchEq: filter, options: queryOptions } as any).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.map((items) => (includeArchived ? items : items.filter((item) => (item as any)?.archivedAt == null))),
      Effect.catchIf(isNotFoundLikeError, () => Effect.succeed([] as IbmKanbanBoard[])),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listBoards')
      }))
    )
  }

  reorderBoards(orderedBoardIds: string[]): Effect.Effect<number, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::reorderBoards'
    const tempBase = 1000000
    return pipe(
      validateInput(orderedBoardIds, 'orderedBoardIds', { stage }),
      Effect.flatMap(() =>
        Effect.forEach(
          orderedBoardIds,
          (id, index) =>
            this.kanbanBoardRepository.patchById(id, { position: tempBase + index } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(temp)', factory: XfErrorFactory.upsertFailed }))
            ),
          { concurrency: 1 }
        )
      ),
      Effect.flatMap(() =>
        Effect.forEach(
          orderedBoardIds,
          (id, index) =>
            this.kanbanBoardRepository.patchById(id, { position: index } as any).pipe(
              Effect.mapError(mapDbError({ stage, operation: 'patchById(final)', factory: XfErrorFactory.upsertFailed }))
            ),
          { concurrency: 1 }
        )
      ),
      Effect.map(() => orderedBoardIds.length),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in reorderBoards')
      }))
    )
  }

  removeBoard(id: string): Effect.Effect<void, KanbanBoardServiceError> {
    const stage = 'KanbanBoardService::removeBoard'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((boardId) =>
        this.kanbanBoardRepository.deleteById(boardId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeBoard')
      }))
    )
  }
}
