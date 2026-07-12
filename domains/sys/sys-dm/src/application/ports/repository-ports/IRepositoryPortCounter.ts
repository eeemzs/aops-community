import { DbQueryOptions, IRepositoryBaseCrud, RepositoryError } from '@aopslab/xf-db'
import { Effect } from 'effect'
import type { IbmCounter } from '../../../domain/models/index.js'

export type CounterRepositorySelector = {
  counterKey: string
  scopeId: string
}

export type CounterRepositoryAllocateInput = CounterRepositorySelector & {
  prefix?: string | null
  width: number
  startAt: number
  step: number
  formattedValue: string
  metadataJson?: Record<string, unknown> | null
}

export type CounterRepositoryResetInput = CounterRepositorySelector & {
  prefix?: string | null
  width: number
  nextValue: number
  step: number
  metadataJson?: Record<string, unknown> | null
}

export interface IRepositoryPortCounter extends IRepositoryBaseCrud<IbmCounter, any, RepositoryError> {
  findByKey(input: CounterRepositorySelector): Effect.Effect<IbmCounter | null, RepositoryError>
  listCounters(input?: {
    scopeId?: string
    counterKeyPrefix?: string
    limit?: number
    options?: DbQueryOptions<IbmCounter>
  }): Effect.Effect<IbmCounter[], RepositoryError>
  allocateNext(input: CounterRepositoryAllocateInput): Effect.Effect<IbmCounter, RepositoryError>
  resetCounter(input: CounterRepositoryResetInput): Effect.Effect<IbmCounter, RepositoryError>
}
