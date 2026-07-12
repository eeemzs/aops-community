import { Effect } from 'effect'
import { effectErrorInfo } from '@aopslab/xf-core'
import type { XfLogger } from '@aopslab/xf-logger'

import type { IbmCounter } from '../../../domain/models/index.js'
import {
  CounterErrorCode,
  CounterDomainError,
  CounterErrorFactory,
  type CounterServiceError,
} from '../../errors/CounterServiceError.js'
import type {
  CounterListInput,
  CounterNextInput,
  CounterNextResult,
  CounterResetInput,
  CounterSelectorInput,
  ICounterServicePort,
} from '../../ports/inbound/ICounterServicePort.js'
import type { IRepositoryPortCounter } from '../../ports/repository-ports/index.js'

const DEFAULT_SCOPE_ID = 'default'
const DEFAULT_COUNTER_WIDTH = 5
const DEFAULT_COUNTER_START_AT = 1
const DEFAULT_COUNTER_STEP = 1

export type CounterServiceOptions = {
  counterRepository: IRepositoryPortCounter
  logger?: XfLogger
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeCounterKey(value: unknown): string {
  const normalized = normalizeText(value)
  if (!normalized) {
    throw CounterErrorFactory.counterDomainError({
      code: CounterErrorCode.InvalidInput,
      message: 'counterKey is required.',
      stage: 'CounterService::normalizeCounterKey',
    })
  }
  return normalized
}

function normalizeScopeId(value: unknown): string {
  return normalizeText(value) || DEFAULT_SCOPE_ID
}

function normalizePositiveInteger(value: unknown, fallback: number, label: string): number {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw CounterErrorFactory.counterDomainError({
      code: CounterErrorCode.InvalidInput,
      message: `${label} must be a positive integer.`,
      stage: 'CounterService::normalizePositiveInteger',
    })
  }
  return parsed
}

export function formatCounterValue(value: number, options?: { prefix?: string | null; width?: number | null }): string {
  const prefix = normalizeText(options?.prefix).toUpperCase()
  const width = Math.max(1, Math.min(Math.trunc(Number(options?.width ?? DEFAULT_COUNTER_WIDTH) || DEFAULT_COUNTER_WIDTH), 18))
  const numeric = String(value).padStart(width, '0')
  return prefix ? `${prefix}-${numeric}` : String(value)
}

export class CounterService implements ICounterServicePort {
  private readonly counterRepository: IRepositoryPortCounter
  private readonly logger?: XfLogger

  constructor(options: CounterServiceOptions) {
    this.counterRepository = options.counterRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  private mapCounterRepositoryError(params: {
    stage: string
    operation: string
    code: CounterErrorCode
    counterKey?: string
    scopeId?: string
  }): (cause: unknown) => CounterServiceError {
    return (cause) => {
      if (cause instanceof CounterDomainError) return cause
      return CounterErrorFactory.counterDomainError({
        code: params.code,
        stage: params.stage,
        operation: params.operation,
        message: `Counter repository operation failed: ${params.operation}`,
        counterKey: params.counterKey,
        scopeId: params.scopeId,
        cause,
      })
    }
  }

  getCounter(input: CounterSelectorInput): Effect.Effect<IbmCounter | null, CounterServiceError> {
    const stage = 'CounterService::getCounter'
    const counterKey = normalizeCounterKey(input.counterKey)
    const scopeId = normalizeScopeId(input.scopeId)
    return this.counterRepository.findByKey({ counterKey, scopeId }).pipe(
      Effect.mapError(
        this.mapCounterRepositoryError({
          stage,
          operation: 'counterRepository.findByKey',
          code: CounterErrorCode.ReadFailed,
          counterKey,
          scopeId,
        }),
      ),
    )
  }

  listCounters(input?: CounterListInput): Effect.Effect<IbmCounter[], CounterServiceError> {
    const stage = 'CounterService::listCounters'
    return this.counterRepository
      .listCounters({
        scopeId: input?.scopeId ? normalizeScopeId(input.scopeId) : undefined,
        counterKeyPrefix: normalizeText(input?.counterKeyPrefix) || undefined,
        limit: normalizePositiveInteger(input?.limit, 100, 'limit'),
      })
      .pipe(
        Effect.mapError(
          this.mapCounterRepositoryError({
            stage,
            operation: 'counterRepository.listCounters',
            code: CounterErrorCode.ReadFailed,
          }),
        ),
      )
  }

  previewNextCounter(input: CounterNextInput): Effect.Effect<CounterNextResult, CounterServiceError> {
    const stage = 'CounterService::previewNextCounter'
    const self = this
    return Effect.gen(function* (_) {
      const normalized = self.normalizeNextInput(input)
      const existing = yield* _(self.getCounter(normalized))
      const value = existing?.nextValue ?? normalized.startAt
      const prefix = normalized.prefix ?? existing?.prefix ?? null
      const width = normalized.width ?? existing?.width ?? DEFAULT_COUNTER_WIDTH
      const step = normalized.step ?? existing?.step ?? DEFAULT_COUNTER_STEP
      const formattedValue = formatCounterValue(value, { prefix, width })
      return {
        counterKey: normalized.counterKey,
        scopeId: normalized.scopeId,
        value,
        formattedValue,
        nextValue: value + step,
        step,
        prefix,
        width,
        counter:
          existing ??
          ({
            scopeId: normalized.scopeId,
            counterKey: normalized.counterKey,
            prefix,
            width,
            nextValue: value,
            step,
            lastValue: null,
            lastFormattedValue: null,
            metadataJson: normalized.metadataJson ?? null,
          } as IbmCounter),
      }
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          self.logger?.error({ error: info.unwrapped, cause: info.pretty, stage }, 'previewNextCounter failed')
        }),
      ),
    )
  }

  allocateNextCounter(input: CounterNextInput): Effect.Effect<CounterNextResult, CounterServiceError> {
    const stage = 'CounterService::allocateNextCounter'
    const self = this
    return Effect.gen(function* (_) {
      const normalized = self.normalizeNextInput(input)
      const formattedValue = formatCounterValue(normalized.startAt, normalized)
      const counter = yield* _(
        self.counterRepository
          .allocateNext({
            counterKey: normalized.counterKey,
            scopeId: normalized.scopeId,
            prefix: normalized.prefix,
            width: normalized.width,
            startAt: normalized.startAt,
            step: normalized.step,
            formattedValue,
            metadataJson: normalized.metadataJson,
          })
          .pipe(
            Effect.mapError(
              self.mapCounterRepositoryError({
                stage,
                operation: 'counterRepository.allocateNext',
                code: CounterErrorCode.AllocateFailed,
                counterKey: normalized.counterKey,
                scopeId: normalized.scopeId,
              }),
            ),
          ),
      )
      const value = counter.lastValue ?? Math.max(0, Number(counter.nextValue) - normalized.step)
      const prefix = counter.prefix ?? normalized.prefix
      const width = counter.width ?? normalized.width
      const formatted = counter.lastFormattedValue ?? formatCounterValue(value, { prefix, width })
      return {
        counterKey: normalized.counterKey,
        scopeId: normalized.scopeId,
        value,
        formattedValue: formatted,
        nextValue: counter.nextValue,
        step: counter.step ?? normalized.step,
        prefix,
        width,
        counter,
      }
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          self.logger?.error({ error: info.unwrapped, cause: info.pretty, stage }, 'allocateNextCounter failed')
        }),
      ),
    )
  }

  resetCounter(input: CounterResetInput): Effect.Effect<IbmCounter, CounterServiceError> {
    const stage = 'CounterService::resetCounter'
    const counterKey = normalizeCounterKey(input.counterKey)
    const scopeId = normalizeScopeId(input.scopeId)
    const prefix = normalizeText(input.prefix) || null
    const width = normalizePositiveInteger(input.width, DEFAULT_COUNTER_WIDTH, 'width')
    const nextValue = normalizePositiveInteger(input.nextValue, DEFAULT_COUNTER_START_AT, 'nextValue')
    const step = normalizePositiveInteger(input.step, DEFAULT_COUNTER_STEP, 'step')

    return this.counterRepository
      .resetCounter({
        counterKey,
        scopeId,
        prefix,
        width,
        nextValue,
        step,
        metadataJson: input.metadataJson,
      })
      .pipe(
        Effect.mapError(
          this.mapCounterRepositoryError({
            stage,
            operation: 'counterRepository.resetCounter',
            code: CounterErrorCode.ResetFailed,
            counterKey,
            scopeId,
          }),
        ),
      )
  }

  private normalizeNextInput(input: CounterNextInput): Required<Pick<CounterNextInput, 'counterKey' | 'scopeId' | 'startAt' | 'step'>> & {
    prefix: string | null
    width: number
    metadataJson?: Record<string, unknown> | null
  } {
    const counterKey = normalizeCounterKey(input.counterKey)
    const scopeId = normalizeScopeId(input.scopeId)
    const prefix = normalizeText(input.prefix) || null
    const width = normalizePositiveInteger(input.width, DEFAULT_COUNTER_WIDTH, 'width')
    const startAt = normalizePositiveInteger(input.startAt, DEFAULT_COUNTER_START_AT, 'startAt')
    const step = normalizePositiveInteger(input.step, DEFAULT_COUNTER_STEP, 'step')
    return {
      counterKey,
      scopeId,
      prefix,
      width,
      startAt,
      step,
      ...(input.metadataJson !== undefined ? { metadataJson: input.metadataJson } : {}),
    }
  }
}
