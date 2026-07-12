import fs from 'node:fs'
import path from 'node:path'

import { Effect } from 'effect'
import { config as loadDotEnv } from 'dotenv'

import { createAgentspaceKitWithEnv } from '../domain-services/unified.js'
import type { AgentspaceKitServices } from '../domain-services/types.js'
import { clearAgentspaceKitEnvConfigCache, getAgentspaceKitEnvConfig } from '../config/config.js'
import { hardDeleteAgentspaceProjectCascade } from '../calls/project-delete.js'
import {
  resolveProjectContextValue,
  toMissingRequiredArgToken,
  toRecord,
} from '../shared/tool-input.js'
import type { AgentspaceOperationContract } from './contract.js'
import { getAgentspaceOperationContractById, getAgentspaceOperationContractByToolId } from './contract.js'
import type { AgentspaceOperationInput, AgentspaceOperationOutput, AgentspaceTypedOperationId } from './io-types.js'
import { parseAgentspaceToolInput } from './tool-input.js'
import { toPlaybookProjections } from './playbook-projection.js'

type ToolInput = Record<string, unknown>
type AgentspaceKitInstance = ReturnType<typeof createAgentspaceKitWithEnv>['kit']

let envLoaded = false
let cachedServices: Promise<AgentspaceKitServices> | null = null
let cachedKit: Promise<AgentspaceKitInstance> | null = null
let cachedKitSignature: string | null = null
let cachedServicesSignature: string | null = null

function resolveProjectIdFromHostContext(payload: ToolInput): string | undefined {
  const hostContext = toRecord(payload.__hostContext)
  return resolveProjectContextValue(hostContext)
}

function resolveProjectIdValue(payload: ToolInput): string | undefined {
  return resolveProjectContextValue(payload) ?? resolveProjectIdFromHostContext(payload)
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

function parseDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return undefined
  return parsed
}

function parseStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item).trim()).filter(Boolean)
    return items.length > 0 ? items : undefined
  }
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        const items = parsed.map((item) => String(item).trim()).filter(Boolean)
        return items.length > 0 ? items : undefined
      }
    } catch {
      // ignore and fallback to csv
    }
  }
  const items = trimmed.split(',').map((item) => item.trim()).filter(Boolean)
  return items.length > 0 ? items : undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isPlainObject) : []
}

function normalizeNestedValue(value: unknown, keyName?: string): unknown {
  if (value === undefined || value === null) return value

  if (Array.isArray(value)) {
    return value.map((item) => normalizeNestedValue(item))
  }

  if (!isPlainObject(value)) {
    if (typeof value === 'string' && keyName?.toLowerCase().endsWith('at')) {
      return parseDate(value) ?? value
    }
    return value
  }

  const normalized: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    normalized[key] = normalizeNestedValue(entry, key)
  }
  return normalized
}

function normalizeArgValue(argName: string, value: unknown): unknown {
  if (value === undefined) return undefined
  if (value === null) return null

  const parsed = parseJsonValue(value)
  const name = argName.toLowerCase()

  if (name.endsWith('ids') && typeof parsed === 'string') {
    return parseStringArray(parsed) ?? parsed
  }

  if (name.endsWith('at') && typeof parsed === 'string') {
    return parseDate(parsed) ?? parsed
  }

  if (
    (name === 'data' ||
      name === 'patch' ||
      name === 'filter' ||
      name === 'criteria' ||
      name === 'options' ||
      name === 'opts') &&
    typeof parsed === 'string'
  ) {
    return normalizeNestedValue(parseJsonValue(parsed))
  }

  if (
    typeof parsed === 'string' &&
    (name.includes('position') ||
      name.includes('priority') ||
      name.includes('limit') ||
      name.includes('offset') ||
      name.includes('count'))
  ) {
    return parseNumber(parsed) ?? parsed
  }

  if (isPlainObject(parsed) || Array.isArray(parsed)) {
    return normalizeNestedValue(parsed)
  }

  return parsed
}

function loadEnvOnce(): void {
  if (envLoaded) return
  envLoaded = true

  const candidates = [
    process.env.DOTENV_CONFIG_PATH,
    process.env.AOPS_ENV_PATH,
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '../..', '.env'),
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (!candidate) continue
    if (!fs.existsSync(candidate)) continue
    loadDotEnv({ path: candidate })
    break
  }
}

function buildAgentspaceKitRuntimeSignature(envConfig = getAgentspaceKitEnvConfig()): string {
  return [envConfig.tenantId, envConfig.logLevel, envConfig.repoUrl].join('\n')
}

async function getKit(): Promise<AgentspaceKitInstance> {
  loadEnvOnce()
  const envConfig = getAgentspaceKitEnvConfig()
  const signature = buildAgentspaceKitRuntimeSignature(envConfig)
  if (cachedKit && cachedKitSignature === signature) return cachedKit
  cachedKitSignature = signature
  cachedServices = null
  cachedServicesSignature = null
  cachedKit = (async () => {
    const envConfig = getAgentspaceKitEnvConfig()
    const { kit } = createAgentspaceKitWithEnv({
      envConfig,
      baseContext: { tenantId: envConfig.tenantId },
    })
    return kit
  })()
  return cachedKit
}

async function getServices(): Promise<AgentspaceKitServices> {
  const signature = buildAgentspaceKitRuntimeSignature()
  if (cachedServices && cachedServicesSignature === signature) return cachedServices
  cachedServicesSignature = signature
  cachedServices = (async () => {
    const kit = await getKit()
    return kit.createAll()
  })()
  return cachedServices
}

function resolveOperationByToolId(toolId: string): AgentspaceOperationContract {
  const operation = getAgentspaceOperationContractByToolId(toolId)
  if (operation) return operation
  throw new Error(`unknown_agentspace_tool:${toolId}`)
}

function resolveOperationById(operationId: string): AgentspaceOperationContract {
  const operation = getAgentspaceOperationContractById(operationId)
  if (operation) return operation
  throw new Error(`unknown_agentspace_operation:${operationId}`)
}

async function runSpecialOperation(operation: AgentspaceOperationContract, payload: ToolInput): Promise<unknown> {
  if (operation.methodName !== 'hardDeleteAgentspaceProjectCascade') {
    throw new Error(`unknown_agentspace_special_operation:${operation.operationId}`)
  }

  const projectId = resolveProjectIdValue(payload)
  if (!projectId) throw new Error(toMissingRequiredArgToken('projectId'))

  const kit = await getKit()
  return hardDeleteAgentspaceProjectCascade({ kit, projectId })
}

async function runPlaybookListProjection(payload: ToolInput): Promise<unknown> {
  const services = await getServices()
  const requestedFilter = toRecord(payload.filter)
  const serviceFilter = { ...requestedFilter }
  delete serviceFilter.id
  delete serviceFilter.scope
  delete serviceFilter.area
  delete serviceFilter.reviewState
  delete serviceFilter.tag
  delete serviceFilter.kind
  const options = normalizeArgValue('options', payload.options)
  const effect = services.memoryItemService.listMemoryItems(serviceFilter as never, options as never)
  const rows = await Effect.runPromise(effect as Effect.Effect<unknown, unknown>)
  return toPlaybookProjections(toRecordArray(rows), requestedFilter)
}

async function runResolvedOperation(operation: AgentspaceOperationContract, input: unknown): Promise<unknown> {
  const payload = parseAgentspaceToolInput(
    operation.operationId as AgentspaceTypedOperationId,
    toRecord(input),
  ) as ToolInput

  if (operation.operationId === 'playbook.list') {
    return runPlaybookListProjection(payload)
  }

  if (operation.serviceKey === '__calls__') {
    return runSpecialOperation(operation, payload)
  }

  const services = await getServices()
  const service = services[operation.serviceKey as keyof AgentspaceKitServices]
  if (!service || typeof service !== 'object') {
    throw new Error(`missing_agentspace_service:${operation.serviceKey}`)
  }

  const method = Reflect.get(service, operation.methodName)
  if (typeof method !== 'function') {
    throw new Error(`missing_agentspace_service_method:${operation.serviceKey}.${operation.methodName}`)
  }

  const args: unknown[] = []
  for (const arg of operation.args) {
    const rawValue =
      arg.name === 'projectId' || arg.name === 'scopeId'
        ? resolveProjectIdValue(payload)
        : payload[arg.name]
    const normalized = normalizeArgValue(arg.name, rawValue)
    if (normalized === undefined && arg.optional !== true) {
      throw new Error(toMissingRequiredArgToken(arg.name))
    }
    args.push(normalized)
  }

  const effect = (method as (...methodArgs: unknown[]) => unknown).apply(service, args)
  return Effect.runPromise(effect as Effect.Effect<unknown, unknown>)
}

export async function runAgentspaceKitOperationByToolId(toolId: string, input: unknown): Promise<unknown> {
  const operation = resolveOperationByToolId(toolId)
  return runResolvedOperation(operation, input)
}

export async function runAgentspaceKitOperationById<TId extends AgentspaceTypedOperationId>(
  operationId: TId,
  input: AgentspaceOperationInput<TId>,
): Promise<AgentspaceOperationOutput<TId>>
export async function runAgentspaceKitOperationById(operationId: string, input: unknown): Promise<unknown>
export async function runAgentspaceKitOperationById(operationId: string, input: unknown): Promise<unknown> {
  const operation = resolveOperationById(operationId)
  return runResolvedOperation(operation, input)
}

export async function runAgentspaceKitOperationByTypedId<TId extends AgentspaceTypedOperationId>(
  operationId: TId,
  input: AgentspaceOperationInput<TId>,
): Promise<AgentspaceOperationOutput<TId>> {
  return runAgentspaceKitOperationById(operationId, input)
}

export async function runAgentspaceKitOperation(
  input: unknown,
  identifier: { toolId: string } | { operationId: string },
): Promise<unknown> {
  if ('toolId' in identifier) {
    return runAgentspaceKitOperationByToolId(identifier.toolId, input)
  }
  return runAgentspaceKitOperationById(identifier.operationId, input)
}

export function clearAgentspaceKitOperationCaches(): void {
  envLoaded = false
  cachedServices = null
  cachedServicesSignature = null
  cachedKit = null
  cachedKitSignature = null
  clearAgentspaceKitEnvConfigCache()
}
