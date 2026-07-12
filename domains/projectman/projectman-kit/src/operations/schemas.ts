import type { ProjectmanOperationKind, ProjectmanOperationSchemaRef } from './types.js'
import { normalizeProjectmanOperationId } from './definition.js'

type JsonSchema = Record<string, unknown>
type SchemaDirection = 'input' | 'output'

const CRUD_KINDS = new Set<Exclude<ProjectmanOperationKind, 'custom'>>(['list', 'get', 'create', 'update', 'delete'])

const GENERIC_LIST_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    filter: { type: 'object', additionalProperties: true },
    options: { type: 'object', additionalProperties: true },
  },
}

const GENERIC_GET_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
  },
}

const GENERIC_CREATE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
}

const GENERIC_UPDATE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
  required: ['id'],
  properties: {
    id: { type: 'string', minLength: 1 },
  },
}

const GENERIC_DELETE_INPUT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: true,
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

function inferOperationKind(operationId: string): ProjectmanOperationKind {
  const segments = operationId.split('.').map((segment) => segment.trim()).filter(Boolean)
  const last = segments[segments.length - 1] ?? ''
  if (CRUD_KINDS.has(last as Exclude<ProjectmanOperationKind, 'custom'>)) {
    return last as Exclude<ProjectmanOperationKind, 'custom'>
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

function getDefaultSchemaForKind(kind: ProjectmanOperationKind, direction: SchemaDirection): JsonSchema {
  if (kind === 'list' && direction === 'input') return GENERIC_LIST_INPUT_SCHEMA
  if (kind === 'list' && direction === 'output') return GENERIC_LIST_OUTPUT_SCHEMA

  if (kind === 'get' && direction === 'input') return GENERIC_GET_INPUT_SCHEMA
  if (kind === 'get' && direction === 'output') return GENERIC_GET_OUTPUT_SCHEMA

  if (kind === 'create' && direction === 'input') return GENERIC_CREATE_INPUT_SCHEMA
  if (kind === 'create' && direction === 'output') return GENERIC_OBJECT_OUTPUT_SCHEMA

  if (kind === 'update' && direction === 'input') return GENERIC_UPDATE_INPUT_SCHEMA
  if (kind === 'update' && direction === 'output') return GENERIC_OBJECT_OUTPUT_SCHEMA

  if (kind === 'delete' && direction === 'input') return GENERIC_DELETE_INPUT_SCHEMA
  if (kind === 'delete' && direction === 'output') return GENERIC_VOID_OUTPUT_SCHEMA

  if (direction === 'input') return GENERIC_CUSTOM_INPUT_SCHEMA
  return GENERIC_CUSTOM_OUTPUT_SCHEMA
}

export function createProjectmanSchemaRef(name: string): ProjectmanOperationSchemaRef {
  return { $ref: normalizeProjectmanSchemaRefName(name) }
}

export function normalizeProjectmanSchemaRefName(name: string): string {
  return normalizeProjectmanOperationId(name).replace(/\.-/g, '.')
}

export function resolveProjectmanSchemaRefName(schema: unknown): string | null {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null
  const maybeRef = (schema as { $ref?: unknown }).$ref
  if (typeof maybeRef !== 'string') return null
  const normalized = maybeRef.trim()
  return normalized.length > 0 ? normalized : null
}

export function getProjectmanOperationIoSchemaRefs(operationId: string): { inputRef: string; outputRef: string } {
  return buildDefaultSchemaRefs(normalizeProjectmanOperationId(operationId))
}

export function getProjectmanContractSchema(ref: string): JsonSchema | null {
  const parsed = parseSchemaRef(ref)
  if (!parsed) return null

  const normalizedOperationId = normalizeProjectmanOperationId(parsed.operationId)
  const kind = inferOperationKind(normalizedOperationId)
  return getDefaultSchemaForKind(kind, parsed.direction)
}
