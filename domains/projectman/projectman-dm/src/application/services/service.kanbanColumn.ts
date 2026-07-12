import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortKanbanColumn } from '../ports/repository-ports/index.js'
import type { IKanbanColumnServicePort, KanbanColumnCreateInput } from '../ports/inbound/index.js'
import { KanbanColumnServiceError } from '../errors/KanbanColumnServiceError.js'
import { IbmKanbanColumn, IbmKanbanColumnInsert, kanbanColumnZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema, validateUuidInput } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'

const normalizeColumnSlug = (value: unknown): string | undefined => {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return undefined
  const normalized = raw.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/(^-|-$)/g, '')
  return normalized || undefined
}

export interface KanbanColumnServiceDependencies {}

export interface KanbanColumnServiceOptions {
  kanbanColumnRepository: IRepositoryPortKanbanColumn
  serviceDependencies?: Partial<KanbanColumnServiceDependencies>
  logger?: XfLogger
  locale?: string
}

export class KanbanColumnService implements IKanbanColumnServicePort {
  private readonly kanbanColumnRepository: IRepositoryPortKanbanColumn
  private readonly logger?: XfLogger

  constructor(options: KanbanColumnServiceOptions) {
    this.kanbanColumnRepository = options.kanbanColumnRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  private resolveUniqueSlug(params: {
    scopeId: string
    name?: unknown
    slug?: unknown
    excludeId?: string
  }): Effect.Effect<string, KanbanColumnServiceError> {
    const baseSlug = normalizeColumnSlug(params.slug) ?? normalizeColumnSlug(params.name)
    if (!baseSlug) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'slug', stage: 'KanbanColumnService::resolveUniqueSlug' }))
    }

    return pipe(
      this.listColumns({ scopeId: params.scopeId } as any),
      Effect.map((items) => {
        const used = new Set(
          items
            .filter((item) => String(item?.id ?? '') !== String(params.excludeId ?? ''))
            .map((item) => normalizeColumnSlug((item as any)?.slug))
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

  getById(id: string, options?: DbQueryOptions<IbmKanbanColumn>): Effect.Effect<IbmKanbanColumn | null, KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::getById'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.kanbanColumnRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmKanbanColumnInsert): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: kanbanColumnZodSchemaInsert,
          stage,
          operation: 'KanbanColumnService::create.kanbanColumnZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.kanbanColumnRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  createColumn(input: KanbanColumnCreateInput): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::createColumn'
    return pipe(
      validateInput(input, 'input', { stage }),
      Effect.flatMap((payload) =>
        this.resolveUniqueSlug({
          scopeId: String(payload.scopeId ?? ''),
          name: payload.name,
          slug: (payload as any).slug,
        }).pipe(
          Effect.map((slug) => ({ ...payload, slug } as IbmKanbanColumnInsert)),
        )
      ),
      Effect.flatMap((payload) => this.create(payload as IbmKanbanColumnInsert)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in createColumn')
      }))
    )
  }

  updateColumn(id: string, patch: Partial<IbmKanbanColumn>): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::updateColumn'
    const normalizedPatch = { ...patch } as Partial<IbmKanbanColumn>
    if ('slug' in normalizedPatch) {
      normalizedPatch.slug = normalizeColumnSlug(normalizedPatch.slug) as any
      if (!normalizedPatch.slug) delete normalizedPatch.slug
    }
    if (!normalizedPatch || Object.keys(normalizedPatch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return Effect.gen(this, function* (_) {
      const entityId = yield* _(validateUuidInput(id, 'id', { stage }))
      yield* _(
        validateBmInputWithSchema({
          input: normalizedPatch,
          schema: kanbanColumnZodSchemaInsert.partial().strict(),
          stage,
          operation: 'KanbanColumnService::updateColumn.kanbanColumnZodSchemaInsert.patch',
          field: 'patch',
        })
      )

      const existing = yield* _(
        this.kanbanColumnRepository.findById(entityId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
        )
      )
      if (!existing) {
        return yield* _(Effect.fail(XfErrorFactory.notFound({ stage, identifier: entityId })))
      }

      const slug = yield* _(
        this.resolveUniqueSlug({
          scopeId: existing.scopeId,
          name: normalizedPatch.name ?? existing.name,
          slug: normalizedPatch.slug ?? existing.slug,
          excludeId: entityId,
        })
      )

      return yield* _(
        this.kanbanColumnRepository.patchById(entityId, { ...normalizedPatch, slug }).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      )
    }).pipe(
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateColumn')
      }))
    )
  }

  setColumnWipLimit(id: string, wipLimit?: number | null): Effect.Effect<IbmKanbanColumn, KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::setColumnWipLimit'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap(() => this.updateColumn(id, { wipLimit: wipLimit === null ? (null as any) : wipLimit }))
    )
  }

  listColumns(
    filter: Partial<IbmKanbanColumn> = {},
    options?: DbQueryOptions<IbmKanbanColumn>
  ): Effect.Effect<IbmKanbanColumn[], KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::listColumns'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((filter) =>
        this.kanbanColumnRepository.find({ matchEq: filter, options } as any).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listColumns')
      }))
    )
  }

  removeColumn(id: string): Effect.Effect<void, KanbanColumnServiceError> {
    const stage = 'KanbanColumnService::removeColumn'
    return pipe(
      validateUuidInput(id, 'id', { stage }),
      Effect.flatMap((columnId) =>
        this.kanbanColumnRepository.deleteById(columnId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in removeColumn')
      }))
    )
  }
}
