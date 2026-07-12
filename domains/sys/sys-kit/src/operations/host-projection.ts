import { buildSysDomainCapabilityManifest } from './dcm.js'

export type SysHostProjectionMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type SysHostRouteProjectionEntry = {
  id: string
  method: SysHostProjectionMethod
  pattern: string
  operation: string
  summary?: string
}

const CRUD_KINDS = new Set(['list', 'get', 'create', 'update', 'delete'])

type ParsedCrudOperation = {
  entity: string
  kind: 'list' | 'get' | 'create' | 'update' | 'delete'
} | null

function parseCrudOperation(operationId: string): ParsedCrudOperation {
  const segments = operationId.split('.').map((segment) => segment.trim()).filter(Boolean)
  if (segments.length !== 2) return null

  const [entity, kindRaw] = segments
  if (!CRUD_KINDS.has(kindRaw)) return null
  return {
    entity,
    kind: kindRaw as 'list' | 'get' | 'create' | 'update' | 'delete',
  }
}

function pluralizePathSegment(segment: string): string {
  const normalized = segment.trim()
  if (!normalized) return normalized
  if (normalized.endsWith('s')) return `${normalized}es`
  return `${normalized}s`
}

function toCrudRoute(operationId: string, summary?: string): SysHostRouteProjectionEntry | null {
  const parsed = parseCrudOperation(operationId)
  if (!parsed) return null

  const resourcePath = `/${pluralizePathSegment(parsed.entity)}`
  const id = 'sys.' + operationId.replace(/\./g, '-')

  if (parsed.kind === 'list') {
    return { id, method: 'GET', pattern: resourcePath, operation: operationId, ...(summary ? { summary } : {}) }
  }
  if (parsed.kind === 'get') {
    return { id, method: 'GET', pattern: `${resourcePath}/:id`, operation: operationId, ...(summary ? { summary } : {}) }
  }
  if (parsed.kind === 'create') {
    return { id, method: 'POST', pattern: resourcePath, operation: operationId, ...(summary ? { summary } : {}) }
  }
  if (parsed.kind === 'update') {
    return { id, method: 'PATCH', pattern: `${resourcePath}/:id`, operation: operationId, ...(summary ? { summary } : {}) }
  }
  return { id, method: 'DELETE', pattern: `${resourcePath}/:id`, operation: operationId, ...(summary ? { summary } : {}) }
}

function toCustomFallbackRoute(operationId: string, summary?: string): SysHostRouteProjectionEntry {
  const normalizedPath = operationId.replace(/\./g, '/')
  const id = 'sys.' + operationId.replace(/\./g, '-')
  return {
    id,
    method: 'POST',
    pattern: `/operations/${normalizedPath}`,
    operation: operationId,
    ...(summary ? { summary } : {}),
  }
}

function toRouteFromOperation(operationId: string, summary?: string): SysHostRouteProjectionEntry {
  const crudRoute = toCrudRoute(operationId, summary)
  if (crudRoute) return crudRoute
  return toCustomFallbackRoute(operationId, summary)
}

export function buildSysHostRouteProjection(options?: { refresh?: boolean }): SysHostRouteProjectionEntry[] {
  const manifest = buildSysDomainCapabilityManifest({
    refresh: options?.refresh,
    includeDocs: true,
  })

  const unique = new Map<string, SysHostRouteProjectionEntry>()

  for (const operation of manifest.capabilities.operations) {
    const summary = manifest.docs?.operations?.[operation.operationId]?.summary ?? operation.title
    const route = toRouteFromOperation(operation.operationId, summary)
    const key = `${route.method} ${route.pattern}`
    if (!unique.has(key)) unique.set(key, route)
  }

  return [...unique.values()].sort((left, right) => left.operation.localeCompare(right.operation))
}
