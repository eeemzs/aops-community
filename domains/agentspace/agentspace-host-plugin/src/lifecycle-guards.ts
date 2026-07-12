import {
  normalizeNonEmpty,
  resolveProjectContextValue,
  resolveScopeContextValue,
  toRecord,
} from '@aopslab/domain-kit-agentspace/shared'

import type { HostRequestContext } from './types.js'

const DEFAULT_OPERATION_TIMEOUT_MS = 15_000
const MIN_OPERATION_TIMEOUT_MS = 100
const MAX_OPERATION_TIMEOUT_MS = 120_000

function clampOperationTimeoutMs(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_OPERATION_TIMEOUT_MS
  if (value < MIN_OPERATION_TIMEOUT_MS) return MIN_OPERATION_TIMEOUT_MS
  if (value > MAX_OPERATION_TIMEOUT_MS) return MAX_OPERATION_TIMEOUT_MS
  return Math.floor(value)
}

export type HostPluginTimeoutOptions<TOperationId extends string> = {
  operationTimeoutMs?: number
  operationTimeoutByOperationId?: Partial<Record<TOperationId, number>>
}

export function resolveOperationTimeoutMs<TOperationId extends string>(
  operationId: TOperationId,
  options: HostPluginTimeoutOptions<TOperationId>,
): number {
  const perOperation = options.operationTimeoutByOperationId?.[operationId]
  if (typeof perOperation === 'number') return clampOperationTimeoutMs(perOperation)
  if (typeof options.operationTimeoutMs === 'number') return clampOperationTimeoutMs(options.operationTimeoutMs)
  return DEFAULT_OPERATION_TIMEOUT_MS
}

function toTimeoutError(operationId: string, timeoutMs: number): Error {
  return new Error(`agentspace.serviceUnavailable:operation_timeout:${operationId}:${timeoutMs}`)
}

export async function runWithOperationTimeout<T>(
  operationId: string,
  timeoutMs: number,
  run: () => Promise<T>,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(toTimeoutError(operationId, timeoutMs))
    }, timeoutMs)

    void run()
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

export function buildContextScopedInput(
  inputBase: Record<string, unknown>,
  context: HostRequestContext,
  defaultTenantId?: string,
): Record<string, unknown> {
  const contextRecord = toRecord(context)
  const contextTenantId =
    normalizeNonEmpty(contextRecord.tenantId) ??
    normalizeNonEmpty(defaultTenantId)
  const contextLocale = normalizeNonEmpty(contextRecord.locale)
  const contextFallbackLocale = normalizeNonEmpty(contextRecord.fallbackLocale)
  const contextProject = resolveProjectContextValue(contextRecord)
  const contextScope = resolveScopeContextValue(contextRecord)
  const contextScopeResolution = normalizeNonEmpty(contextRecord.scopeResolution)

  const payloadTenantId = normalizeNonEmpty(inputBase.tenantId)
  if (contextTenantId && payloadTenantId && contextTenantId !== payloadTenantId) {
    throw new Error('validation_failed:tenant_context_mismatch')
  }

  const payloadProject = resolveProjectContextValue(inputBase)
  if (contextProject && payloadProject && contextProject !== payloadProject) {
    throw new Error('validation_failed:project_context_mismatch')
  }

  const payloadScope = normalizeNonEmpty(inputBase.scopeId)
  if (contextScope && payloadScope && contextScope !== payloadScope) {
    throw new Error('validation_failed:scope_context_mismatch')
  }

  const hostContext = {
    ...(contextTenantId ? { tenantId: contextTenantId } : {}),
    ...(contextLocale ? { locale: contextLocale } : {}),
    ...(contextFallbackLocale ? { fallbackLocale: contextFallbackLocale } : {}),
    ...(contextProject ? { projectId: contextProject } : {}),
    ...(contextScope ? { scopeId: contextScope } : {}),
    ...(contextScopeResolution === 'explicit' || contextScopeResolution === 'cascade'
      ? { scopeResolution: contextScopeResolution }
      : {}),
    ...(contextRecord.principal ? { principal: contextRecord.principal } : {}),
  }

  return {
    ...inputBase,
    ...(contextTenantId ? { tenantId: contextTenantId } : {}),
    ...(contextLocale ? { locale: contextLocale } : {}),
    ...(contextFallbackLocale ? { fallbackLocale: contextFallbackLocale } : {}),
    ...(contextProject && !payloadProject ? { projectId: contextProject } : {}),
    ...(contextScope && !payloadScope ? { scopeId: contextScope } : {}),
    ...(Object.keys(hostContext).length > 0 ? { __hostContext: hostContext } : {}),
  }
}

export type SafeFailureEnvelope = {
  status: number
  data: {
    ok: false
    error: 'agentspace_operation_failed'
    errorCode: string
    domain: 'agentspace'
    operation: string
    message: string
  }
}

export function toSafeFailureEnvelope(params: {
  operationId: string
  reason: string
  status: number
  message: string
}): SafeFailureEnvelope {
  return {
    status: params.status,
    data: {
      ok: false,
      error: 'agentspace_operation_failed',
      errorCode: `agentspace_operation_failed.${params.reason}`,
      domain: 'agentspace',
      operation: params.operationId,
      message: params.message,
    },
  }
}
