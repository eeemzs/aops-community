import type {
  DefineProjectmanKitOperationInput,
  ProjectmanOperationArgument,
  ProjectmanOperationSpec,
} from './types.js'

const TOOL_PREFIX = 'projectman-'
const ACTION_SUFFIXES = ['set-wip-limit', 'reorder', 'create', 'update', 'delete', 'list', 'get', 'move', 'apply']

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

function cloneArgs(args: ProjectmanOperationArgument[] | undefined): ProjectmanOperationArgument[] {
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

export function normalizeProjectmanOperationId(value: string): string {
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

export function buildProjectmanOperationIdFromToolId(toolId: string): string {
  const normalized = String(toolId ?? '').trim().toLowerCase()
  if (!normalized.startsWith(TOOL_PREFIX)) {
    throw new Error(`invalid_projectman_tool_id:${toolId}`)
  }

  const tail = normalized.slice(TOOL_PREFIX.length)
  for (const action of ACTION_SUFFIXES) {
    const suffix = `-${action}`
    if (!tail.endsWith(suffix)) continue
    const entity = tail.slice(0, -suffix.length)
    if (!entity) break
    return `${entity}.${action}`
  }

  return `${tail}.custom`
}

export function buildProjectmanToolIdFromOperation(operationId: string): string {
  return `${TOOL_PREFIX}${normalizeProjectmanOperationId(operationId).replace(/\./g, '-')}`
}

function normalizeProjectmanToolId(toolId: string): string {
  const normalized = String(toolId ?? '').trim().toLowerCase()
  if (!normalized) return normalized
  return normalized
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
}

export function defineProjectmanKitOperation(input: DefineProjectmanKitOperationInput): ProjectmanOperationSpec {
  const operationId = normalizeProjectmanOperationId(input.operationId)
  if (!operationId) throw new Error('invalid_projectman_operation_id')

  const serviceKey = normalizeNonEmpty(input.serviceKey)
  if (!serviceKey) throw new Error(`invalid_projectman_operation_service_key:${operationId}`)

  const serviceEntity = normalizeNonEmpty(input.serviceEntity)
  if (!serviceEntity) throw new Error(`invalid_projectman_operation_service_entity:${operationId}`)

  const methodName = normalizeNonEmpty(input.methodName)
  if (!methodName) throw new Error(`invalid_projectman_operation_method_name:${operationId}`)

  const toolIdSource = input.toolId ?? buildProjectmanToolIdFromOperation(operationId)
  const toolId = normalizeProjectmanToolId(toolIdSource)
  if (!toolId) throw new Error(`invalid_projectman_operation_tool_id:${operationId}`)

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

export function defineProjectmanKitOperations(input: DefineProjectmanKitOperationInput[]): ProjectmanOperationSpec[] {
  return input.map(defineProjectmanKitOperation)
}

export function cloneProjectmanOperationSpec(spec: ProjectmanOperationSpec): ProjectmanOperationSpec {
  return {
    ...spec,
    args: cloneArgs(spec.args),
    ...(spec.tags ? { tags: [...spec.tags] } : {}),
    ...(spec.examples ? { examples: [...spec.examples] } : {}),
  }
}
