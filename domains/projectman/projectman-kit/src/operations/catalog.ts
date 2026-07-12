import type { ProjectmanOperationArgument, ProjectmanOperationKind, ProjectmanOperationSpec } from './types.js'
import {
  cloneProjectmanOperationSpec,
  defineProjectmanKitOperation,
  normalizeProjectmanOperationId,
} from './definition.js'
import { createProjectmanSchemaRef, getProjectmanOperationIoSchemaRefs } from './schemas.js'
import { PROJECTMAN_OPERATION_CATALOG_ROWS } from './catalog.data.js'

const CRUD_KINDS = new Set<Exclude<ProjectmanOperationKind, 'custom'>>(['list', 'get', 'create', 'update', 'delete'])

const RESOURCE_SERVICE_MAP: Record<string, string> = {
  'kanban-board': 'kanbanBoardService',
  'kanban-column': 'kanbanColumnService',
  'kanban-board-column': 'kanbanBoardColumnService',
  'kanban-task': 'kanbanTaskService',
  sprint: 'sprintService',
  'implementation-plan': 'sprintService',
  issue: 'issueItemService',
  feedback: 'feedbackItemService',
  'review-request': 'reviewRequestService',
  'kanban-template': 'kanbanTemplateService',
  event: 'projectmanEventService',
}

let cachedOperations: ProjectmanOperationSpec[] | null = null

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input as Record<string, unknown>
}

function sanitizeArgs(args: readonly ProjectmanOperationArgument[]): ProjectmanOperationArgument[] {
  const unique = new Map<string, ProjectmanOperationArgument>()
  for (const arg of args) {
    const name = String(arg.name ?? '').trim()
    if (!name) continue
    if (name === 'json') continue
    if (!unique.has(name)) {
      unique.set(name, {
        name,
        optional: arg.optional === true,
      })
    }
  }
  return [...unique.values()]
}

function splitOperationId(operationId: string): { resource: string; action: string } {
  const normalized = normalizeProjectmanOperationId(operationId)
  const segments = normalized.split('.').map((segment) => segment.trim()).filter(Boolean)
  if (segments.length < 2) {
    return { resource: normalized, action: 'custom' }
  }
  const action = segments[segments.length - 1]
  const resource = segments.slice(0, -1).join('.')
  return { resource, action }
}

function inferKind(action: string): ProjectmanOperationKind {
  if (CRUD_KINDS.has(action as Exclude<ProjectmanOperationKind, 'custom'>)) {
    return action as Exclude<ProjectmanOperationKind, 'custom'>
  }
  return 'custom'
}

function inferServiceKey(resource: string): string {
  return RESOURCE_SERVICE_MAP[resource] ?? 'projectmanService'
}

function inferMethodName(action: string, resource: string): string {
  return action
    .split('-')
    .map((segment, index) => {
      if (index === 0) return segment
      return `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`
    })
    .join('')
}

function toOperationSchemaRefs(operationId: string): {
  inputSchema?: { $ref: string }
  outputSchema?: { $ref: string }
} {
  const refs = getProjectmanOperationIoSchemaRefs(normalizeProjectmanOperationId(operationId))
  return {
    inputSchema: createProjectmanSchemaRef(refs.inputRef),
    outputSchema: createProjectmanSchemaRef(refs.outputRef),
  }
}

function buildOperationsInternal(): ProjectmanOperationSpec[] {
  const operations: ProjectmanOperationSpec[] = []

  for (const row of PROJECTMAN_OPERATION_CATALOG_ROWS) {
    const { resource, action } = splitOperationId(row.operationId)
    const kind = inferKind(action)
    const operation = defineProjectmanKitOperation({
      operationId: row.operationId,
      toolId: row.toolId,
      serviceKey: inferServiceKey(resource),
      serviceEntity: resource,
      methodName: inferMethodName(action, resource),
      kind,
      args: sanitizeArgs(row.args),
      summary: row.summary,
      tags: [`resource:${resource}`, `action:${action}`],
      ...toOperationSchemaRefs(row.operationId),
    })
    operations.push(operation)
  }

  const unique = new Map<string, ProjectmanOperationSpec>()
  for (const operation of operations) {
    unique.set(operation.operationId, operation)
  }

  return [...unique.values()].sort((left, right) => left.operationId.localeCompare(right.operationId))
}

export function listProjectmanOperationSpecs(options?: { refresh?: boolean }): ProjectmanOperationSpec[] {
  const opts = toRecord(options)
  const refresh = opts.refresh === true
  if (!cachedOperations || refresh) {
    cachedOperations = buildOperationsInternal()
  }
  return cachedOperations.map(cloneProjectmanOperationSpec)
}

export function getProjectmanOperationByToolId(
  toolId: string,
  options?: { refresh?: boolean },
): ProjectmanOperationSpec | null {
  const operations = listProjectmanOperationSpecs(options)
  return operations.find((operation) => operation.toolId === toolId) ?? null
}

export function getProjectmanOperationById(
  operationId: string,
  options?: { refresh?: boolean },
): ProjectmanOperationSpec | null {
  const normalized = normalizeProjectmanOperationId(operationId)
  const operations = listProjectmanOperationSpecs(options)
  return operations.find((operation) => operation.operationId === normalized) ?? null
}
