import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortPrompt, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import type { IPromptServicePort, PromptListFilter } from '../ports/inbound/index.js'
import { PromptServiceError } from '../errors/PromptServiceError.js'
import { IbmPrompt, IbmPromptInsert, promptZodSchemaInsert } from '../../domain/models/index.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

export interface PromptServiceDependencies {}

export interface PromptServiceOptions {
  promptRepository: IRepositoryPortPrompt
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<PromptServiceDependencies>
  logger?: XfLogger
  locale?: string
}

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const entry of value) {
    const normalized = normalizeNonEmpty(entry)?.toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function splitTagFilter(filter: PromptListFilter): { filter: PromptListFilter; tags: string[] } {
  const tags = normalizeStringList((filter as Record<string, unknown>).tags)
  if (tags.length === 0) return { filter, tags }
  const nextFilter = { ...(filter as Record<string, unknown>) }
  delete nextFilter.tags
  return { filter: nextFilter as PromptListFilter, tags }
}

function matchesTags(prompt: IbmPrompt, tags: string[]): boolean {
  if (tags.length === 0) return true
  const actual = new Set(normalizeStringList((prompt as Record<string, unknown>).tags))
  return tags.every((tag) => actual.has(tag))
}

function stripPaginationOptions<T>(options?: DbQueryOptions<T>): DbQueryOptions<T> | undefined {
  if (!options) return undefined
  const next = { ...(options as Record<string, unknown>) }
  delete next.limit
  delete next.offset
  return Object.keys(next).length > 0 ? next as DbQueryOptions<T> : undefined
}

function applyPagination<T>(items: T[], options?: DbQueryOptions<T>): T[] {
  const offset = Number((options as Record<string, unknown> | undefined)?.offset)
  const limit = Number((options as Record<string, unknown> | undefined)?.limit)
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0
  const safeLimit = Number.isFinite(limit) && limit >= 0 ? Math.trunc(limit) : undefined
  const offsetItems = safeOffset > 0 ? items.slice(safeOffset) : items
  return safeLimit !== undefined ? offsetItems.slice(0, safeLimit) : offsetItems
}

function normalizePromptListFilter(filter: PromptListFilter = {}): PromptListFilter {
  const normalizedProjectId = normalizeNonEmpty((filter as Record<string, unknown>).projectId)
  const normalizedScopeId = normalizeNonEmpty(filter.scopeId)
  if (!normalizedProjectId || normalizedScopeId) return filter
  const nextFilter = { ...(filter as Record<string, unknown>) }
  delete nextFilter.projectId
  return {
    ...nextFilter,
    scopeId: normalizedProjectId,
  } as PromptListFilter
}

export class PromptService implements IPromptServicePort {
  private readonly promptRepository: IRepositoryPortPrompt
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: PromptServiceOptions) {
    this.promptRepository = options.promptRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmPrompt>): Effect.Effect<IbmPrompt | null, PromptServiceError> {
    const stage = 'PromptService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.promptRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmPromptInsert): Effect.Effect<IbmPrompt, PromptServiceError> {
    const stage = 'PromptService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: promptZodSchemaInsert,
          stage,
          operation: 'PromptService::create.promptZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.promptRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  getPrompt(id: string, options?: DbQueryOptions<IbmPrompt>): Effect.Effect<IbmPrompt | null, PromptServiceError> {
    return this.getById(id, options)
  }

  listPrompts(
    filter: PromptListFilter = {},
    options?: DbQueryOptions<IbmPrompt>
  ): Effect.Effect<IbmPrompt[], PromptServiceError> {
    const stage = 'PromptService::listPrompts'
    const normalizedFilter = normalizePromptListFilter(filter)
    const tagFiltered = splitTagFilter(normalizedFilter)
    const queryOptions = tagFiltered.tags.length > 0 ? stripPaginationOptions(options) : options
    return pipe(
      validateInput(tagFiltered.filter, 'filter', { stage }),
      Effect.flatMap((value) => listRecordsByScopeResolution(this.promptRepository as any, this.scopeRepository, value, queryOptions, {
        stage,
        defaultResolution: 'cascade',
        dedupeKey: (item) => String(item?.name ?? '').trim().toLowerCase() || undefined,
      }).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.map((rows) => {
        const filteredRows = rows.filter((row) => matchesTags(row, tagFiltered.tags))
        return tagFiltered.tags.length > 0 ? applyPagination(filteredRows, options) : filteredRows
      }),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listPrompts')
      }))
    )
  }

  updatePrompt(id: string, patch: Partial<IbmPrompt>): Effect.Effect<IbmPrompt, PromptServiceError> {
    const stage = 'PromptService::updatePrompt'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }

    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: promptZodSchemaInsert.partial().strict(),
          stage,
          operation: 'PromptService::updatePrompt.promptZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((promptId) =>
        this.promptRepository.patchById(promptId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updatePrompt')
      }))
    )
  }

  removePrompt(id: string): Effect.Effect<void, PromptServiceError> {
    const stage = 'PromptService::removePrompt'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((promptId) =>
        this.promptRepository.deleteById(promptId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
}
