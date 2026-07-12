import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { Effect } from 'effect'
import { config as loadDotEnv } from 'dotenv'

import { createSysKitWithEnv } from '../domain-services/unified.js'
import { getSysKitEnvConfig } from '../config/config.js'
import type { SysOperationArgument } from './types.js'
import type { SysOperationContract } from './contract.js'
import { getSysOperationContractById, getSysOperationContractByToolId } from './contract.js'
import type { SysOperationInput, SysOperationOutput, SysTypedOperationId } from './io-types.js'

type ToolInput = Record<string, unknown>
type ResolvedRateLimitRule = {
  maxAttempts: number
  blockDurationInSeconds: number
  backoffMultiplier?: number
  maxBlockDurationInSeconds?: number
  overrideRedisDefaultTtl?: number
}
type PublishEventInput = {
  eventId: string
  eventType: string
  aggregateId: string
  eventData: string
  occurredAt: Date
  version: number
}

const HOST_META_KEYS = new Set([
  'workspaceId',
  'workspaceUuid',
  'workspaceUid',
  'workspaceName',
  'tenantId',
  'locale',
  'fallbackLocale',
  '__hostContext',
])
const UNHANDLED_OPERATION = Symbol('unhandled_sys_operation')

let envLoaded = false
let cachedServices: Promise<Record<string, unknown>> | null = null

function toRecord(input: unknown): ToolInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input as ToolInput
}

function toSnakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
}

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toObjectOrUndefined(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function sanitizePayload(payload: ToolInput): ToolInput {
  const sanitized: ToolInput = {}
  for (const [key, value] of Object.entries(payload)) {
    if (HOST_META_KEYS.has(key)) continue
    sanitized[key] = value
  }
  return sanitized
}

function requireString(value: unknown, label: string): string {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) throw new Error(`missing_required_${toSnakeCase(label)}`)
  return normalized
}

function isBlankInput(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0)
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function parseOptionalPositiveInteger(value: unknown, label: string): number | undefined {
  if (isBlankInput(value)) return undefined
  const parsed = parseNumber(value)
  if (parsed === undefined || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid_${toSnakeCase(label)}`)
  }
  return parsed
}

function parseOptionalPositiveNumber(value: unknown, label: string): number | undefined {
  if (isBlankInput(value)) return undefined
  const parsed = parseNumber(value)
  if (parsed === undefined || parsed <= 0) {
    throw new Error(`invalid_${toSnakeCase(label)}`)
  }
  return parsed
}

function parseOptionalDate(value: unknown, label: string): Date | undefined {
  if (isBlankInput(value)) return undefined
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  throw new Error(`invalid_${toSnakeCase(label)}`)
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return JSON.parse(trimmed)
  }
  return value
}

function parseJsonObject(value: unknown, label: string): Record<string, unknown> | undefined {
  if (isBlankInput(value)) return undefined
  let parsed: unknown
  try {
    parsed = parseJsonValue(value)
  } catch {
    throw new Error(`invalid_${toSnakeCase(label)}`)
  }
  const record = toObjectOrUndefined(parsed)
  if (!record) throw new Error(`invalid_${toSnakeCase(label)}`)
  return record
}

function normalizeEventData(value: unknown): string {
  if (isBlankInput(value)) return '{}'
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return '{}'

    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed)
        return trimmed
      } catch {
        throw new Error('invalid_event_data')
      }
    }

    return JSON.stringify(trimmed)
  }

  try {
    const serialized = JSON.stringify(value)
    if (typeof serialized !== 'string') throw new Error('invalid_event_data')
    return serialized
  } catch {
    throw new Error('invalid_event_data')
  }
}

function resolveRateLimitRule(payload: ToolInput): ResolvedRateLimitRule | undefined {
  if (payload.rule === undefined) return undefined
  const fromRule = parseJsonObject(payload.rule, 'rule')
  if (!fromRule) return undefined

  const maxAttempts = parseOptionalPositiveInteger(fromRule.maxAttempts, 'rule.maxAttempts')
  if (maxAttempts === undefined) throw new Error('missing_required_rule_max_attempts')

  const blockDurationInSeconds = parseOptionalPositiveInteger(fromRule.blockDurationInSeconds, 'rule.blockDurationInSeconds')
  if (blockDurationInSeconds === undefined) throw new Error('missing_required_rule_block_duration_in_seconds')

  const backoffMultiplier = parseOptionalPositiveNumber(fromRule.backoffMultiplier, 'rule.backoffMultiplier')
  const maxBlockDurationInSeconds = parseOptionalPositiveInteger(fromRule.maxBlockDurationInSeconds, 'rule.maxBlockDurationInSeconds')
  const overrideRedisDefaultTtl = parseOptionalPositiveInteger(fromRule.overrideRedisDefaultTtl, 'rule.overrideRedisDefaultTtl')

  return {
    maxAttempts,
    blockDurationInSeconds,
    ...(backoffMultiplier === undefined ? {} : { backoffMultiplier }),
    ...(maxBlockDurationInSeconds === undefined ? {} : { maxBlockDurationInSeconds }),
    ...(overrideRedisDefaultTtl === undefined ? {} : { overrideRedisDefaultTtl }),
  }
}

function buildPublishEventInput(payload: ToolInput): PublishEventInput {
  const eventType = requireString(payload.eventType, 'eventType')
  const aggregateId = requireString(payload.aggregateId, 'aggregateId')
  const eventData = normalizeEventData(payload.eventData)
  const eventId = normalizeNonEmpty(payload.eventId) ?? randomUUID()
  const occurredAt = parseOptionalDate(payload.occurredAt, 'occurredAt') ?? new Date()
  const version = parseOptionalPositiveInteger(payload.version, 'version') ?? 1

  return {
    eventId,
    eventType,
    aggregateId,
    eventData,
    occurredAt,
    version,
  }
}

function getService(services: Record<string, unknown>, serviceKey: string): Record<string, unknown> {
  const service = services[serviceKey]
  if (!service || typeof service !== 'object' || Array.isArray(service)) {
    throw new Error('sys_service_not_found:' + serviceKey)
  }
  return service as Record<string, unknown>
}

async function invokeEffectMethod(
  service: Record<string, unknown>,
  serviceKey: string,
  methodName: string,
  args: unknown[],
): Promise<unknown> {
  const method = service[methodName]
  if (typeof method !== 'function') {
    throw new Error('sys_method_missing:' + serviceKey + '.' + methodName)
  }

  const effectResult = method.apply(service, args)
  return Effect.runPromise(effectResult)
}

async function runMappedOperation(
  operation: SysOperationContract,
  payload: ToolInput,
  services: Record<string, unknown>,
): Promise<unknown | typeof UNHANDLED_OPERATION> {
  switch (operation.operationId) {
    case 'rate-limiter.check': {
      const service = getService(services, 'rateLimiterService')
      return invokeEffectMethod(service, 'rateLimiterService', 'checkRateLimit', [
        requireString(payload.key, 'key'),
        requireString(payload.scope, 'scope'),
      ])
    }
    case 'rate-limiter.record-attempt': {
      const service = getService(services, 'rateLimiterService')
      return invokeEffectMethod(service, 'rateLimiterService', 'recordAttempt', [
        requireString(payload.key, 'key'),
        requireString(payload.scope, 'scope'),
        resolveRateLimitRule(payload),
      ])
    }
    case 'rate-limiter.reset': {
      const service = getService(services, 'rateLimiterService')
      return invokeEffectMethod(service, 'rateLimiterService', 'resetRateLimit', [
        requireString(payload.key, 'key'),
        requireString(payload.scope, 'scope'),
      ])
    }
    case 'rate-limiter.cleanup-expired': {
      const service = getService(services, 'rateLimiterService')
      return invokeEffectMethod(service, 'rateLimiterService', 'cleanupExpiredEntries', [])
    }
    case 'rate-limiter.stats': {
      const service = getService(services, 'rateLimiterService')
      return invokeEffectMethod(service, 'rateLimiterService', 'getRateLimitStats', [normalizeNonEmpty(payload.scope)])
    }
    case 'event-store.publish': {
      const service = getService(services, 'eventStoreService')
      return invokeEffectMethod(service, 'eventStoreService', 'publishEvent', [buildPublishEventInput(payload)])
    }
    case 'event-store.list-by-aggregate': {
      const service = getService(services, 'eventStoreService')
      return invokeEffectMethod(service, 'eventStoreService', 'getEventsByAggregate', [
        requireString(payload.aggregateId, 'aggregateId'),
      ])
    }
    case 'event-store.list-by-type': {
      const service = getService(services, 'eventStoreService')
      const limit = parseOptionalPositiveInteger(payload.limit, 'limit')
      return invokeEffectMethod(service, 'eventStoreService', 'getEventsByType', [
        requireString(payload.eventType, 'eventType'),
        limit,
      ])
    }
    case 'event-store.list': {
      const service = getService(services, 'eventStoreService')
      const limit = parseOptionalPositiveInteger(payload.limit, 'limit')
      return invokeEffectMethod(service, 'eventStoreService', 'getAllEvents', [limit])
    }
    case 'event-store.cleanup': {
      const service = getService(services, 'eventStoreService')
      return invokeEffectMethod(service, 'eventStoreService', 'cleanupAll', [])
    }
    default:
      return UNHANDLED_OPERATION
  }
}

function loadEnvOnce(): void {
  if (envLoaded) return
  envLoaded = true

  const candidates = [
    process.env.DOTENV_CONFIG_PATH,
    process.env.SYS_ENV_PATH,
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '../..', '.env'),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (!candidate) continue
    if (!fs.existsSync(candidate)) continue
    loadDotEnv({ path: candidate, quiet: true })
    break
  }
}

async function getServices(): Promise<Record<string, unknown>> {
  if (cachedServices) return cachedServices
  cachedServices = (async () => {
    loadEnvOnce()
    const envConfig = getSysKitEnvConfig()
    const { kit } = createSysKitWithEnv({
      envConfig,
      baseContext: { tenantId: envConfig.tenantId },
    })
    const services = await kit.createAll()
    return Object.fromEntries(Object.entries(services))
  })()
  return cachedServices
}

function resolveCustomArgValue(payload: ToolInput, arg: SysOperationArgument): unknown {
  if (arg.name === 'options') {
    const explicitOptions = toObjectOrUndefined(payload.options)
    if (explicitOptions) return explicitOptions
    return undefined
  }
  return payload[arg.name]
}

function buildCrudArgs(operation: SysOperationContract, payload: ToolInput): unknown[] {
  const id = normalizeNonEmpty(payload.id)
  const sanitized = sanitizePayload(payload)

  if (operation.kind === 'list') {
    const options = toObjectOrUndefined(payload.options)
    const filter = toObjectOrUndefined(payload.filter) ?? {}
    return [filter, options]
  }

  if (operation.kind === 'get') {
    const options = toObjectOrUndefined(payload.options)
    if (!id) throw new Error('missing_required_id')
    return [id, options]
  }

  if (operation.kind === 'create') {
    const data = toObjectOrUndefined(payload.data) ?? sanitized
    if (!data || Object.keys(data).length === 0) throw new Error('missing_required_data')
    return [data]
  }

  if (operation.kind === 'update') {
    if (!id) throw new Error('missing_required_id')
    const patch = toObjectOrUndefined(payload.patch) ?? sanitized
    if (!patch || Object.keys(patch).length === 0) throw new Error('missing_required_patch')
    return [id, patch]
  }

  if (operation.kind === 'delete') {
    if (!id) throw new Error('missing_required_id')
    return [id]
  }

  return []
}

function buildCustomArgs(operation: SysOperationContract, payload: ToolInput): unknown[] {
  if (operation.args.length === 0) return []

  if (operation.args.length === 1) {
    const [onlyArg] = operation.args
    if ((onlyArg.name === 'input' || onlyArg.name === 'payload') && payload[onlyArg.name] === undefined) {
      return [sanitizePayload(payload)]
    }
  }

  const args: unknown[] = []
  for (const arg of operation.args) {
    const value = resolveCustomArgValue(payload, arg)
    if (value === undefined && !arg.optional) {
      throw new Error(`missing_required_${toSnakeCase(arg.name)}`)
    }
    args.push(value)
  }
  return args
}

function buildMethodArgs(operation: SysOperationContract, payload: ToolInput): unknown[] {
  if (operation.kind === 'custom') return buildCustomArgs(operation, payload)
  return buildCrudArgs(operation, payload)
}

function resolveOperationByToolId(toolId: string): SysOperationContract {
  const operation = getSysOperationContractByToolId(toolId)
  if (operation) return operation
  throw new Error('unknown_sys_tool:' + toolId)
}

function resolveOperationById(operationId: string): SysOperationContract {
  const operation = getSysOperationContractById(operationId)
  if (operation) return operation
  throw new Error('unknown_sys_operation:' + operationId)
}

async function runResolvedOperation(operation: SysOperationContract, input: unknown): Promise<unknown> {
  const payload = toRecord(input)
  const services = await getServices()
  const mappedResult = await runMappedOperation(operation, payload, services)
  if (mappedResult !== UNHANDLED_OPERATION) return mappedResult

  const service = getService(services, operation.serviceKey)
  const args = buildMethodArgs(operation, payload)
  return invokeEffectMethod(service, operation.serviceKey, operation.methodName, args)
}

export async function runSysKitOperationByToolId(toolId: string, input: unknown): Promise<unknown> {
  const operation = resolveOperationByToolId(toolId)
  return runResolvedOperation(operation, input)
}

export async function runSysKitOperationById<TId extends SysTypedOperationId>(
  operationId: TId,
  input: SysOperationInput<TId>,
): Promise<SysOperationOutput<TId>> {
  const operation = resolveOperationById(operationId)
  return runResolvedOperation(operation, input) as Promise<SysOperationOutput<TId>>
}

export async function runSysKitOperationByTypedId<TId extends SysTypedOperationId>(
  operationId: TId,
  input: SysOperationInput<TId>,
): Promise<SysOperationOutput<TId>> {
  return runSysKitOperationById(operationId, input)
}

export async function runSysKitOperation(
  input: unknown,
  identifier: { toolId: string } | { operationId: string },
): Promise<unknown> {
  if ('toolId' in identifier) return runSysKitOperationByToolId(identifier.toolId, input)
  const operation = resolveOperationById(identifier.operationId)
  return runResolvedOperation(operation, input)
}

export function clearSysKitOperationCaches(): void {
  cachedServices = null
}
