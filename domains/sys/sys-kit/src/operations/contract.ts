import type {
  SysOperationArgument,
  SysOperationEffect,
  SysOperationKind,
  SysOperationPolicy,
  SysOperationSchema,
  SysOperationSpec,
} from './types.js'
import { listSysOperationSpecs } from './catalog.js'

export type SysOperationSideEffect = SysOperationEffect

export type SysOperationContract = {
  operationId: string
  toolId: string
  summary: string
  kind: SysOperationKind
  sideEffect: SysOperationSideEffect
  serviceKey: string
  serviceEntity: string
  methodName: string
  args: SysOperationArgument[]
  tags?: string[]
  inputSchema?: SysOperationSchema
  outputSchema?: SysOperationSchema
  policy?: SysOperationPolicy
  examples?: string[]
}

type SysOperationPolicyRecord = {
  scope: 'tenant' | 'global' | 'workspace' | 'project'
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

function toSideEffect(kind: SysOperationKind): SysOperationSideEffect {
  if (kind === 'list' || kind === 'get') return 'none'
  if (kind === 'custom') return 'mixed'
  return 'db'
}

function isDestructiveOperation(spec: SysOperationSpec): boolean {
  return spec.kind === 'delete' || spec.operationId.includes('.delete.')
}

function toDefaultPolicy(spec: SysOperationSpec): SysOperationPolicy {
  const destructive = isDestructiveOperation(spec)
  const writeKind = spec.kind === 'create' || spec.kind === 'update' || spec.kind === 'delete'

  const policy: SysOperationPolicyRecord = {
    scope: 'tenant',
    auth: { required: true },
  }

  if (destructive || writeKind) {
    policy.safety = {
      destructive,
      applyRequired: true,
      confirmationRequired: spec.operationId.endsWith('.delete.safe'),
    }
    policy.rateLimit = {
      bucket: destructive ? 'sys-write-destructive' : 'sys-write',
      max: destructive ? 30 : 60,
      windowSeconds: 60,
    }
    return policy
  }

  policy.rateLimit = {
    bucket: 'sys-read',
    max: spec.kind === 'list' ? 180 : 240,
    windowSeconds: 60,
  }
  return policy
}

function toJsonExample(input: Record<string, unknown>): string {
  return JSON.stringify(input)
}

function toDefaultExampleFromArgs(spec: SysOperationSpec): string {
  const payload: Record<string, unknown> = {}
  for (const arg of spec.args) {
    if (arg.name === 'id') payload.id = '<id>'
    else if (arg.name === 'data') payload.data = { key: '<value>' }
    else if (arg.name === 'patch') payload.patch = { key: '<value>' }
    else if (arg.name === 'filter') payload.filter = {}
    else if (arg.name === 'options') payload.options = {}
    else payload[arg.name] = `<${arg.name}>`
  }

  if (Object.keys(payload).length === 0) payload.input = '<payload>'
  return toJsonExample(payload)
}

function toDefaultExamples(spec: SysOperationSpec): string[] {
  return [toDefaultExampleFromArgs(spec)]
}

function fromSpec(spec: SysOperationSpec): SysOperationContract {
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

export function listSysOperationContracts(options?: { refresh?: boolean }): SysOperationContract[] {
  return listSysOperationSpecs(options).map(fromSpec)
}

export function getSysOperationContractByToolId(
  toolId: string,
  options?: { refresh?: boolean },
): SysOperationContract | null {
  const operations = listSysOperationContracts(options)
  return operations.find((operation) => operation.toolId === toolId) ?? null
}

export function getSysOperationContractById(
  operationId: string,
  options?: { refresh?: boolean },
): SysOperationContract | null {
  const operations = listSysOperationContracts(options)
  return operations.find((operation) => operation.operationId === operationId) ?? null
}
