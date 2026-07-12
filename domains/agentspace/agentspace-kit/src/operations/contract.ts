import type {
  AgentspaceOperationArgument,
  AgentspaceOperationEffect,
  AgentspaceOperationKind,
  AgentspaceOperationPolicy,
  AgentspaceOperationSchema,
  AgentspaceOperationSpec,
} from './types.js'
import { listAgentspaceOperationSpecs } from './catalog.js'
import { normalizeAgentspaceOperationId } from './definition.js'

export type AgentspaceOperationSideEffect = AgentspaceOperationEffect

export type AgentspaceOperationContract = {
  operationId: string
  toolId: string
  summary: string
  kind: AgentspaceOperationKind
  sideEffect: AgentspaceOperationSideEffect
  serviceKey: string
  serviceEntity: string
  methodName: string
  args: AgentspaceOperationArgument[]
  tags?: string[]
  inputSchema?: AgentspaceOperationSchema
  outputSchema?: AgentspaceOperationSchema
  policy?: AgentspaceOperationPolicy
  examples?: string[]
}

type AgentspaceOperationPolicyRecord = {
  scope: 'tenant' | 'global'
  auth?: { required?: boolean; roles?: string[]; capabilities?: string[] }
  safety?: { destructive?: boolean; confirmationRequired?: boolean; applyRequired?: boolean }
  rateLimit?: { bucket: string; max: number; windowSeconds: number }
}

function toSummary(operationId: string): string {
  const normalized = operationId
    .split('.')
    .flatMap((segment) => segment.split('-'))
    .join(' ')
    .trim()
  if (!normalized) return operationId
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function toSideEffect(kind: AgentspaceOperationKind): AgentspaceOperationSideEffect {
  if (kind === 'list' || kind === 'get') return 'none'
  if (kind === 'custom') return 'mixed'
  return 'db'
}

function isWriteOperation(spec: AgentspaceOperationSpec): boolean {
  if (spec.kind === 'create' || spec.kind === 'update' || spec.kind === 'delete') return true
  // Custom-verb operations that mutate persistent state must opt in by declaring
  // sideEffect: 'db' so the gateway enforces apply/write-safety on them too
  // (e.g. discussion-topic.conclude, discussion-output.set).
  if (spec.sideEffect === 'db') return true
  return spec.operationId.endsWith('.push')
}

function toDefaultPolicy(spec: AgentspaceOperationSpec): AgentspaceOperationPolicy {
  const write = isWriteOperation(spec)
  const policy: AgentspaceOperationPolicyRecord = {
    scope: 'tenant',
    auth: { required: true },
  }

  if (write) {
    policy.safety = {
      destructive: false,
      applyRequired: true,
      confirmationRequired: false,
    }
    policy.rateLimit = {
      bucket: 'agentspace-write',
      max: 100,
      windowSeconds: 60,
    }
    return policy
  }

  policy.rateLimit = {
    bucket: 'agentspace-read',
    max: 240,
    windowSeconds: 60,
  }
  return policy
}

function toJsonExample(input: Record<string, unknown>): string {
  return JSON.stringify(input)
}

function toDefaultExampleFromArgs(spec: AgentspaceOperationSpec): string {
  const payload: Record<string, unknown> = {}
  for (const arg of spec.args) {
    if (arg.name === 'id') payload.id = '<id>'
    else if (arg.name === 'scopeId') payload.scopeId = '<scopeId>'
    else if (arg.name === 'scopeResolution') payload.scopeResolution = 'cascade'
    else if (arg.name === 'projectId') payload.projectId = '<projectId>'
    else if (arg.name === 'taskId') payload.taskId = '<taskId>'
    else if (arg.name === 'promptId') payload.promptId = '<promptId>'
    else if (arg.name === 'skillId') payload.skillId = '<skillId>'
    else if (arg.name === 'filter') payload.filter = {}
    else if (arg.name === 'criteria') payload.criteria = {}
    else if (arg.name === 'options') payload.options = { limit: 20 }
    else if (arg.name === 'opts') payload.opts = {}
    else if (arg.name === 'patch') payload.patch = {}
    else if (arg.name === 'data') payload.data = {}
    else payload[arg.name] = `<${arg.name}>`
  }

  if (Object.keys(payload).length === 0) payload.input = '<payload>'
  return toJsonExample(payload)
}

function toDefaultExamples(spec: AgentspaceOperationSpec): string[] {
  return [toDefaultExampleFromArgs(spec)]
}

function fromSpec(spec: AgentspaceOperationSpec): AgentspaceOperationContract {
  const summary = typeof spec.summary === 'string' ? spec.summary.trim() : ''
  const policy = spec.policy ?? toDefaultPolicy(spec)
  const examples = spec.examples && spec.examples.length > 0 ? [...spec.examples] : toDefaultExamples(spec)

  return {
    operationId: spec.operationId,
    toolId: spec.toolId,
    summary: summary || toSummary(spec.operationId),
    kind: spec.kind,
    sideEffect: spec.sideEffect ?? toSideEffect(spec.kind),
    serviceKey: spec.serviceKey,
    serviceEntity: spec.serviceEntity,
    methodName: spec.methodName,
    args: spec.args.map((arg) => ({ ...arg })),
    ...(spec.tags ? { tags: [...spec.tags] } : {}),
    ...(spec.inputSchema !== undefined ? { inputSchema: spec.inputSchema } : {}),
    ...(spec.outputSchema !== undefined ? { outputSchema: spec.outputSchema } : {}),
    ...(policy !== undefined ? { policy } : {}),
    ...(examples.length > 0 ? { examples } : {}),
  }
}

export function listAgentspaceOperationContracts(options?: { refresh?: boolean }): AgentspaceOperationContract[] {
  return listAgentspaceOperationSpecs(options).map(fromSpec)
}

export function getAgentspaceOperationContractByToolId(toolId: string, options?: { refresh?: boolean }): AgentspaceOperationContract | null {
  const operations = listAgentspaceOperationContracts(options)
  return operations.find((operation) => operation.toolId === toolId) ?? null
}

export function getAgentspaceOperationContractById(operationId: string, options?: { refresh?: boolean }): AgentspaceOperationContract | null {
  const normalized = normalizeAgentspaceOperationId(operationId)
  const operations = listAgentspaceOperationContracts(options)
  return operations.find((operation) => operation.operationId === normalized) ?? null
}
