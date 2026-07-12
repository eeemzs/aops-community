import { buildAgentspaceDomainCapabilityManifest } from './dcm.js'

export type AgentspaceHostProjectionMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type AgentspaceHostRouteProjectionEntry = {
  id: string
  method: AgentspaceHostProjectionMethod
  pattern: string
  operation: string
  summary?: string
}

type AgentspaceHostProjectionOperation = {
  operationId: string
  title?: string
  tags?: string[]
  requiredArgs: string[]
}

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function getTagValue(tags: string[] | undefined, prefix: string): string | undefined {
  if (!Array.isArray(tags)) return undefined
  for (const tag of tags) {
    const normalized = normalizeNonEmpty(tag)
    if (!normalized || !normalized.startsWith(prefix)) continue
    const value = normalized.slice(prefix.length).trim().toLowerCase()
    if (value) return value
  }
  return undefined
}

function toRouteMethodByKind(kind: string | undefined): AgentspaceHostProjectionMethod {
  if (kind === 'list' || kind === 'get') return 'GET'
  if (kind === 'update') return 'PATCH'
  if (kind === 'delete') return 'DELETE'
  return 'POST'
}

function toFallbackOperationsPath(operationId: string): string {
  return `/operations/${operationId.replace(/\./g, '/')}`
}

function toResourceCollectionPath(resourceTag: string | undefined, operationId: string): string | null {
  const resource = normalizeNonEmpty(resourceTag ?? '')
  const base = resource ?? normalizeNonEmpty(operationId.split('.')[0] ?? '')
  if (!base) return null
  const normalized = base.toLowerCase()
  const plural = normalized.endsWith('s') ? normalized : `${normalized}s`
  return `/${plural}`
}

function toCamelIdentifier(value: string): string | null {
  const normalized = value
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
  if (!normalized) return null
  const parts = normalized.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  return parts
    .map((part, index) => {
      const lower = part.toLowerCase()
      if (index === 0) return lower
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
    })
    .join('')
}

function toPreferredResourceIdArg(resourceTag: string | undefined): string | null {
  const resource = normalizeNonEmpty(resourceTag ?? '')
  if (!resource) return null
  const camel = toCamelIdentifier(resource)
  if (!camel) return null
  return `${camel}Id`
}

const CONTEXT_ID_ARG_NAMES = new Set([
  'tenantid',
  'userid',
  'ownerid',
  'orgid',
  'organizationid',
])

function choosePathParamName(requiredArgs: string[], resourceTag: string | undefined): string | null {
  const normalized = requiredArgs.map((arg) => normalizeNonEmpty(arg)).filter((arg): arg is string => Boolean(arg))
  if (normalized.length === 0) return null
  const strict = normalized.find((arg) => arg.toLowerCase() === 'id')
  if (strict) return strict
  const preferredResourceIdArg = toPreferredResourceIdArg(resourceTag)
  if (preferredResourceIdArg) {
    const preferred = normalized.find((arg) => arg.toLowerCase() === preferredResourceIdArg.toLowerCase())
    if (preferred) return preferred
  }

  const idArgs = normalized.filter((arg) => arg.toLowerCase().endsWith('id'))
  if (idArgs.length === 0) return null
  const nonContextIdArgs = idArgs.filter((arg) => !CONTEXT_ID_ARG_NAMES.has(arg.toLowerCase()))
  if (nonContextIdArgs.length > 0) return nonContextIdArgs[0]
  return idArgs[0]
}

function toPathCollisionKey(method: string, pattern: string): string {
  const normalizedPattern = pattern.replace(/:[^/]+/g, ':param')
  return `${method.toUpperCase()} ${normalizedPattern}`
}

function parseRequiredArgsFromNotes(notes: unknown): string[] {
  if (!Array.isArray(notes)) return []
  for (const note of notes) {
    const text = normalizeNonEmpty(note)
    if (!text) continue
    if (!text.toLowerCase().startsWith('required args:')) continue
    const raw = text.slice('required args:'.length)
    return raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  }
  return []
}

function toRouteFromOperation(operation: AgentspaceHostProjectionOperation): AgentspaceHostRouteProjectionEntry {
  const kind = getTagValue(operation.tags, 'kind:')
  const resource = getTagValue(operation.tags, 'resource:')
  const method = toRouteMethodByKind(kind)
  const fallbackPattern = toFallbackOperationsPath(operation.operationId)

  const collectionPath = toResourceCollectionPath(resource, operation.operationId)
  if (!collectionPath || kind === undefined || kind === 'custom') {
    return {
      id: `agentspace.${operation.operationId}`,
      method,
      pattern: fallbackPattern,
      operation: operation.operationId,
      ...(operation.title ? { summary: operation.title } : {}),
    }
  }

  if (kind === 'list' || kind === 'create') {
    return {
      id: `agentspace.${operation.operationId}`,
      method,
      pattern: collectionPath,
      operation: operation.operationId,
      ...(operation.title ? { summary: operation.title } : {}),
    }
  }

  if (kind === 'get' || kind === 'update' || kind === 'delete') {
    const idParam = choosePathParamName(operation.requiredArgs, resource)
    if (!idParam) {
      return {
        id: `agentspace.${operation.operationId}`,
        method,
        pattern: fallbackPattern,
        operation: operation.operationId,
        ...(operation.title ? { summary: operation.title } : {}),
      }
    }
    return {
      id: `agentspace.${operation.operationId}`,
      method,
      pattern: `${collectionPath}/:${idParam}`,
      operation: operation.operationId,
      ...(operation.title ? { summary: operation.title } : {}),
    }
  }

  return {
    id: `agentspace.${operation.operationId}`,
    method,
    pattern: fallbackPattern,
    operation: operation.operationId,
    ...(operation.title ? { summary: operation.title } : {}),
  }
}

export function buildAgentspaceHostRouteProjection(options?: { refresh?: boolean }): AgentspaceHostRouteProjectionEntry[] {
  const manifest = buildAgentspaceDomainCapabilityManifest({
    refresh: options?.refresh,
    includeDocs: true,
  })

  const unique = new Map<string, AgentspaceHostRouteProjectionEntry>()
  const usedRouteKeys = new Set<string>()

  for (const operation of manifest.capabilities.operations) {
    const summary = manifest.docs?.operations?.[operation.operationId]?.summary ?? operation.title
    const requiredArgs = parseRequiredArgsFromNotes(manifest.docs?.operations?.[operation.operationId]?.notes)
    let route = toRouteFromOperation({ ...operation, title: summary, requiredArgs })
    const routeCollisionKey = toPathCollisionKey(route.method, route.pattern)
    if (usedRouteKeys.has(routeCollisionKey)) {
      // Keep operation addressable with deterministic fallback when REST projection collides.
      route = {
        ...route,
        pattern: toFallbackOperationsPath(operation.operationId),
      }
    }

    const key = `${route.method} ${route.pattern}`
    if (!unique.has(key)) unique.set(key, route)
    usedRouteKeys.add(toPathCollisionKey(route.method, route.pattern))
  }

  return [...unique.values()].sort((left, right) => left.operation.localeCompare(right.operation))
}
