import { buildProjectmanDomainCapabilityManifest } from './dcm.js'

export type ProjectmanHostProjectionMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export type ProjectmanHostRouteProjectionEntry = {
  id: string
  method: ProjectmanHostProjectionMethod
  pattern: string
  operation: string
  summary?: string
}

type RouteOverride = {
  method: ProjectmanHostProjectionMethod
  pattern: string
  summary?: string
}

const CRUD_KINDS = new Set(['list', 'get', 'create', 'update', 'delete'])

const CUSTOM_ROUTE_OVERRIDES: Record<string, RouteOverride> = {
  'kanban-column.set-wip-limit': {
    method: 'POST',
    pattern: '/kanban-columns/:id/set-wip-limit',
    summary: 'Set WIP limit for kanban column',
  },
  'kanban-board.reorder': {
    method: 'POST',
    pattern: '/kanban-boards/reorder',
    summary: 'Reorder kanban boards',
  },
  'kanban-board.bootstrap': {
    method: 'POST',
    pattern: '/kanban-boards/bootstrap',
    summary: 'Bootstrap a kanban board with default columns',
  },
  'kanban-board-column.reorder': {
    method: 'POST',
    pattern: '/kanban-board-columns/reorder',
    summary: 'Reorder board columns',
  },
  'kanban-task.move': {
    method: 'POST',
    pattern: '/kanban-tasks/:id/move',
    summary: 'Move task to a different column',
  },
  'kanban-task.copy': {
    method: 'POST',
    pattern: '/kanban-tasks/:id/copy',
    summary: 'Copy task into another planning container',
  },
  'kanban-task.reorder': {
    method: 'POST',
    pattern: '/kanban-tasks/reorder',
    summary: 'Reorder tasks in a column',
  },
  'sprint.update-plan': {
    method: 'POST',
    pattern: '/sprints/:id/plan',
    summary: 'Save nested sprint plan snapshot',
  },
  'sprint.update-microtask-status': {
    method: 'POST',
    pattern: '/sprints/:id/microtasks/status',
    summary: 'Update sprint microtask status',
  },
  'implementation-plan.update': {
    method: 'POST',
    pattern: '/implementation-plans/:id/plan',
    summary: 'Save sprint-backed implementation plan snapshot',
  },
  'implementation-plan.add-microtask': {
    method: 'POST',
    pattern: '/implementation-plans/:id/microtasks',
    summary: 'Add implementation plan microtask',
  },
  'implementation-plan.update-microtask': {
    method: 'POST',
    pattern: '/implementation-plans/:id/microtasks/update',
    summary: 'Update implementation plan microtask',
  },
  'implementation-plan.delete-microtask': {
    method: 'POST',
    pattern: '/implementation-plans/:id/microtasks/delete',
    summary: 'Delete implementation plan microtask',
  },
  'kanban-template.apply': {
    method: 'POST',
    pattern: '/kanban-templates/:id/apply',
    summary: 'Apply template to project',
  },
  'review-request.add-result': {
    method: 'POST',
    pattern: '/review-requests/:id/results',
    summary: 'Append a review result to a PM-backed review request',
  },
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
    kind: kindRaw as 'list' | 'get' | 'create' | 'update' | 'delete',
  }
}

function pluralizePathSegment(segment: string): string {
  const normalized = segment.trim()
  if (!normalized) return normalized
  if (/[b-df-hj-np-tv-z]y$/i.test(normalized)) return `${normalized.slice(0, -1)}ies`
  if (normalized.endsWith('s')) return `${normalized}es`
  return `${normalized}s`
}

function toCrudRoute(operationId: string, summary?: string): ProjectmanHostRouteProjectionEntry | null {
  const parsed = parseCrudOperation(operationId)
  if (!parsed) return null

  const resourcePath = `/${pluralizePathSegment(parsed.entity)}`
  const id = `projectman.${operationId.replace(/\./g, '.')}`

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

function toCustomFallbackRoute(operationId: string, summary?: string): ProjectmanHostRouteProjectionEntry {
  const normalizedPath = operationId.replace(/\./g, '/')
  const id = `projectman.${operationId.replace(/\./g, '-')}`
  return {
    id,
    method: 'POST',
    pattern: `/operations/${normalizedPath}`,
    operation: operationId,
    ...(summary ? { summary } : {}),
  }
}

function toRouteFromOperation(operationId: string, summary?: string): ProjectmanHostRouteProjectionEntry {
  const override = CUSTOM_ROUTE_OVERRIDES[operationId]
  if (override) {
    return {
      id: `projectman.${operationId.replace(/\./g, '-')}`,
      method: override.method,
      pattern: override.pattern,
      operation: operationId,
      summary: override.summary ?? summary,
    }
  }

  const crudRoute = toCrudRoute(operationId, summary)
  if (crudRoute) return crudRoute

  return toCustomFallbackRoute(operationId, summary)
}

export function buildProjectmanHostRouteProjection(options?: { refresh?: boolean }): ProjectmanHostRouteProjectionEntry[] {
  const manifest = buildProjectmanDomainCapabilityManifest({
    refresh: options?.refresh,
    includeDocs: true,
  })

  const unique = new Map<string, ProjectmanHostRouteProjectionEntry>()

  for (const operation of manifest.capabilities.operations) {
    const summary = manifest.docs?.operations?.[operation.operationId]?.summary ?? operation.title
    const route = toRouteFromOperation(operation.operationId, summary)
    const key = `${route.method} ${route.pattern}`
    if (!unique.has(key)) unique.set(key, route)
  }

  return [...unique.values()].sort((left, right) => left.operation.localeCompare(right.operation))
}
