import type {
  DefineAgentspaceKitOperationInput,
  AgentspaceOperationArgument,
  AgentspaceOperationSpec,
} from './types.js'

const TOOL_PREFIX = 'agentspace.'

function normalizeNonEmpty(value: string): string {
  return String(value ?? '').trim()
}

function normalizeTags(tags: string[] | undefined): string[] | undefined {
  if (!tags || tags.length === 0) return undefined
  const unique = new Set<string>()
  for (const tag of tags) {
    const normalized = String(tag ?? '').trim()
    if (!normalized) continue
    unique.add(normalized)
  }
  if (unique.size === 0) return undefined
  return [...unique]
}

function cloneArgs(args: AgentspaceOperationArgument[] | undefined): AgentspaceOperationArgument[] {
  if (!args || args.length === 0) return []
  return args.map((arg) => ({
    name: String(arg.name ?? '').trim(),
    optional: arg.optional === true,
  }))
}

function normalizeExamples(examples: string[] | undefined): string[] | undefined {
  if (!examples || examples.length === 0) return undefined
  const normalized = examples.map((example) => String(example ?? '').trim()).filter(Boolean)
  if (normalized.length === 0) return undefined
  return normalized
}

export function normalizeAgentspaceOperationId(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\.+/g, '.')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .toLowerCase()
}

export function buildAgentspaceToolIdFromOperation(operationId: string): string {
  return `${TOOL_PREFIX}${normalizeAgentspaceOperationId(operationId)}`
}

function normalizeAgentspaceToolId(toolId: string): string {
  const normalized = String(toolId ?? '').trim().toLowerCase()
  if (!normalized) return normalized
  return normalized
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/\.+/g, '.')
    .replace(/^[.-]+/, '')
    .replace(/[.-]+$/, '')
}

export function defineAgentspaceKitOperation(input: DefineAgentspaceKitOperationInput): AgentspaceOperationSpec {
  const operationId = normalizeAgentspaceOperationId(input.operationId)
  if (!operationId) throw new Error('invalid_aops_operation_id')

  const serviceKey = normalizeNonEmpty(input.serviceKey)
  if (!serviceKey) throw new Error(`invalid_aops_operation_service_key:${operationId}`)

  const serviceEntity = normalizeNonEmpty(input.serviceEntity)
  if (!serviceEntity) throw new Error(`invalid_aops_operation_service_entity:${operationId}`)

  const methodName = normalizeNonEmpty(input.methodName)
  if (!methodName) throw new Error(`invalid_aops_operation_method_name:${operationId}`)

  const toolIdSource = input.toolId ?? buildAgentspaceToolIdFromOperation(operationId)
  const toolId = normalizeAgentspaceToolId(toolIdSource)
  if (!toolId) throw new Error(`invalid_aops_operation_tool_id:${operationId}`)

  const summary = normalizeNonEmpty(input.summary ?? '')
  const tags = normalizeTags(input.tags)
  const examples = normalizeExamples(input.examples)

  return {
    operationId,
    toolId,
    serviceKey,
    serviceEntity,
    methodName,
    kind: input.kind,
    args: cloneArgs(input.args),
    ...(summary ? { summary } : {}),
    ...(tags ? { tags } : {}),
    ...(input.sideEffect ? { sideEffect: input.sideEffect } : {}),
    ...(input.inputSchema !== undefined ? { inputSchema: input.inputSchema } : {}),
    ...(input.outputSchema !== undefined ? { outputSchema: input.outputSchema } : {}),
    ...(input.policy !== undefined ? { policy: input.policy } : {}),
    ...(examples ? { examples } : {}),
  }
}

export function defineAgentspaceKitOperations(input: DefineAgentspaceKitOperationInput[]): AgentspaceOperationSpec[] {
  return input.map(defineAgentspaceKitOperation)
}

export function cloneAgentspaceOperationSpec(spec: AgentspaceOperationSpec): AgentspaceOperationSpec {
  return {
    ...spec,
    args: cloneArgs(spec.args),
    ...(spec.tags ? { tags: [...spec.tags] } : {}),
    ...(spec.examples ? { examples: [...spec.examples] } : {}),
  }
}
