import { buildDocmanDomainCapabilityManifest } from './dcm.js'

export type DocmanHostProjectionMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type DocmanHostRouteProjectionEntry = {
  id: string
  method: DocmanHostProjectionMethod
  pattern: string
  operation: string
  summary?: string
}

type RouteOverride = {
  method: DocmanHostProjectionMethod
  pattern: string
  summary?: string
}

const CRUD_KINDS = new Set(['list', 'get', 'create', 'update', 'delete'])

const CUSTOM_ROUTE_OVERRIDES: Record<string, RouteOverride> = {
  'document.delete.safe': {
    method: 'DELETE',
    pattern: '/documents/:id/safe',
    summary: 'Safely delete document'
  },
  'document-version.delete.safe': {
    method: 'DELETE',
    pattern: '/document-versions/:id/safe',
    summary: 'Safely delete document version'
  },
  'document-version.import-headings': {
    method: 'POST',
    pattern: '/document-versions/:id/import-headings',
    summary: 'Import parsed heading graph into document version'
  },
  'document.compose.index': {
    method: 'POST',
    pattern: '/document-versions/:id/compose-index',
    summary: 'Build composed index for document version'
  },
  'document.index.build': {
    method: 'POST',
    pattern: '/document-versions/:id/index',
    summary: 'Build persisted retrieval index for document version'
  },
  'document.index.get': {
    method: 'GET',
    pattern: '/document-versions/:id/index',
    summary: 'Get persisted retrieval index for document version'
  },
  'document.summary.build': {
    method: 'POST',
    pattern: '/document-versions/:id/summaries',
    summary: 'Build persisted summaries for document version'
  },
  'document.summary.get': {
    method: 'GET',
    pattern: '/document-versions/:id/summaries',
    summary: 'Get persisted summaries for document version'
  },
  'document.search': {
    method: 'GET',
    pattern: '/document-versions/:id/search',
    summary: 'Search persisted retrieval index for document version'
  },
  'document.scope.search': {
    method: 'GET',
    pattern: '/scopes/:id/documents/search',
    summary: 'Search persisted retrieval index across latest document versions in one scope'
  },
  'document.answer-pack': {
    method: 'GET',
    pattern: '/document-versions/:id/answer-pack',
    summary: 'Get deterministic answer pack for document version'
  },
  'document.compose.fetch': {
    method: 'POST',
    pattern: '/document-versions/:id/compose-fetch',
    summary: 'Fetch composed fragment'
  },
  'document.publish.materialize': {
    method: 'POST',
    pattern: '/document-versions/:id/materialize',
    summary: 'Materialize publish fragment'
  },
  'document-section-link.usage.list': {
    method: 'GET',
    pattern: '/sections/:id/document-link-usage',
    summary: 'List document section-link usage by section'
  }
}

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
    kind: kindRaw as 'list' | 'get' | 'create' | 'update' | 'delete'
  }
}

function pluralizePathSegment(segment: string): string {
  const normalized = segment.trim()
  if (!normalized) return normalized
  if (normalized.endsWith('s')) return `${normalized}es`
  return `${normalized}s`
}

function toCrudRoute(operationId: string, summary?: string): DocmanHostRouteProjectionEntry | null {
  const parsed = parseCrudOperation(operationId)
  if (!parsed) return null

  const resourcePath = `/${pluralizePathSegment(parsed.entity)}`
  const id = `docman.${operationId.replace(/\./g, '.')}`

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

function toCustomFallbackRoute(operationId: string, summary?: string): DocmanHostRouteProjectionEntry {
  const normalizedPath = operationId.replace(/\./g, '/')
  const id = `docman.${operationId.replace(/\./g, '-')}`
  return {
    id,
    method: 'POST',
    pattern: `/operations/${normalizedPath}`,
    operation: operationId,
    ...(summary ? { summary } : {})
  }
}

function toRouteFromOperation(operationId: string, summary?: string): DocmanHostRouteProjectionEntry {
  const override = CUSTOM_ROUTE_OVERRIDES[operationId]
  if (override) {
    return {
      id: `docman.${operationId.replace(/\./g, '-')}`,
      method: override.method,
      pattern: override.pattern,
      operation: operationId,
      summary: override.summary ?? summary
    }
  }

  const crudRoute = toCrudRoute(operationId, summary)
  if (crudRoute) return crudRoute

  return toCustomFallbackRoute(operationId, summary)
}

export function buildDocmanHostRouteProjection(options?: { refresh?: boolean }): DocmanHostRouteProjectionEntry[] {
  const manifest = buildDocmanDomainCapabilityManifest({
    refresh: options?.refresh,
    includeDocs: true
  })

  const unique = new Map<string, DocmanHostRouteProjectionEntry>()

  for (const operation of manifest.capabilities.operations) {
    const summary = manifest.docs?.operations?.[operation.operationId]?.summary ?? operation.title
    const route = toRouteFromOperation(operation.operationId, summary)
    const key = `${route.method} ${route.pattern}`
    if (!unique.has(key)) unique.set(key, route)
  }

  return [...unique.values()].sort((left, right) => left.operation.localeCompare(right.operation))
}
