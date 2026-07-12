import type { Effect } from 'effect'

import type { AgentspaceKitServices } from '../domain-services/types.js'
import { AGENTSPACE_OPERATION_CATALOG_ROWS } from './catalog.data.js'

type AgentspaceCatalogRow = (typeof AGENTSPACE_OPERATION_CATALOG_ROWS)[number]
type AgentspaceOperationId = Extract<AgentspaceCatalogRow['operationId'], string>

type AgentspaceSpecialMethods = {
  hardDeleteAgentspaceProjectCascade: (projectId: string) => Promise<unknown>
}

type AgentspaceServiceByKey = AgentspaceKitServices & {
  __calls__: AgentspaceSpecialMethods
}

type RowService<TRow extends AgentspaceCatalogRow> =
  TRow['serviceKey'] extends keyof AgentspaceServiceByKey
    ? AgentspaceServiceByKey[TRow['serviceKey']]
    : never

type RowMethod<TRow extends AgentspaceCatalogRow> =
  TRow['methodName'] extends keyof RowService<TRow>
    ? RowService<TRow>[TRow['methodName']]
    : never

type RowParams<TRow extends AgentspaceCatalogRow> =
  RowMethod<TRow> extends (...args: infer TArgs) => unknown
    ? TArgs
    : never

type RowResult<TRow extends AgentspaceCatalogRow> =
  RowMethod<TRow> extends (...args: unknown[]) => infer TResult
    ? TResult
    : never

type UnwrapEffect<T> = T extends Effect.Effect<infer A, unknown, unknown>
  ? A
  : Awaited<T>

type BuildInputShape<
  TRow extends AgentspaceCatalogRow,
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

type RowByOperationId<TId extends AgentspaceOperationId> = Extract<AgentspaceCatalogRow, { operationId: TId }>

export type AgentspaceOperationInputById = {
  [TId in AgentspaceOperationId]: BuildInputShape<RowByOperationId<TId>>
}

export type AgentspaceOperationOutputById = {
  [TId in AgentspaceOperationId]: UnwrapEffect<RowResult<RowByOperationId<TId>>>
}

export type AgentspaceTypedOperationId = AgentspaceOperationId

export type AgentspaceOperationHostContextInput = {
  tenantId?: string
  projectId?: string
  scopeId?: string
  locale?: string
  fallbackLocale?: string
}

export type AgentspaceOperationInput<TId extends AgentspaceTypedOperationId> = AgentspaceOperationInputById[TId] & AgentspaceOperationHostContextInput
export type AgentspaceOperationOutput<TId extends AgentspaceTypedOperationId> = AgentspaceOperationOutputById[TId]
