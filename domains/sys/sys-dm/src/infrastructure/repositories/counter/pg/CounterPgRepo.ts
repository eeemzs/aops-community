import { and, eq, ilike } from 'drizzle-orm'
import { Effect } from 'effect'
import { DbQueryOptions, RepositoryConfig, RepositoryError } from '@aopslab/xf-db'
import { DraBase, DraBaseError, sql, type SQL } from '@aopslab/xf-db-drizzle'
import type { XfLogger } from '@aopslab/xf-logger'

import type { IbmCounter } from '../../../../domain/models/index.js'
import type {
  CounterRepositoryAllocateInput,
  CounterRepositoryResetInput,
  CounterRepositorySelector,
  IRepositoryPortCounter,
} from '../../../../application/ports/repository-ports/index.js'
import { pgCounter, type IdbCounterDrizzlePg } from '../../../db/counter/pg/index.js'
import { mapperCounterPg } from '../../../db/counter/pg/pg.mapper.counter.js'

function firstOrNull<T>(rows: T[]): T | null {
  return rows.length > 0 ? rows[0] ?? null : null
}

function normalizeScopeId(scopeId: string | undefined): string {
  const normalized = typeof scopeId === 'string' ? scopeId.trim() : ''
  return normalized || 'default'
}

export class CounterPgRepo
  extends DraBase<IbmCounter, IdbCounterDrizzlePg, typeof pgCounter>
  implements IRepositoryPortCounter
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(pgCounter, {
      mapper: mapperCounterPg,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }

  private buildScopedCondition(input: CounterRepositorySelector): SQL<unknown> {
    return and(
      eq(pgCounter.tenantId, this.tenantId),
      eq(pgCounter.scopeId, normalizeScopeId(input.scopeId)),
      eq(pgCounter.counterKey, input.counterKey),
    ) as SQL<unknown>
  }

  findByKey(input: CounterRepositorySelector): Effect.Effect<IbmCounter | null, RepositoryError> {
    return this.find({
      match: this.buildScopedCondition(input),
      options: { limit: 1 } as DbQueryOptions<IdbCounterDrizzlePg>,
    }).pipe(Effect.map((rows) => firstOrNull(rows)))
  }

  listCounters(input?: {
    scopeId?: string
    counterKeyPrefix?: string
    limit?: number
    options?: DbQueryOptions<IbmCounter>
  }): Effect.Effect<IbmCounter[], RepositoryError> {
    const conditions: SQL<unknown>[] = [eq(pgCounter.tenantId, this.tenantId) as SQL<unknown>]
    if (input?.scopeId) conditions.push(eq(pgCounter.scopeId, normalizeScopeId(input.scopeId)) as SQL<unknown>)
    if (input?.counterKeyPrefix) conditions.push(ilike(pgCounter.counterKey, `${input.counterKeyPrefix}%`) as SQL<unknown>)

    return this.find({
      match: conditions.length === 1 ? conditions[0] : (and(...conditions) as SQL<unknown>),
      options: {
        ...(input?.options as DbQueryOptions<IdbCounterDrizzlePg> | undefined),
        limit: Math.max(1, Math.min(Math.trunc(input?.limit ?? 100), 1000)),
      },
    })
  }

  allocateNext(input: CounterRepositoryAllocateInput): Effect.Effect<IbmCounter, RepositoryError> {
    const self = this
    const scopeId = normalizeScopeId(input.scopeId)
    const prefix = input.prefix ?? null
    const metadataJson = input.metadataJson ?? null
    const effectivePrefixSql = sql`coalesce(${prefix}, ${pgCounter.prefix}, '')`
    const effectiveWidthSql = sql`coalesce(${input.width}, ${pgCounter.width}, 5)`
    const formattedSql = sql`case
      when ${effectivePrefixSql} = '' then ${pgCounter.nextValue}::text
      else ${effectivePrefixSql} || '-' || lpad(${pgCounter.nextValue}::text, ${effectiveWidthSql}, '0')
    end`

    return Effect.tryPromise({
      try: async () => {
        const db = await Effect.runPromise(self.getDb())
        const executor = (self.tx() ?? db) as any
        const rows = await executor
          .insert(pgCounter)
          .values({
            tenantId: self.tenantId,
            scopeId,
            counterKey: input.counterKey,
            prefix,
            width: input.width,
            nextValue: input.startAt + input.step,
            step: input.step,
            lastValue: input.startAt,
            lastFormattedValue: input.formattedValue,
            metadataJson,
          })
          .onConflictDoUpdate({
            target: [pgCounter.tenantId, pgCounter.scopeId, pgCounter.counterKey],
            set: {
              prefix: sql`coalesce(${prefix}, ${pgCounter.prefix})`,
              width: sql`coalesce(${input.width}, ${pgCounter.width}, 5)`,
              step: input.step,
              lastValue: sql`${pgCounter.nextValue}`,
              lastFormattedValue: formattedSql,
              nextValue: sql`${pgCounter.nextValue} + ${input.step}`,
              metadataJson: sql`coalesce(${metadataJson}, ${pgCounter.metadataJson})`,
              updatedAt: sql`now()`,
            },
          })
          .returning()
          .execute()
        const row = firstOrNull(rows)
        if (!row) {
          throw new Error('counter_allocate_no_row')
        }
        return row as IbmCounter
      },
      catch: (error) =>
        new DraBaseError({
          repository: self.constructor.name,
          tenantId: self.tenantId,
          message: 'Failed to allocate counter value',
          operation: 'allocateNext',
          stage: `${self.constructor.name}::allocateNext`,
          cause: error,
          code: 'Exception',
        }),
    })
  }

  resetCounter(input: CounterRepositoryResetInput): Effect.Effect<IbmCounter, RepositoryError> {
    const self = this
    const scopeId = normalizeScopeId(input.scopeId)
    const prefix = input.prefix ?? null
    const metadataJson = input.metadataJson ?? null

    return Effect.tryPromise({
      try: async () => {
        const db = await Effect.runPromise(self.getDb())
        const executor = (self.tx() ?? db) as any
        const rows = await executor
          .insert(pgCounter)
          .values({
            tenantId: self.tenantId,
            scopeId,
            counterKey: input.counterKey,
            prefix,
            width: input.width,
            nextValue: input.nextValue,
            step: input.step,
            lastValue: null,
            lastFormattedValue: null,
            metadataJson,
          })
          .onConflictDoUpdate({
            target: [pgCounter.tenantId, pgCounter.scopeId, pgCounter.counterKey],
            set: {
              prefix: sql`coalesce(${prefix}, ${pgCounter.prefix})`,
              width: input.width,
              nextValue: input.nextValue,
              step: input.step,
              lastValue: null,
              lastFormattedValue: null,
              metadataJson: sql`coalesce(${metadataJson}, ${pgCounter.metadataJson})`,
              updatedAt: sql`now()`,
            },
          })
          .returning()
          .execute()
        const row = firstOrNull(rows)
        if (!row) {
          throw new Error('counter_reset_no_row')
        }
        return row as IbmCounter
      },
      catch: (error) =>
        new DraBaseError({
          repository: self.constructor.name,
          tenantId: self.tenantId,
          message: 'Failed to reset counter',
          operation: 'resetCounter',
          stage: `${self.constructor.name}::resetCounter`,
          cause: error,
          code: 'Exception',
        }),
    })
  }
}
