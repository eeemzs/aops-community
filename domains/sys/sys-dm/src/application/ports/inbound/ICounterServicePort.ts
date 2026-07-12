import { Effect } from 'effect'
import type { IbmCounter } from '../../../domain/models/index.js'
import type { CounterServiceError } from '../../errors/CounterServiceError.js'

export type CounterFormatOptions = {
  prefix?: string | null
  width?: number | null
}

export type CounterSelectorInput = {
  counterKey: string
  scopeId?: string
}

export type CounterNextInput = CounterSelectorInput &
  CounterFormatOptions & {
    startAt?: number
    step?: number
    metadataJson?: Record<string, unknown> | null
  }

export type CounterResetInput = CounterSelectorInput &
  CounterFormatOptions & {
    nextValue?: number
    step?: number
    metadataJson?: Record<string, unknown> | null
  }

export type CounterListInput = {
  scopeId?: string
  counterKeyPrefix?: string
  limit?: number
}

export type CounterNextResult = {
  counterKey: string
  scopeId: string
  value: number
  formattedValue: string
  nextValue: number
  step: number
  prefix?: string | null
  width?: number | null
  counter: IbmCounter
}

export interface ICounterServicePort {
  getCounter(input: CounterSelectorInput): Effect.Effect<IbmCounter | null, CounterServiceError>
  listCounters(input?: CounterListInput): Effect.Effect<IbmCounter[], CounterServiceError>
  previewNextCounter(input: CounterNextInput): Effect.Effect<CounterNextResult, CounterServiceError>
  allocateNextCounter(input: CounterNextInput): Effect.Effect<CounterNextResult, CounterServiceError>
  resetCounter(input: CounterResetInput): Effect.Effect<IbmCounter, CounterServiceError>
}
