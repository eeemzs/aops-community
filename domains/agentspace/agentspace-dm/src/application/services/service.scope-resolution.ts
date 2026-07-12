import { Effect } from 'effect'
import { XfErrorFactory } from '@aopslab/xf-core'
import type { ScopeResolution } from '../../domain/types.js'
import type { IRepositoryPortScope } from '../ports/repository-ports/index.js'

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function normalizeScopeResolution(
  value: unknown,
  fallback: ScopeResolution,
): ScopeResolution {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (normalized === 'cascade') return 'cascade'
  if (normalized === 'explicit') return 'explicit'
  return fallback
}

export function getScopeById(
  scopeRepository: IRepositoryPortScope | undefined,
  scopeId: string,
  stage: string,
) {
  const normalizedScopeId = normalizeNonEmpty(scopeId)
  if (!normalizedScopeId) {
    return Effect.fail(XfErrorFactory.inputRequired({ field: 'scopeId', stage }))
  }
  if (!scopeRepository) {
    return Effect.fail(XfErrorFactory.notFound({ stage, identifier: 'scopeRepository' }))
  }
  return scopeRepository.findById(normalizedScopeId).pipe(
    Effect.flatMap((scope) =>
      scope
        ? Effect.succeed(scope)
        : Effect.fail(XfErrorFactory.notFound({ stage, identifier: normalizedScopeId })),
    ),
  )
}

export function listAncestorScopeIds(
  scopeRepository: IRepositoryPortScope | undefined,
  scopeId: string,
  stage: string,
): Effect.Effect<string[], unknown> {
  return Effect.gen(function* (_) {
    const ancestors: string[] = []
    let current = yield* _(getScopeById(scopeRepository, scopeId, stage) as Effect.Effect<any, any>)
    let parentScopeId = normalizeNonEmpty((current as any)?.parentScopeId)

    while (parentScopeId) {
      ancestors.push(parentScopeId)
      current = yield* _(getScopeById(scopeRepository, parentScopeId, stage) as Effect.Effect<any, any>)
      parentScopeId = normalizeNonEmpty((current as any)?.parentScopeId)
    }

    return ancestors
  })
}

export function resolveScopeChain(
  scopeRepository: IRepositoryPortScope | undefined,
  scopeId: string,
  resolution: ScopeResolution,
  stage: string,
): Effect.Effect<string[], unknown> {
  const normalizedScopeId = normalizeNonEmpty(scopeId)
  if (!normalizedScopeId) {
    return Effect.fail(XfErrorFactory.inputRequired({ field: 'scopeId', stage }))
  }
  if (resolution === 'explicit') {
    return Effect.succeed([normalizedScopeId])
  }

  return listAncestorScopeIds(scopeRepository, normalizedScopeId, stage).pipe(
    Effect.map((ancestors) => [normalizedScopeId, ...ancestors]),
  )
}

type ScopeAwareFilter = {
  scopeId?: string
  scopeResolution?: ScopeResolution
}

type MatchEqFindRepository = {
  find(params: {
    matchEq: Record<string, unknown>
    options?: unknown
  }): Effect.Effect<ReadonlyArray<any>, unknown, never>
}

function stripPaginationOptions(options?: unknown): Record<string, unknown> | undefined {
  if (!options) return undefined
  const next = { ...(options as Record<string, unknown>) }
  delete next.limit
  delete next.offset
  return Object.keys(next).length > 0 ? next : undefined
}

function applyPagination(items: readonly any[], options?: unknown): any[] {
  const offset = Number((options as Record<string, unknown> | undefined)?.offset)
  const limit = Number((options as Record<string, unknown> | undefined)?.limit)
  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0
  const safeLimit = Number.isFinite(limit) && limit >= 0 ? Math.trunc(limit) : undefined
  const paged = safeOffset > 0 ? items.slice(safeOffset) : [...items]
  return safeLimit !== undefined ? paged.slice(0, safeLimit) : paged
}

export function listRecordsByScopeResolution(
  repository: MatchEqFindRepository,
  scopeRepository: IRepositoryPortScope | undefined,
  filter: Record<string, unknown> & ScopeAwareFilter,
  options: unknown,
  defaults: {
    stage: string
    defaultResolution: ScopeResolution
    dedupeKey?: (item: any) => string | undefined
  },
): Effect.Effect<any[], unknown> {
  const resolution = normalizeScopeResolution(filter.scopeResolution, defaults.defaultResolution)
  const normalizedScopeId = normalizeNonEmpty(filter.scopeId)
  const matchEq = { ...(filter as Record<string, unknown>) }
  delete matchEq.scopeResolution

  if (!normalizedScopeId || resolution === 'explicit') {
    return repository.find({ matchEq, options }).pipe(
      Effect.map((rows) => Array.from(rows)),
    )
  }

  const unpaginatedOptions = stripPaginationOptions(options)
  return resolveScopeChain(scopeRepository, normalizedScopeId, resolution, defaults.stage).pipe(
    Effect.flatMap((scopeChain) =>
      Effect.forEach(
        scopeChain,
        (chainScopeId) =>
          repository.find({
            matchEq: {
              ...matchEq,
              ...(normalizedScopeId ? { scopeId: chainScopeId } : {}),
            },
            options: unpaginatedOptions,
          }).pipe(Effect.map((rows) => Array.from(rows))),
        { concurrency: 1 },
      ),
    ),
    Effect.map((rowsByScope) => {
      const merged = rowsByScope.flat()
      const dedupeKey = defaults.dedupeKey
      if (!dedupeKey) {
        return applyPagination(merged, options)
      }

      const seen = new Set<string>()
      const deduped: any[] = []
      for (const row of merged) {
        const key = normalizeNonEmpty(dedupeKey(row))
        if (!key) {
          deduped.push(row)
          continue
        }
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(row)
      }
      return applyPagination(deduped, options)
    }),
  )
}
