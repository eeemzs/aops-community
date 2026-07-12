import type { AgentspaceOperationSpec } from './types.js'
import {
  buildAgentspaceToolIdFromOperation,
  cloneAgentspaceOperationSpec,
  defineAgentspaceKitOperation,
  normalizeAgentspaceOperationId,
} from './definition.js'
import { createAgentspaceSchemaRef, getAgentspaceOperationIoSchemaRefs } from './schemas.js'
import { AGENTSPACE_OPERATION_CATALOG_ROWS } from './catalog.data.js'

let cachedOperations: AgentspaceOperationSpec[] | null = null

const EXTRACTED_TASKER_OPERATION_PREFIXES = [
  'kanban-board.',
  'kanban-column.',
  'sprint.',
  'sprint-item.',
  'task.',
  'task-comment.',
] as const

const SCOPEABLE_DEFAULT_READ_SERVICE_ENTITIES = new Set([
  'activity-item',
  'agent-profile',
  'agent-run',
  'agent-run-event',
  'agent-session',
  'artifact',
  'chat-message',
  'chat-room',
  'codex-chat-thread',
  'discussion-topic',
  'experience-item',
  'memory-item',
  'mission',
  'prompt',
  'resource',
  'skill',
  'workflow-definition',
  'workflow-instance',
  'workflow-step-run',
])

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input as Record<string, unknown>
}

function toOperationSchemaRefs(operationId: string): {
  inputSchema?: { $ref: string }
  outputSchema?: { $ref: string }
} {
  const refs = getAgentspaceOperationIoSchemaRefs(operationId)
  return {
    inputSchema: createAgentspaceSchemaRef(refs.inputRef),
    outputSchema: createAgentspaceSchemaRef(refs.outputRef),
  }
}

function cloneArgs(args: ReadonlyArray<{ name: string; optional: boolean }>): { name: string; optional: boolean }[] {
  return args.map((arg) => ({ ...arg }))
}

function isExtractedTaskerOperation(operationId: string): boolean {
  return EXTRACTED_TASKER_OPERATION_PREFIXES.some((prefix) => operationId.startsWith(prefix))
}

function isScopeableDefaultReadOperation(row: (typeof AGENTSPACE_OPERATION_CATALOG_ROWS)[number]): boolean {
  if (row.kind !== 'list') return false
  if (!SCOPEABLE_DEFAULT_READ_SERVICE_ENTITIES.has(row.serviceEntity)) return false
  return row.args.some((arg) => arg.name === 'filter')
}

function buildOperationsInternal(): AgentspaceOperationSpec[] {
  const operations: AgentspaceOperationSpec[] = []

  for (const row of AGENTSPACE_OPERATION_CATALOG_ROWS) {
    if (isExtractedTaskerOperation(row.operationId)) continue
    const action = row.operationId.split('.').slice(1).join('.') || 'custom'
    const tags = [
      `resource:${row.serviceEntity}`,
      `action:${action}`,
      ...(isScopeableDefaultReadOperation(row) ? ['scope:default-project-read'] : []),
    ]
    const operation = defineAgentspaceKitOperation({
      operationId: row.operationId,
      toolId: buildAgentspaceToolIdFromOperation(row.operationId),
      serviceKey: row.serviceKey,
      serviceEntity: row.serviceEntity,
      methodName: row.methodName,
      kind: row.kind,
      ...('sideEffect' in row && row.sideEffect ? { sideEffect: row.sideEffect } : {}),
      args: cloneArgs(row.args),
      summary: row.summary,
      tags,
      ...('examples' in row && Array.isArray(row.examples) ? { examples: row.examples } : {}),
      ...toOperationSchemaRefs(row.operationId),
    })
    operations.push(operation)
  }

  const unique = new Map<string, AgentspaceOperationSpec>()
  for (const operation of operations) {
    unique.set(operation.operationId, operation)
  }

  return [...unique.values()].sort((left, right) => left.operationId.localeCompare(right.operationId))
}

export function listAgentspaceOperationSpecs(options?: { refresh?: boolean }): AgentspaceOperationSpec[] {
  const opts = toRecord(options)
  const refresh = opts.refresh === true
  if (!cachedOperations || refresh) {
    cachedOperations = buildOperationsInternal()
  }
  return cachedOperations.map(cloneAgentspaceOperationSpec)
}

export function getAgentspaceOperationByToolId(toolId: string, options?: { refresh?: boolean }): AgentspaceOperationSpec | null {
  const operations = listAgentspaceOperationSpecs(options)
  return operations.find((operation) => operation.toolId === toolId) ?? null
}

export function getAgentspaceOperationById(operationId: string, options?: { refresh?: boolean }): AgentspaceOperationSpec | null {
  const normalized = normalizeAgentspaceOperationId(operationId)
  const operations = listAgentspaceOperationSpecs(options)
  return operations.find((operation) => operation.operationId === normalized) ?? null
}
