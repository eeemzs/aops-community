import type { DomainRouteManifestEntry } from '@aopslab/host-core'
import type {
  FederatedCatalogSource,
  Manifest,
  FederatedCatalogTool,
  FederatedCatalogToolSource,
} from '@aopslab/manifest'

import type {
  HostAgentGatewayHeaderBinding,
  HostAgentGatewayRemoteDomainSourceConfig,
} from '$lib/host-config'

import type {
  RouteInvokeInput,
  RouteSummaryEntry,
} from './types'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/g, '')
}

export function normalizeApiBasePath(value: string | undefined): string {
  const raw = (value ?? '/api').trim()
  if (!raw) return '/api'
  return raw.startsWith('/') ? raw.replace(/\/+$/g, '') || '/api' : `/${raw.replace(/\/+$/g, '')}`
}

export function normalizeDomain(value: string): string {
  return String(value ?? '').trim().toLowerCase()
}

export function normalizeToolId(value: string): string {
  return String(value ?? '').trim().toLowerCase()
}

export function normalizeSourceId(value: string | undefined): string | undefined {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase()
  return normalized.length > 0 ? normalized : undefined
}

export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function findTagValue(tags: string[] | undefined, prefix: string): string | undefined {
  if (!Array.isArray(tags)) return undefined
  const found = tags.find((tag) => typeof tag === 'string' && tag.startsWith(prefix))
  if (!found) return undefined
  const value = found.slice(prefix.length).trim().toLowerCase()
  return value.length > 0 ? value : undefined
}

function toFriendlyResourceName(tool: FederatedCatalogTool): string {
  const tagged = findTagValue(tool.tags, 'resource:')
  const raw = tagged ?? tool.operationId.split('.')[0] ?? 'resource'
  return raw.replace(/[-_]+/g, ' ').trim()
}

export function resolveOperationKind(tool: FederatedCatalogTool): string | undefined {
  return findTagValue(tool.tags, 'kind:')
}

function buildToolSummary(tool: FederatedCatalogTool): string {
  const resource = toFriendlyResourceName(tool)
  const kind = resolveOperationKind(tool)
  if (kind === 'list') return `List ${resource} records with optional filter and options.`
  if (kind === 'get') return `Get a ${resource} record by identifier.`
  if (kind === 'create') return `Create a ${resource} record from data payload.`
  if (kind === 'update') return `Update a ${resource} record.`
  if (kind === 'delete') return `Delete a ${resource} record by identifier.`
  return `Run ${tool.operationId} on ${resource}.`
}

function shouldRewriteSummary(summary: string): boolean {
  const normalized = summary.trim()
  if (!normalized) return true
  if (normalized.length > 96) return false
  if (/[():]/.test(normalized)) return false
  if (/\b(alias|wrapper|route|compose|markdown|safe delete)\b/i.test(normalized)) return false
  return /^(list|get|create|update|remove|delete|add|set|link|unlink|record|attach|end|start|search)\b/i.test(
    normalized
  )
}

function toCanonicalInvokeExamplePayload(
  operationKind: string | undefined,
  payload: unknown
): Record<string, unknown> {
  if (isRecord(payload) && hasInputEnvelope(payload)) {
    return payload
  }
  if (operationKind === 'get' && isRecord(payload)) {
    const id = normalizePathParamValue(payload.id)
    if (id) {
      const { id: _ignored, ...rest } = payload
      return {
        pathParams: { id },
        ...(Object.keys(rest).length > 0 ? { query: rest } : {}),
      }
    }
  }
  const envelopeKey = operationKind === 'list' || operationKind === 'get' ? 'query' : 'body'
  return { [envelopeKey]: payload }
}

function normalizeToolExample(example: unknown, operationKind: string | undefined): string | null {
  if (typeof example !== 'string') return null
  const raw = example.trim()
  if (!raw) return null

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    // non-JSON samples are tolerated only if they carry an --input JSON payload.
  }
  if (payload !== undefined) {
    return JSON.stringify(toCanonicalInvokeExamplePayload(operationKind, payload))
  }

  const inputMatch =
    raw.match(/--input\\s+'([^']+)'/) ??
    raw.match(/--input\\s+\"([^\"]+)\"/) ??
    raw.match(/--input\\s+([^\\s]+)/)
  if (!inputMatch || typeof inputMatch[1] !== 'string') return null

  const candidate = inputMatch[1].trim()
  if (!candidate) return null
  try {
    payload = JSON.parse(candidate)
    return JSON.stringify(toCanonicalInvokeExamplePayload(operationKind, payload))
  } catch {
    return null
  }
}

function normalizeToolExamples(examples: unknown, operationKind: string | undefined): string[] | undefined {
  if (!Array.isArray(examples)) return undefined
  const normalized = examples
    .map((entry) => normalizeToolExample(entry, operationKind))
    .filter((entry): entry is string => Boolean(entry))
  return normalized.length > 0 ? normalized : undefined
}

function normalizeToolIdShape(tool: FederatedCatalogTool): string {
  const normalizedToolId = normalizeToolId(tool.toolId)
  const domain = normalizeDomain(tool.domain)
  if (!domain) return normalizedToolId

  const duplicatedDomainPrefix = `${domain}.${domain}.`
  if (normalizedToolId.startsWith(duplicatedDomainPrefix)) {
    return `${domain}.${normalizedToolId.slice(duplicatedDomainPrefix.length)}`
  }

  return normalizedToolId
}

export function normalizeCatalogTool(tool: FederatedCatalogTool): FederatedCatalogTool {
  const operationKind = resolveOperationKind(tool)
  const fallbackExamplesByToolId: Record<string, string[]> = {
    'jsonexcel.json.to-excel': ['{"jsonFile":"data.json","outputFile":"data.xlsx"}'],
    'jsonexcel.excel.to-json': ['{"excelFile":"data.xlsx","outputFile":"data.json"}'],
  }
  const normalizedToolId = normalizeToolIdShape(tool)

  const examples =
    normalizeToolExamples((tool as { examples?: unknown }).examples, operationKind) ??
    normalizeToolExamples(fallbackExamplesByToolId[normalizedToolId], operationKind)

  const summaryCandidate = typeof tool.summary === 'string' ? tool.summary : ''
  const summary = shouldRewriteSummary(summaryCandidate) ? buildToolSummary(tool) : summaryCandidate
  const titleCandidate = typeof tool.title === 'string' ? tool.title : ''
  const title = shouldRewriteSummary(titleCandidate) ? summary : titleCandidate

  return {
    ...tool,
    toolId: normalizedToolId,
    ...(title ? { title } : {}),
    ...(summary ? { summary } : {}),
    ...(examples ? { examples } : {}),
  }
}

function normalizePathParams(input: unknown): Record<string, string> {
  if (!isRecord(input)) return {}
  const out: Record<string, string> = {}
  for (const [keyRaw, value] of Object.entries(input)) {
    const key = keyRaw.trim()
    if (!key) continue
    if (value === undefined || value === null) continue
    out[key] = String(value)
  }
  return out
}

function appendQueryParamValue(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return
  if (Array.isArray(value)) {
    for (const item of value) appendQueryParamValue(params, key, item)
    return
  }
  if (typeof value === 'object') {
    params.append(key, JSON.stringify(value))
    return
  }
  params.append(key, String(value))
}

function normalizeQueryParams(input: unknown): URLSearchParams {
  if (!isRecord(input)) return new URLSearchParams()
  const params = new URLSearchParams()
  for (const [keyRaw, value] of Object.entries(input)) {
    const key = keyRaw.trim()
    if (!key) continue
    appendQueryParamValue(params, key, value)
  }
  return params
}

export function hasInputEnvelope(input: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(input, 'pathParams') ||
    Object.prototype.hasOwnProperty.call(input, 'params') ||
    Object.prototype.hasOwnProperty.call(input, 'query') ||
    Object.prototype.hasOwnProperty.call(input, 'body') ||
    Object.prototype.hasOwnProperty.call(input, 'context')
  )
}

export function parseRouteInvokeInput(input: unknown): RouteInvokeInput {
  if (!isRecord(input) || !hasInputEnvelope(input)) {
    return {
      pathParams: {},
      query: new URLSearchParams(),
      body: input,
      context: {},
    }
  }

  return {
    pathParams: normalizePathParams(input.pathParams ?? input.params),
    query: normalizeQueryParams(input.query),
    body: input.body,
    context: isRecord(input.context) ? (input.context as RouteInvokeInput['context']) : {},
  }
}

function extractPathParamKeys(pattern: string): string[] {
  const normalized = pattern.trim().replace(/^\/+|\/+$/g, '')
  if (!normalized) return []

  return normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.startsWith(':'))
    .map((segment) => segment.slice(1).trim())
    .filter(Boolean)
}

function normalizePathParamValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

function findManifestForDomain(manifests: Manifest[], domain: string): Manifest | null {
  return manifests.find((manifest) => normalizeDomain(manifest.domain.id) === normalizeDomain(domain)) ?? null
}

function normalizeAliasedArgName(value: string): string {
  const normalized = value.trim()
  if (!normalized) return normalized
  const parts = normalized.split('.').map((part) => part.trim()).filter(Boolean)
  return parts[parts.length - 1] ?? normalized
}

export function extractRouteParamAliases(tool: FederatedCatalogTool, manifests: Manifest[]): Map<string, string> {
  const manifest = findManifestForDomain(manifests, tool.domain)
  const notes = manifest?.docs?.operations?.[tool.operationId]?.notes
  if (!Array.isArray(notes) || notes.length === 0) return new Map()

  const aliases = new Map<string, string>()
  for (const rawNote of notes) {
    const note = String(rawNote ?? '').trim()
    if (!note) continue
    const match = note.match(/resolves\s+([a-zA-Z0-9_.]+)\s+from\s+:([a-zA-Z0-9_]+)/i)
    if (!match) continue
    const targetArg = normalizeAliasedArgName(match[1] ?? '')
    const pathKey = String(match[2] ?? '').trim()
    if (!targetArg || !pathKey) continue
    aliases.set(targetArg, pathKey)
  }
  return aliases
}

export function normalizeInvokeInputForRoute(params: {
  parsedInput: RouteInvokeInput
  routePattern: string
  routeMethod?: string
  tool: FederatedCatalogTool
  manifests: Manifest[]
}): RouteInvokeInput {
  const pathParamKeys = extractPathParamKeys(params.routePattern)
  const routeMethod = String(params.routeMethod ?? '').trim().toUpperCase()
  const shouldMoveBodyToQuery = routeMethod === 'GET' || routeMethod === 'HEAD'

  if (pathParamKeys.length === 0) {
    if (!shouldMoveBodyToQuery || !isRecord(params.parsedInput.body)) return params.parsedInput
    const query = new URLSearchParams(params.parsedInput.query)
    for (const [keyRaw, value] of Object.entries(params.parsedInput.body)) {
      const key = keyRaw.trim()
      if (!key) continue
      appendQueryParamValue(query, key, value)
    }
    return {
      ...params.parsedInput,
      query,
      body: undefined,
    }
  }

  const pathParams = { ...params.parsedInput.pathParams }
  const body = isRecord(params.parsedInput.body) ? { ...params.parsedInput.body } : params.parsedInput.body
  const bodyRecord = isRecord(body) ? body : null

  for (const pathKey of pathParamKeys) {
    if (normalizePathParamValue(pathParams[pathKey])) continue
    const fallbackValue = bodyRecord ? normalizePathParamValue(bodyRecord[pathKey]) : undefined
    if (fallbackValue) {
      pathParams[pathKey] = fallbackValue
    }
  }

  const aliases = extractRouteParamAliases(params.tool, params.manifests)
  if (bodyRecord) {
    for (const [targetArg, pathKey] of aliases.entries()) {
      if (!normalizePathParamValue(pathParams[pathKey])) {
        const targetValue = normalizePathParamValue(bodyRecord[targetArg])
        if (targetValue) {
          pathParams[pathKey] = targetValue
        }
      }

      const resolvedPathValue = normalizePathParamValue(pathParams[pathKey])
      if (!resolvedPathValue) continue
      if (!normalizePathParamValue(bodyRecord[targetArg])) {
        bodyRecord[targetArg] = resolvedPathValue
      }
      if (targetArg !== pathKey && Object.prototype.hasOwnProperty.call(bodyRecord, pathKey)) {
        delete bodyRecord[pathKey]
      }
    }
  }

  const normalizedInput: RouteInvokeInput = {
    ...params.parsedInput,
    pathParams,
    body,
  }

  if (!shouldMoveBodyToQuery || !isRecord(body)) {
    return normalizedInput
  }

  const query = new URLSearchParams(normalizedInput.query)
  for (const [keyRaw, value] of Object.entries(body)) {
    const key = keyRaw.trim()
    if (!key || pathParamKeys.includes(key)) continue
    appendQueryParamValue(query, key, value)
  }

  return {
    ...normalizedInput,
    query,
    body: undefined,
  }
}

export function patternToPathSegments(pattern: string, pathParams: Record<string, string>): string[] {
  const normalized = pattern.trim().replace(/^\/+|\/+$/g, '')
  if (!normalized) return []

  const parts: string[] = []
  for (const segment of normalized.split('/').map((raw) => raw.trim()).filter(Boolean)) {
    if (segment === '*') {
      const splat = pathParams.splat?.trim()
      if (!splat) continue
      for (const part of splat.split('/').map((raw) => raw.trim()).filter(Boolean)) {
        parts.push(encodeURIComponent(part))
      }
      continue
    }

    if (segment.startsWith(':')) {
      const key = segment.slice(1).trim()
      const value = pathParams[key]
      if (!key || value === undefined || value.trim().length === 0) {
        throw new Error(`tool_input_missing_path_param:${key || '<empty>'}`)
      }
      parts.push(encodeURIComponent(value.trim()))
      continue
    }

    parts.push(segment)
  }

  return parts
}

export function normalizeRouteSummaryEntry(raw: unknown): RouteSummaryEntry | null {
  if (!isRecord(raw)) return null

  const id = String(raw.id ?? '').trim()
  const method = String(raw.method ?? '').trim().toUpperCase()
  const pattern = String(raw.pattern ?? '').trim()
  const operation = String(raw.operation ?? '').trim()
  if (!id || !method || !pattern || !operation) return null
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : undefined
  return {
    id,
    method,
    pattern,
    operation,
    summary: summary && summary.length > 0 ? summary : undefined,
  }
}

export function resolveHeaderBindingValue(binding: HostAgentGatewayHeaderBinding): string | null {
  let resolved: string | undefined
  if (typeof binding.value === 'string') {
    resolved = binding.value
  } else if (typeof binding.fromEnv === 'string' && binding.fromEnv.length > 0) {
    resolved = process.env[binding.fromEnv]
  }
  if ((!resolved || resolved.length === 0) && typeof binding.default === 'string') {
    resolved = binding.default
  }
  if ((!resolved || resolved.length === 0) && binding.required) {
    throw new Error(`agent_gateway_header_missing:${binding.fromEnv || '<binding>'}`)
  }
  if (!resolved || resolved.length === 0) return null
  return resolved
}

export function resolveSourceHeaders(source: HostAgentGatewayRemoteDomainSourceConfig): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [nameRaw, binding] of Object.entries(source.headers ?? {})) {
    const name = nameRaw.trim()
    if (!name) continue
    const value = resolveHeaderBindingValue(binding)
    if (!value) continue
    out[name] = value
  }
  return out
}

export async function parseFetchBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }

  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function createTimeoutController(timeoutMs: number): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return {
    controller,
    cleanup: () => clearTimeout(timer),
  }
}

export function pickResponseHeaders(response: Response): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of response.headers.entries()) {
    const normalized = key.trim().toLowerCase()
    if (!normalized || normalized === 'set-cookie') continue
    out[normalized] = value
  }
  return out
}

export function toFederatedSourceFromRemote(
  source: HostAgentGatewayRemoteDomainSourceConfig
): FederatedCatalogSource {
  return {
    id: source.id,
    kind: source.kind,
    domain: source.domain,
    enabled: source.enabled,
    priority: source.priority,
    baseUrl: source.baseUrl,
    apiBasePath: source.apiBasePath,
  }
}

export function findDomainRouteByOperation(
  routes: DomainRouteManifestEntry[],
  operationId: string
): DomainRouteManifestEntry | null {
  return routes.find((route) => route.operation === operationId) ?? null
}

export function findRemoteRouteByOperation(routes: RouteSummaryEntry[], operationId: string): RouteSummaryEntry | null {
  return routes.find((route) => route.operation === operationId) ?? null
}

export function chooseSourceForInvocation(
  tool: FederatedCatalogTool,
  sourceId: string | undefined
): FederatedCatalogToolSource {
  if (tool.sources.length === 0) {
    throw new Error(`tool_source_unavailable:${tool.toolId}`)
  }
  if (sourceId) {
    const explicit = tool.sources.find((source) => source.id === sourceId)
    if (!explicit) {
      throw new Error(`tool_source_not_found:${sourceId}`)
    }
    return explicit
  }

  if (tool.defaultSourceId) {
    const preferred = tool.sources.find((source) => source.id === tool.defaultSourceId)
    if (preferred) return preferred
  }
  return tool.sources[0]
}

export function shouldFallbackFromLocalError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown_error')
  return message.startsWith('domain_not_registered:') || message.startsWith('operation_route_not_found:')
}

export function findFirstRemoteSource(tool: FederatedCatalogTool): FederatedCatalogToolSource | null {
  return tool.sources.find((source) => source.kind !== 'local-route') ?? null
}
