import { Effect } from 'effect'
import { MraBase } from '@aopslab/xf-db-mongoose'
import { RepositoryConfig, RepositoryError } from '@aopslab/xf-db'
import type { XfLogger } from '@aopslab/xf-logger'

import type { IbmCounter } from '../../../../domain/models/index.js'
import type {
  CounterRepositoryAllocateInput,
  CounterRepositoryResetInput,
  CounterRepositorySelector,
  IRepositoryPortCounter,
} from '../../../../application/ports/repository-ports/index.js'
import { DbCounter, type IdbCounter } from '../../../db/counter/mongoose/index.js'
import { mapperCounterMongoose } from '../../../db/counter/mongoose/mongoose.mapper.counter.js'

function normalizeScopeId(scopeId: string | undefined): string {
  const normalized = typeof scopeId === 'string' ? scopeId.trim() : ''
  return normalized || 'default'
}

export class CounterMongooseRepo
  extends MraBase<IbmCounter, IdbCounter>
  implements IRepositoryPortCounter
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(DbCounter, {
      mapper: mapperCounterMongoose,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }

  findByKey(input: CounterRepositorySelector): Effect.Effect<IbmCounter | null, RepositoryError> {
    return this.find({
      counterKey: input.counterKey,
      scopeId: normalizeScopeId(input.scopeId),
    } as any).pipe(Effect.map((rows) => rows.at(0) ?? null))
  }

  listCounters(input?: {
    scopeId?: string
    counterKeyPrefix?: string
    limit?: number
  }): Effect.Effect<IbmCounter[], RepositoryError> {
    const match: Record<string, unknown> = {}
    if (input?.scopeId) match.scopeId = normalizeScopeId(input.scopeId)
    if (input?.counterKeyPrefix) match.counterKey = new RegExp(`^${input.counterKeyPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    const options = { limit: Math.max(1, Math.min(Math.trunc(input?.limit ?? 100), 1000)) } as any
    return this.find(match as any, options)
  }

  allocateNext(input: CounterRepositoryAllocateInput): Effect.Effect<IbmCounter, RepositoryError> {
    const self = this
    return Effect.tryPromise({
      try: async () => {
        const collection = await Effect.runPromise(self.getCollection())
        const scopeId = normalizeScopeId(input.scopeId)
        const update = {
          $setOnInsert: {
            tenantId: self.tenantId,
            scopeId,
            counterKey: input.counterKey,
            prefix: input.prefix ?? null,
            width: input.width,
            step: input.step,
            metadataJson: input.metadataJson ?? null,
          },
          $set: {
            prefix: input.prefix ?? undefined,
            width: input.width,
            step: input.step,
            updatedAt: new Date(),
          },
          $inc: { nextValue: input.step },
        }
        const row = await collection.findOneAndUpdate(
          { tenantId: self.tenantId, scopeId, counterKey: input.counterKey },
          update,
          {
            upsert: true,
            returnDocument: 'after',
            setDefaultsOnInsert: true,
          },
        )
        if (!row) throw new Error('counter_allocate_no_row')
        const counter = mapperCounterMongoose.toDomain(row as IdbCounter) as IbmCounter
        const value = Math.max(0, Number(counter.nextValue) - input.step)
        counter.lastValue = value
        counter.lastFormattedValue = input.formattedValue
        await collection.updateOne(
          { _id: (row as any)._id },
          { $set: { lastValue: value, lastFormattedValue: input.formattedValue, updatedAt: new Date() } },
        )
        return counter
      },
      catch: (error) => (error instanceof Error ? error : new Error(String(error))) as RepositoryError,
    })
  }

  resetCounter(input: CounterRepositoryResetInput): Effect.Effect<IbmCounter, RepositoryError> {
    const self = this
    return Effect.tryPromise({
      try: async () => {
        const collection = await Effect.runPromise(self.getCollection())
        const scopeId = normalizeScopeId(input.scopeId)
        const row = await collection.findOneAndUpdate(
          { tenantId: self.tenantId, scopeId, counterKey: input.counterKey },
          {
            $set: {
              tenantId: self.tenantId,
              scopeId,
              counterKey: input.counterKey,
              prefix: input.prefix ?? null,
              width: input.width,
              nextValue: input.nextValue,
              step: input.step,
              lastValue: null,
              lastFormattedValue: null,
              metadataJson: input.metadataJson ?? null,
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          { upsert: true, returnDocument: 'after' },
        )
        if (!row) throw new Error('counter_reset_no_row')
        return mapperCounterMongoose.toDomain(row as IdbCounter) as IbmCounter
      },
      catch: (error) => (error instanceof Error ? error : new Error(String(error))) as RepositoryError,
    })
  }
}
