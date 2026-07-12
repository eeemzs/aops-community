import type { Effect } from 'effect'
import type {
  CounterListInput,
  CounterNextInput,
  CounterResetInput,
  CounterSelectorInput,
} from '@aopslab/domain-dm-sys/ports'

import type { SysKitServices } from '../domain-services/types.js'
import { SYS_CUSTOM_OPERATIONS } from './catalog.data.js'

type SysCatalogRow = (typeof SYS_CUSTOM_OPERATIONS)[number]
type SysOperationId = Extract<SysCatalogRow['operationId'], string>

type RowService<TRow extends SysCatalogRow> =
  TRow['serviceKey'] extends keyof SysKitServices
    ? SysKitServices[TRow['serviceKey']]
    : never

type RowMethod<TRow extends SysCatalogRow> =
  TRow['methodName'] extends keyof RowService<TRow>
    ? RowService<TRow>[TRow['methodName']]
    : never

type RowParams<TRow extends SysCatalogRow> =
  RowMethod<TRow> extends (...args: infer TArgs) => unknown
    ? TArgs
    : never

type RowResult<TRow extends SysCatalogRow> =
  RowMethod<TRow> extends (...args: unknown[]) => infer TResult
    ? TResult
    : never

type UnwrapEffect<T> = T extends Effect.Effect<infer A, unknown, unknown>
  ? A
  : Awaited<T>

type BuildInputShape<
  TRow extends SysCatalogRow,
  TParams extends readonly unknown[] = RowParams<TRow>,
> = {
  [I in keyof TRow['args'] as TRow['args'][I] extends {
    name: infer N extends string
    optional: false
  }
    ? N
    : never]: I extends keyof TParams
    ? TParams[I]
    : never
} & {
  [I in keyof TRow['args'] as TRow['args'][I] extends {
    name: infer N extends string
    optional: true
  }
    ? N
    : never]?: I extends keyof TParams
    ? TParams[I]
    : never
}

type SysOperationInputOverrideById = {
  'country.search': {
    query?: string
    excludeIso2Codes?: string[]
    limit?: number
    suggestedFirst?: boolean
  }
  'event-store.publish': {
    eventType: string
    aggregateId: string
    eventData?: string
    occurredAt?: Date | string
    version?: number
    eventId?: string
  }
  'counter.get': CounterSelectorInput
  'counter.list': CounterListInput
  'counter.preview-next': CounterNextInput
  'counter.next': CounterNextInput
  'counter.reset': CounterResetInput
}

type RowInput<TRow extends SysCatalogRow> =
  TRow['operationId'] extends keyof SysOperationInputOverrideById
    ? SysOperationInputOverrideById[TRow['operationId']]
    : BuildInputShape<TRow>

type RowByOperationId<TId extends SysOperationId> = Extract<SysCatalogRow, { operationId: TId }>

export type SysOperationInputById = {
  [TId in SysOperationId]: RowInput<RowByOperationId<TId>>
}

export type SysOperationOutputById = {
  [TId in SysOperationId]: UnwrapEffect<RowResult<RowByOperationId<TId>>>
}

export type SysTypedOperationId = SysOperationId

export type SysOperationHostContextInput = {
  workspaceId?: string
}

export type SysOperationInput<TId extends SysTypedOperationId> = SysOperationInputById[TId] & SysOperationHostContextInput
export type SysOperationOutput<TId extends SysTypedOperationId> = SysOperationOutputById[TId]
