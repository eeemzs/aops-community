import fs from 'node:fs'
import path from 'node:path'

import { Effect } from 'effect'
import { config as loadDotEnv } from 'dotenv'

import { createDocmanKitWithEnv } from '../domain-services/unified.js'
import { getDocmanKitEnvConfig } from '../config/config.js'
import type { DocmanOperationArgument } from './types.js'
import type { DocmanOperationContract } from './contract.js'
import { getDocmanOperationContractById, getDocmanOperationContractByToolId } from './contract.js'
import type { DocmanOperationInput, DocmanOperationOutput, DocmanTypedOperationId } from './io-types.js'
import { isDocmanScopeOwnedCreateOperation } from './scope-owned-create.js'

type ToolInput = Record<string, unknown>

const HOST_META_KEYS = new Set([
  'scopeId',
  'scopeResolution',
  'tenantId',
  'locale',
  'fallbackLocale',
  '__hostContext',
])

const DOCMAN_OBJECT_INPUT_CUSTOM_OPERATION_IDS = new Set([
  'document.index.build',
  'document.index.get',
  'document.summary.build',
  'document.summary.get',
  'document.search',
  'document.scope.search',
  'document.answer-pack',
  'document.compose.fetch',
  'document.publish.materialize',
  'document-version.import-headings',
  'document-version.set-current',
])

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

function resolveScopeIdValue(payload: ToolInput): string | undefined {
  return normalizeNonEmpty(payload.scopeId)
}

function normalizeScopeResolution(value: unknown): 'explicit' | 'cascade' | undefined {
  const normalized = normalizeNonEmpty(value)
  if (normalized === 'explicit' || normalized === 'cascade') return normalized
  return undefined
}

function toObjectOrUndefined(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function sanitizePayload(payload: ToolInput, operation?: DocmanOperationContract): ToolInput {
  const allowScopeId = operation?.args.some((arg) => arg.name === 'scopeId') === true
  const allowScopeResolution = operation?.args.some((arg) => arg.name === 'scopeResolution') === true
  const sanitized: ToolInput = {}
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'scopeId' && allowScopeId) {
      sanitized[key] = value
      continue
    }
    if (key === 'scopeResolution' && allowScopeResolution) {
      sanitized[key] = value
      continue
    }
    if (HOST_META_KEYS.has(key)) continue
    sanitized[key] = value
  }
  return sanitized
}

function buildLocaleOptions(payload: ToolInput): Record<string, unknown> | undefined {
  const locale = normalizeNonEmpty(payload.locale)
  const fallbackLocale = normalizeNonEmpty(payload.fallbackLocale)
  if (!locale && !fallbackLocale) return undefined
  return {
    ...(locale ? { locale } : {}),
    ...(fallbackLocale ? { fallbackLocale } : {}),
  }
}

function loadEnvOnce(): void {
  if (envLoaded) return
  envLoaded = true

  const candidates = [
    process.env.DOTENV_CONFIG_PATH,
    process.env.DOCMAN_ENV_PATH,
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
    const envConfig = getDocmanKitEnvConfig()
    const { kit } = createDocmanKitWithEnv({
      envConfig,
      baseContext: { tenantId: envConfig.tenantId },
    })
    const services = await kit.createAll()
    return Object.fromEntries(Object.entries(services))
  })()
  return cachedServices
}

function resolveCustomArgValue(payload: ToolInput, arg: DocmanOperationArgument): unknown {
  if (arg.name === 'options') {
    const explicitOptions = toObjectOrUndefined(payload.options)
    if (explicitOptions) return explicitOptions
    return buildLocaleOptions(payload)
  }
  if (arg.name === 'scopeId') {
    return resolveScopeIdValue(payload)
  }
  if (arg.name === 'scopeResolution') {
    return normalizeScopeResolution(payload.scopeResolution)
  }
  return payload[arg.name]
}

function buildCrudArgs(operation: DocmanOperationContract, payload: ToolInput): unknown[] {
  const id = normalizeNonEmpty(payload.id)

  if (operation.kind === 'list') {
    const optionSeed = { ...(toObjectOrUndefined(payload.options) ?? {}) }
    if (typeof payload.includeVersionInfo === 'boolean') {
      optionSeed.includeVersionInfo = payload.includeVersionInfo
    }
    const options = Object.keys(optionSeed).length > 0 ? optionSeed : undefined
    const filter = { ...(toObjectOrUndefined(payload.filter) ?? {}) }
    const scopeId = resolveScopeIdValue(payload)
    if (scopeId && filter.scopeId === undefined) {
      filter.scopeId = scopeId
    }
    const scopeResolution = normalizeScopeResolution(payload.scopeResolution)
    if (scopeResolution && filter.scopeResolution === undefined) {
      filter.scopeResolution = scopeResolution
    }
    return [filter, options]
  }

  if (operation.kind === 'get') {
    const options = toObjectOrUndefined(payload.options)
    if (!id) throw new Error('missing_required_id')
    return [id, options]
  }

  if (operation.kind === 'create') {
    const data = { ...(toObjectOrUndefined(payload.data) ?? {}) }
    if (!data || Object.keys(data).length === 0) throw new Error('missing_required_data')
    const scopeId = resolveScopeIdValue(payload)
    if (scopeId && data.scopeId === undefined && isDocmanScopeOwnedCreateOperation(operation.operationId)) {
      data.scopeId = scopeId
    }
    return [data]
  }

  if (operation.kind === 'update') {
    if (!id) throw new Error('missing_required_id')
    const patch = toObjectOrUndefined(payload.patch)
    if (!patch || Object.keys(patch).length === 0) throw new Error('missing_required_patch')
    return [id, patch]
  }

  if (operation.kind === 'delete') {
    if (!id) throw new Error('missing_required_id')
    return [id]
  }

  return []
}

function buildCustomArgs(operation: DocmanOperationContract, payload: ToolInput): unknown[] {
  if (operation.args.length === 0) return []

  if (DOCMAN_OBJECT_INPUT_CUSTOM_OPERATION_IDS.has(operation.operationId)) {
    return [sanitizePayload(payload, operation)]
  }

  if (operation.args.length === 1) {
    const [onlyArg] = operation.args
    if ((onlyArg.name === 'input' || onlyArg.name === 'payload') && payload[onlyArg.name] === undefined) {
      return [sanitizePayload(payload, operation)]
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

function buildMethodArgs(operation: DocmanOperationContract, payload: ToolInput): unknown[] {
  if (operation.kind === 'custom') return buildCustomArgs(operation, payload)
  return buildCrudArgs(operation, payload)
}

function resolveOperationByToolId(toolId: string): DocmanOperationContract {
  const operation = getDocmanOperationContractByToolId(toolId)
  if (operation) return operation
  throw new Error(`unknown_docman_tool:${toolId}`)
}

function resolveOperationById(operationId: string): DocmanOperationContract {
  const operation = getDocmanOperationContractById(operationId)
  if (operation) return operation
  throw new Error(`unknown_docman_operation:${operationId}`)
}

async function runResolvedOperation(operation: DocmanOperationContract, input: unknown): Promise<unknown> {
  const payload = toRecord(input)
  if (operation.serviceKey === '__calls__') {
    throw new Error(`docman_special_operation_missing:${operation.operationId}`)
  }
  const services = await getServices()
  const service = services[operation.serviceKey] as Record<string, unknown> | undefined
  if (!service) throw new Error(`docman_service_not_found:${operation.serviceKey}`)

  const method = service[operation.methodName]
  if (typeof method !== 'function') {
    throw new Error(`docman_method_missing:${operation.serviceKey}.${operation.methodName}`)
  }

  const args = buildMethodArgs(operation, payload)
  const effectResult = method.apply(service, args)
  return Effect.runPromise(effectResult)
}

export async function runDocmanKitOperationByToolId(toolId: string, input: unknown): Promise<unknown> {
  const operation = resolveOperationByToolId(toolId)
  return runResolvedOperation(operation, input)
}

export async function runDocmanKitOperationById<TId extends DocmanTypedOperationId>(
  operationId: TId,
  input: DocmanOperationInput<TId>,
): Promise<DocmanOperationOutput<TId>> {
  const operation = resolveOperationById(operationId)
  return runResolvedOperation(operation, input) as Promise<DocmanOperationOutput<TId>>
}

export async function runDocmanKitOperationByTypedId<TId extends DocmanTypedOperationId>(
  operationId: TId,
  input: DocmanOperationInput<TId>,
): Promise<DocmanOperationOutput<TId>> {
  return runDocmanKitOperationById(operationId, input)
}

export async function runDocmanKitOperation(
  input: unknown,
  identifier: { toolId: string } | { operationId: string },
): Promise<unknown> {
  if ('toolId' in identifier) {
    return runDocmanKitOperationByToolId(identifier.toolId, input)
  }
  const operation = resolveOperationById(identifier.operationId)
  return runResolvedOperation(operation, input)
}

export function clearDocmanKitOperationCaches(): void {
  cachedServices = null
}
