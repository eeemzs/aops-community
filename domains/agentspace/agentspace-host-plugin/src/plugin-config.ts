import type {
  AgentspaceOperationInput,
  AgentspaceOperationOutput,
  AgentspaceTypedOperationId,
} from '@aopslab/domain-kit-agentspace'
import { normalizeNonEmpty, toRecord } from '@aopslab/domain-kit-agentspace/shared'

import type { HostPluginTimeoutOptions } from './lifecycle-guards.js'

export type AgentspaceRunner = <TId extends AgentspaceTypedOperationId>(
  operationId: TId,
  input: AgentspaceOperationInput<TId>,
) => Promise<AgentspaceOperationOutput<TId>>

export type AgentspacePluginOptions = {
  runner?: AgentspaceRunner
  defaultTenantId?: string
  refreshProjectionOnCreate?: boolean
  requiredRuntimeEnv?: string[]
} & HostPluginTimeoutOptions<AgentspaceTypedOperationId>

export type AgentspaceResolvedPluginOptions = {
  runner?: AgentspaceRunner
  defaultTenantId?: string
  refreshProjectionOnCreate: boolean
  requiredRuntimeEnv: string[]
} & HostPluginTimeoutOptions<AgentspaceTypedOperationId>

const DEFAULT_REQUIRED_RUNTIME_ENV = ['AOPS_PG_URL']

function toConfigError(field: string, detail = 'invalid'): Error {
  return new Error(`plugin_contract_invalid:${field}:${detail}`)
}

function toFinitePositiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return null
  if (parsed <= 0) return null
  return parsed
}

function normalizeRuntimeEnvList(value: unknown): string[] {
  if (value === undefined) return [...DEFAULT_REQUIRED_RUNTIME_ENV]
  if (!Array.isArray(value)) {
    throw toConfigError('requiredRuntimeEnv', 'must_be_array')
  }
  const normalized = value
    .map((entry) => normalizeNonEmpty(entry))
    .filter((entry): entry is string => Boolean(entry))
  return Array.from(new Set(normalized))
}

function normalizeOperationTimeoutByOperationId(
  value: unknown,
): Partial<Record<AgentspaceTypedOperationId, number>> | undefined {
  if (value === undefined) return undefined
  const record = toRecord(value)
  if (Object.keys(record).length === 0 && value && typeof value === 'object' && !Array.isArray(value)) {
    return {}
  }
  if (Object.keys(record).length === 0) {
    throw toConfigError('operationTimeoutByOperationId', 'must_be_record')
  }
  const normalized: Partial<Record<AgentspaceTypedOperationId, number>> = {}
  for (const [operationIdRaw, timeoutRaw] of Object.entries(record)) {
    const operationId = normalizeNonEmpty(operationIdRaw)
    if (!operationId) {
      throw toConfigError('operationTimeoutByOperationId', 'empty_operation_id')
    }
    const timeout = toFinitePositiveNumber(timeoutRaw)
    if (timeout === null) {
      throw toConfigError(`operationTimeoutByOperationId.${operationId}`, 'must_be_positive_number')
    }
    normalized[operationId as AgentspaceTypedOperationId] = timeout
  }
  return normalized
}

export function resolveAgentspacePluginOptions(
  options: AgentspacePluginOptions = {},
): AgentspaceResolvedPluginOptions {
  const source = toRecord(options)

  const runner = source.runner
  if (runner !== undefined && typeof runner !== 'function') {
    throw toConfigError('runner', 'must_be_function')
  }

  const defaultTenantId = normalizeNonEmpty(source.defaultTenantId)
  if (source.defaultTenantId !== undefined && !defaultTenantId) {
    throw toConfigError('defaultTenantId', 'must_be_non_empty_string')
  }

  const operationTimeoutMsRaw = source.operationTimeoutMs
  const operationTimeoutMs =
    operationTimeoutMsRaw === undefined ? undefined : toFinitePositiveNumber(operationTimeoutMsRaw)
  if (operationTimeoutMsRaw !== undefined && operationTimeoutMs === null) {
    throw toConfigError('operationTimeoutMs', 'must_be_positive_number')
  }

  const operationTimeoutByOperationId = normalizeOperationTimeoutByOperationId(
    source.operationTimeoutByOperationId,
  )

  const refreshProjectionRaw = source.refreshProjectionOnCreate
  if (refreshProjectionRaw !== undefined && typeof refreshProjectionRaw !== 'boolean') {
    throw toConfigError('refreshProjectionOnCreate', 'must_be_boolean')
  }
  const refreshProjectionOnCreate = refreshProjectionRaw === undefined ? true : refreshProjectionRaw

  const requiredRuntimeEnv = normalizeRuntimeEnvList(source.requiredRuntimeEnv)

  return {
    runner: runner as AgentspaceRunner | undefined,
    defaultTenantId: defaultTenantId || undefined,
    operationTimeoutMs: operationTimeoutMs ?? undefined,
    operationTimeoutByOperationId,
    refreshProjectionOnCreate,
    requiredRuntimeEnv,
  }
}
