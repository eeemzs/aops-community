import type { SysOperationKind, SysOperationSchemaRef } from './types.js'
import { normalizeSysOperationId } from './definition.js'

type JsonSchema = Record<string, unknown>
type SchemaDirection = 'input' | 'output'

const CRUD_KINDS = new Set<Exclude<SysOperationKind, 'custom'>>(['list', 'get', 'create', 'update', 'delete'])

const GENERIC_LIST_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    filter: { type: 'object', additionalProperties: true },
    options: { type: 'object', additionalProperties: true },
  },
}

const GENERIC_GET_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
    options: { type: 'object', additionalProperties: true },
  },
}

const GENERIC_CREATE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: { type: 'object', additionalProperties: true },
  },
}

const GENERIC_UPDATE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'patch'],
  properties: {
    id: { type: 'string', minLength: 1 },
    patch: { type: 'object', additionalProperties: true },
  },
}

const GENERIC_DELETE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
  },
}

const GENERIC_LIST_OUTPUT_SCHEMA: JsonSchema = {
  type: 'array',
  items: { type: 'object', additionalProperties: true },
}

const GENERIC_GET_OUTPUT_SCHEMA: JsonSchema = {
  anyOf: [{ type: 'object', additionalProperties: true }, { type: 'null' }],
}

const GENERIC_OBJECT_OUTPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
}

const GENERIC_VOID_OUTPUT_SCHEMA: JsonSchema = {
  anyOf: [{ type: 'null' }, { type: 'object', additionalProperties: true }],
}

const GENERIC_CUSTOM_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
}

const GENERIC_CUSTOM_OUTPUT_SCHEMA: JsonSchema = {}

function inferOperationKind(operationId: string): SysOperationKind {
  const segments = operationId.split('.').map((segment) => segment.trim()).filter(Boolean)
  const last = segments[segments.length - 1] ?? ''
  if (CRUD_KINDS.has(last as Exclude<SysOperationKind, 'custom'>)) {
    return last as Exclude<SysOperationKind, 'custom'>
  }
  return 'custom'
}

function buildDefaultSchemaRefs(operationId: string): { inputRef: string; outputRef: string } {
  return {
    inputRef: `${operationId}.input`,
    outputRef: `${operationId}.output`,
  }
}

function parseSchemaRef(ref: string): { operationId: string; direction: SchemaDirection } | null {
  const normalized = String(ref ?? '').trim()
  if (!normalized) return null

  if (normalized.endsWith('.input')) {
    const operationId = normalized.slice(0, -'.input'.length)
    if (!operationId) return null
    return { operationId, direction: 'input' }
  }

  if (normalized.endsWith('.output')) {
    const operationId = normalized.slice(0, -'.output'.length)
    if (!operationId) return null
    return { operationId, direction: 'output' }
  }

  return null
}

function getGenericSchemaByKind(kind: SysOperationKind, direction: SchemaDirection): JsonSchema {
  if (kind === 'list') return direction === 'input' ? GENERIC_LIST_INPUT_SCHEMA : GENERIC_LIST_OUTPUT_SCHEMA
  if (kind === 'get') return direction === 'input' ? GENERIC_GET_INPUT_SCHEMA : GENERIC_GET_OUTPUT_SCHEMA
  if (kind === 'create') return direction === 'input' ? GENERIC_CREATE_INPUT_SCHEMA : GENERIC_OBJECT_OUTPUT_SCHEMA
  if (kind === 'update') return direction === 'input' ? GENERIC_UPDATE_INPUT_SCHEMA : GENERIC_OBJECT_OUTPUT_SCHEMA
  if (kind === 'delete') return direction === 'input' ? GENERIC_DELETE_INPUT_SCHEMA : GENERIC_VOID_OUTPUT_SCHEMA
  return direction === 'input' ? GENERIC_CUSTOM_INPUT_SCHEMA : GENERIC_CUSTOM_OUTPUT_SCHEMA
}

export function createSysSchemaRef(ref: string): SysOperationSchemaRef {
  return { $ref: String(ref ?? '').trim() }
}

export function getSysOperationIoSchemaRefs(
  operationId: string,
): { inputRef: string; outputRef: string } | undefined {
  const normalized = normalizeSysOperationId(operationId)
  if (!normalized) return undefined
  return buildDefaultSchemaRefs(normalized)
}

export function resolveSysSchemaRefName(schema: unknown): string | undefined {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return undefined
  if (!('$ref' in schema)) return undefined
  const value = (schema as { $ref?: unknown }).$ref
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

export function getSysContractSchema(ref: string): JsonSchema | undefined {
  const normalizedRef = String(ref ?? '').trim()
  if (!normalizedRef) return undefined

  const parsed = parseSchemaRef(normalizedRef)
  if (!parsed) return undefined

  const operationId = normalizeSysOperationId(parsed.operationId)
  if (!operationId) return undefined

  const kind = inferOperationKind(operationId)
  return getGenericSchemaByKind(kind, parsed.direction)
}
