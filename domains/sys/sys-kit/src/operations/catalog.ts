import type { SysOperationArgument, SysOperationKind, SysOperationSpec } from './types.js'
import {
  cloneSysOperationSpec,
  defineSysKitOperation,
  defineSysKitOperations,
  normalizeSysOperationId,
} from './definition.js'
import {
  SYS_CRUD_ENTITIES,
  SYS_CUSTOM_OPERATIONS,
  type SysCustomOperationDefinition,
  type SysCrudEntityDefinition,
} from './catalog.data.js'
import { createSysSchemaRef, getSysOperationIoSchemaRefs } from './schemas.js'

const CRUD_LIST_ARGS: SysOperationArgument[] = [
  { name: 'filter', optional: true },
  { name: 'options', optional: true },
]

const CRUD_GET_ARGS: SysOperationArgument[] = [
  { name: 'id', optional: false },
  { name: 'options', optional: true },
]

const CRUD_CREATE_ARGS: SysOperationArgument[] = [{ name: 'data', optional: false }]

const CRUD_UPDATE_ARGS: SysOperationArgument[] = [
  { name: 'id', optional: false },
  { name: 'patch', optional: false },
]

const CRUD_DELETE_ARGS: SysOperationArgument[] = [{ name: 'id', optional: false }]

let cachedOperations: SysOperationSpec[] | null = null

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input as Record<string, unknown>
}

function buildCrudMethodName(serviceEntityPascal: string, kind: Exclude<SysOperationKind, 'custom'>): string {
  if (kind === 'list') return `list${serviceEntityPascal}s`
  if (kind === 'get') return 'getById'
  if (kind === 'create') return 'create'
  if (kind === 'update') return `update${serviceEntityPascal}`
  return `remove${serviceEntityPascal}`
}

function buildCrudOperation(
  entity: SysCrudEntityDefinition,
  kind: Exclude<SysOperationKind, 'custom'>,
  args: SysOperationArgument[],
): SysOperationSpec {
  const operationId = `${entity.entity}.${kind}`
  return defineSysKitOperation({
    operationId,
    serviceKey: entity.serviceKey,
    serviceEntity: entity.entity,
    methodName: buildCrudMethodName(entity.serviceEntityPascal, kind),
    kind,
    args,
    ...toOperationSchemaRefs(operationId),
  })
}

function buildCrudOperations(): SysOperationSpec[] {
  const operations: SysOperationSpec[] = []
  for (const entity of SYS_CRUD_ENTITIES) {
    operations.push(buildCrudOperation(entity, 'list', CRUD_LIST_ARGS))
    operations.push(buildCrudOperation(entity, 'get', CRUD_GET_ARGS))
    operations.push(buildCrudOperation(entity, 'create', CRUD_CREATE_ARGS))
    operations.push(buildCrudOperation(entity, 'update', CRUD_UPDATE_ARGS))
    operations.push(buildCrudOperation(entity, 'delete', CRUD_DELETE_ARGS))
  }
  return operations
}

function buildCustomOperations(): SysOperationSpec[] {
  return defineSysKitOperations(
    (SYS_CUSTOM_OPERATIONS as readonly SysCustomOperationDefinition[]).map((operation) => ({
      operationId: operation.operationId,
      toolId: operation.toolId,
      serviceKey: operation.serviceKey,
      serviceEntity: operation.serviceEntity,
      methodName: operation.methodName,
      kind: 'custom',
      args: operation.args.map((arg) => ({ ...arg })),
      summary: operation.summary,
      tags: operation.tags ? [...operation.tags] : undefined,
      sideEffect: operation.sideEffect,
      policy: operation.policy,
      examples: operation.examples ? [...operation.examples] : undefined,
      ...toOperationSchemaRefs(operation.operationId),
    })),
  )
}

function toOperationSchemaRefs(operationId: string): {
  inputSchema?: { $ref: string }
  outputSchema?: { $ref: string }
} {
  const refs = getSysOperationIoSchemaRefs(normalizeSysOperationId(operationId))
  if (!refs) return {}
  return {
    inputSchema: createSysSchemaRef(refs.inputRef),
    outputSchema: createSysSchemaRef(refs.outputRef),
  }
}

function buildOperationsInternal(): SysOperationSpec[] {
  const operations = [...buildCrudOperations(), ...buildCustomOperations()]

  const unique = new Map<string, SysOperationSpec>()
  for (const operation of operations) {
    unique.set(operation.operationId, operation)
  }

  return [...unique.values()].sort((left, right) => left.operationId.localeCompare(right.operationId))
}

export function listSysOperationSpecs(options?: { refresh?: boolean }): SysOperationSpec[] {
  const opts = toRecord(options)
  const refresh = opts.refresh === true
  if (!cachedOperations || refresh) {
    cachedOperations = buildOperationsInternal()
  }
  return cachedOperations.map(cloneSysOperationSpec)
}

export function getSysOperationByToolId(toolId: string, options?: { refresh?: boolean }): SysOperationSpec | null {
  const operations = listSysOperationSpecs(options)
  return operations.find((operation) => operation.toolId === toolId) ?? null
}

export function getSysOperationById(operationId: string, options?: { refresh?: boolean }): SysOperationSpec | null {
  const normalized = normalizeSysOperationId(operationId)
  const operations = listSysOperationSpecs(options)
  return operations.find((operation) => operation.operationId === normalized) ?? null
}

export { buildSysToolIdFromOperation } from './definition.js'
