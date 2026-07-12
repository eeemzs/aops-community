import { z } from 'zod'
import {
  REVIEW_REQUEST_OUTCOMES,
  REVIEW_REQUEST_PRIORITIES,
  REVIEW_REQUEST_SOURCES,
  REVIEW_REQUEST_STATUSES,
} from '@aopslab/domain-dm-projectman'

import { PROJECTMAN_OPERATION_CATALOG_ROWS } from './catalog.data.js'
import type { ProjectmanOperationArgument } from './types.js'
import type { ProjectmanOperationInput, ProjectmanTypedOperationId } from './io-types.js'

type ProjectmanToolInputRecord = Record<string, unknown>
type ProjectmanToolInputSchema = z.ZodType<ProjectmanToolInputRecord>

type ProjectmanOperationCatalogRow = (typeof PROJECTMAN_OPERATION_CATALOG_ROWS)[number]

const PROJECTMAN_TOOL_INPUT_CONTEXT_KEYS = [
  'projectId',
  'scopeId',
  'project',
  'scope',
  'tenantId',
  'locale',
  'fallbackLocale',
  '__hostContext',
] as const

function toRecord(input: unknown): ProjectmanToolInputRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input as ProjectmanToolInputRecord
}

function isPlainRecord(value: unknown): value is ProjectmanToolInputRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    const normalized = String(value).trim()
    return normalized.length > 0 ? normalized : undefined
  }
  return undefined
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    if (trimmed.toLowerCase() === 'null') return null
    return trimmed
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    const normalized = String(value).trim()
    return normalized.length > 0 ? normalized : undefined
  }
  return undefined
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  if (!normalized) return undefined
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return undefined
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function normalizeNullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value === 'string' && value.trim().toLowerCase() === 'null') return null
  return normalizeNumber(value)
}

function normalizeDate(value: unknown): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = new Date(trimmed)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }
  return undefined
}

function normalizeNullableDate(value: unknown): Date | null | undefined {
  if (value === null) return null
  if (typeof value === 'string' && value.trim().toLowerCase() === 'null') return null
  return normalizeDate(value)
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim()).filter(Boolean)
        }
      } catch {
        // fall through to comma parsing
      }
    }
    const items = trimmed.split(',').map((item) => item.trim()).filter(Boolean)
    return items.length > 0 ? items : undefined
  }

  return undefined
}

function normalizeJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (isPlainRecord(value)) return value
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    const parsed = JSON.parse(trimmed)
    return isPlainRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function resolveProjectContextId(input: ProjectmanToolInputRecord): string | undefined {
  const hostContext = isPlainRecord(input.__hostContext) ? input.__hostContext : undefined
  return (
    normalizeNonEmptyString(input.scopeId) ??
    normalizeNonEmptyString(input.scope) ??
    normalizeNonEmptyString(input.projectId) ??
    normalizeNonEmptyString(input.project) ??
    normalizeNonEmptyString(hostContext?.scopeId) ??
    normalizeNonEmptyString(hostContext?.scope) ??
    normalizeNonEmptyString(hostContext?.projectId) ??
    normalizeNonEmptyString(hostContext?.project)
  )
}

function resolveContextValue(input: ProjectmanToolInputRecord, key: 'tenantId' | 'locale' | 'fallbackLocale'): string | undefined {
  const hostContext = isPlainRecord(input.__hostContext) ? input.__hostContext : undefined
  return normalizeNonEmptyString(input[key]) ?? normalizeNonEmptyString(hostContext?.[key])
}

function getOperationResource(operationId: string): string {
  const normalized = String(operationId ?? '').trim().toLowerCase()
  const dotIndex = normalized.indexOf('.')
  return dotIndex < 0 ? normalized : normalized.slice(0, dotIndex)
}

function getIdAliases(operationId: string): string[] {
  switch (getOperationResource(operationId)) {
    case 'kanban-board':
      return ['boardId', 'kanbanBoardId']
    case 'kanban-column':
      return ['columnId', 'kanbanColumnId']
    case 'kanban-board-column':
      return ['boardColumnId', 'kanbanBoardColumnId']
    case 'kanban-task':
      return ['taskId', 'kanbanTaskId']
    case 'sprint':
      return ['sprintId']
    case 'implementation-plan':
      return ['planId', 'implementationPlanId', 'sprintId']
    case 'issue':
      return ['issueId', 'issueItemId']
    case 'feedback':
      return ['feedbackId', 'feedbackItemId']
    case 'review-request':
      return ['reviewRequestId', 'reviewRequest']
    case 'kanban-template':
      return ['templateId', 'kanbanTemplateId']
    case 'event':
      return ['eventId', 'projectmanEventId']
    default:
      return []
  }
}

function getAliasesForArg(operationId: string, argName: string): string[] {
  switch (argName) {
    case 'project':
      return ['projectId', 'scopeId', 'scope']
    case 'board':
      return ['boardId']
    case 'boardColumn':
      return ['boardColumnId', 'column', 'columnId']
    case 'column':
      return ['columnId']
    case 'sprint':
      return ['sprintId']
    case 'sprintId':
      return ['sprint']
    case 'kanbanTask':
      return ['kanbanTaskId']
    case 'microTask':
      return ['microTaskId', 'microtaskId', 'microTaskItemId', 'microtask']
    case 'issue':
      return ['issueId', 'issueItemId']
    case 'feedback':
      return ['feedbackId', 'feedbackItemId']
    case 'reviewRequest':
      return ['reviewRequestId', 'review-request']
    case 'parentReviewRequest':
      return ['parentReviewRequestId', 'parent', 'parentId']
    case 'rootReviewRequest':
      return ['rootReviewRequestId', 'root', 'rootId']
    case 'collabSession':
      return ['collabSessionId', 'session']
    case 'collabRequestEvent':
      return ['collabRequestEventId', 'requestEvent', 'requestEventId']
    case 'taskCode':
      return ['code']
    case 'id':
      return getIdAliases(operationId)
    default:
      return []
  }
}

function getAllowedRawKeys(operationId: string, args: ProjectmanOperationArgument[]): Set<string> {
  const allowed = new Set<string>(PROJECTMAN_TOOL_INPUT_CONTEXT_KEYS as readonly string[])
  for (const arg of args) {
    const canonical = String(arg.name ?? '').trim()
    if (!canonical) continue
    allowed.add(canonical)
    for (const alias of getAliasesForArg(operationId, canonical)) {
      allowed.add(alias)
    }
  }
  return allowed
}

function resolveRawArgValue(
  operationId: string,
  input: ProjectmanToolInputRecord,
  argName: string,
): unknown {
  const canonical = input[argName]
  if (canonical !== undefined) return canonical

  for (const alias of getAliasesForArg(operationId, argName)) {
    if (input[alias] !== undefined) return input[alias]
  }

  return undefined
}

function buildStringSchema(optional: boolean): z.ZodTypeAny {
  const schema = z.preprocess((value) => normalizeNonEmptyString(value), z.string().min(1))
  return optional ? schema.optional() : schema
}

function buildNullableStringSchema(optional: boolean): z.ZodTypeAny {
  const schema = z.preprocess((value) => normalizeNullableString(value), z.string().min(1).nullable())
  return optional ? schema.optional() : schema
}

function buildNumberSchema(optional: boolean): z.ZodTypeAny {
  const schema = z.preprocess((value) => normalizeNumber(value), z.number().finite())
  return optional ? schema.optional() : schema
}

function buildNullableNumberSchema(optional: boolean): z.ZodTypeAny {
  const schema = z.preprocess((value) => normalizeNullableNumber(value), z.number().finite().nullable())
  return optional ? schema.optional() : schema
}

function buildDateSchema(optional: boolean): z.ZodTypeAny {
  const schema = z.preprocess((value) => normalizeDate(value), z.date())
  return optional ? schema.optional() : schema
}

function buildNullableDateSchema(optional: boolean): z.ZodTypeAny {
  const schema = z.preprocess((value) => normalizeNullableDate(value), z.date().nullable())
  return optional ? schema.optional() : schema
}

function buildBooleanSchema(optional: boolean): z.ZodTypeAny {
  const schema = z.preprocess((value) => normalizeBoolean(value), z.boolean())
  return optional ? schema.optional() : schema
}

function buildStringArraySchema(optional: boolean): z.ZodTypeAny {
  const schema = z.preprocess((value) => normalizeStringArray(value), z.array(z.string().min(1)))
  return optional ? schema.optional() : schema
}

function buildJsonObjectSchema(optional: boolean): z.ZodTypeAny {
  const schema = z.preprocess((value) => normalizeJsonObject(value), z.record(z.string(), z.unknown()))
  return optional ? schema.optional() : schema
}

function buildStringEnumSchema<T extends readonly [string, ...string[]]>(values: T, optional: boolean): z.ZodTypeAny {
  const schema = z.preprocess((value) => normalizeNonEmptyString(value), z.enum(values))
  return optional ? schema.optional() : schema
}

function buildFieldSchema(operationId: string, arg: ProjectmanOperationArgument): z.ZodTypeAny {
  const optional = arg.optional === true
  switch (arg.name) {
    case 'orderedIds':
    case 'references':
    case 'collabResultEventIds':
    case 'positives':
    case 'concerns':
    case 'objections':
    case 'issueIds':
    case 'scope':
    case 'validationPlan':
      return buildStringArraySchema(optional)
    case 'phases':
      return z.preprocess((value) => (Array.isArray(value) ? value : undefined), z.array(z.unknown())).optional()
    case 'tags':
      return buildStringArraySchema(optional)
    case 'json':
    case 'includeArchived':
      return buildBooleanSchema(optional)
    case 'position':
    case 'progress':
    case 'wipLimit':
      return optional ? buildNullableNumberSchema(true) : buildNumberSchema(false)
    case 'startAt':
    case 'endAt':
    case 'openedAt':
    case 'closedAt':
    case 'recordedAt':
    case 'resolvedAt':
    case 'handledAt':
    case 'requestedAt':
    case 'resultCreatedAt':
    case 'timelineAt':
    case 'sourceCreatedAt':
    case 'sourceUpdatedAt':
      return optional ? buildNullableDateSchema(true) : buildDateSchema(false)
    case 'definition':
    case 'meta':
    case 'basedOnSeqRange':
      return buildJsonObjectSchema(optional)
    case 'description':
    case 'summary':
    case 'content':
    case 'goal':
    case 'kind':
    case 'notes':
    case 'period':
    case 'slug':
    case 'sourceId':
    case 'sourceType':
    case 'severity':
    case 'state':
    case 'suggestion':
    case 'taskCode':
    case 'type':
    case 'entityType':
    case 'entityId':
    case 'name':
    case 'title':
    case 'project':
    case 'board':
    case 'boardColumn':
    case 'column':
    case 'sprint':
    case 'sprintId':
    case 'kanbanTask':
    case 'issue':
    case 'feedback':
    case 'reviewRequest':
    case 'parentReviewRequest':
    case 'rootReviewRequest':
    case 'reviewScope':
    case 'instructions':
    case 'collabSession':
    case 'collabRequestEvent':
    case 'collabResultEventId':
    case 'requestedBy':
    case 'targetAgent':
    case 'targetSlot':
    case 'reviewer':
    case 'resultId':
    case 'idempotencyKey':
    case 'id':
      return optional ? buildNullableStringSchema(true) : buildStringSchema(false)
    case 'priority':
      return operationId.startsWith('review-request.')
        ? buildStringEnumSchema(REVIEW_REQUEST_PRIORITIES, optional)
        : (optional ? buildNullableStringSchema(true) : buildStringSchema(false))
    case 'outcome':
      return operationId === 'review-request.add-result'
        ? buildStringEnumSchema(REVIEW_REQUEST_OUTCOMES, optional)
        : (optional ? buildNullableStringSchema(true) : buildStringSchema(false))
    case 'source':
      return operationId.startsWith('review-request.')
        ? buildStringEnumSchema(REVIEW_REQUEST_SOURCES, optional)
        : (optional ? buildNullableStringSchema(true) : buildStringSchema(false))
    case 'status':
      return operationId.startsWith('review-request.')
        ? buildStringEnumSchema(REVIEW_REQUEST_STATUSES, optional)
        : (optional ? buildNullableStringSchema(true) : buildStringSchema(false))
    default:
      return optional ? buildNullableStringSchema(true) : buildStringSchema(false)
  }
}

function buildNormalizedContextSchema(): Record<string, z.ZodTypeAny> {
  return {
    projectId: buildNullableStringSchema(true),
    scopeId: buildNullableStringSchema(true),
    tenantId: buildNullableStringSchema(true),
    locale: buildNullableStringSchema(true),
    fallbackLocale: buildNullableStringSchema(true),
    __hostContext: z.record(z.string(), z.unknown()).optional(),
  }
}

function normalizeProjectmanToolInputRecord(
  operationId: string,
  args: ProjectmanOperationArgument[],
  input: unknown,
): ProjectmanToolInputRecord {
  const raw = toRecord(input)
  const allowedRawKeys = getAllowedRawKeys(operationId, args)
  for (const key of Object.keys(raw)) {
    if (!allowedRawKeys.has(key)) {
      throw new Error(`unknown_projectman_input_arg:${operationId}:${key}`)
    }
  }

  const normalized: ProjectmanToolInputRecord = {}

  const projectContextId = resolveProjectContextId(raw)
  if (projectContextId !== undefined) {
    normalized.projectId = projectContextId
    normalized.scopeId = projectContextId
  }

  const tenantId = resolveContextValue(raw, 'tenantId')
  if (tenantId !== undefined) normalized.tenantId = tenantId

  const locale = resolveContextValue(raw, 'locale')
  if (locale !== undefined) normalized.locale = locale

  const fallbackLocale = resolveContextValue(raw, 'fallbackLocale')
  if (fallbackLocale !== undefined) normalized.fallbackLocale = fallbackLocale

  if (isPlainRecord(raw.__hostContext)) {
    normalized.__hostContext = raw.__hostContext
  }

  for (const arg of args) {
    const canonicalName = String(arg.name ?? '').trim()
    if (!canonicalName) continue
    const rawValue = resolveRawArgValue(operationId, raw, canonicalName)
    if (rawValue === undefined) continue
    normalized[canonicalName] = rawValue
  }

  return normalized
}

function buildProjectmanToolInputSchema(row: ProjectmanOperationCatalogRow): ProjectmanToolInputSchema {
  const shape: Record<string, z.ZodTypeAny> = {
    ...buildNormalizedContextSchema(),
  }

  for (const arg of row.args) {
    const canonicalName = String(arg.name ?? '').trim()
    if (!canonicalName) continue
    shape[canonicalName] = buildFieldSchema(row.operationId, arg)
  }

  return z.preprocess(
    (input) => normalizeProjectmanToolInputRecord(row.operationId, [...row.args], input),
    z.object(shape).strict(),
  )
}

function buildProjectmanToolInputRegistry(): Record<ProjectmanTypedOperationId, ProjectmanToolInputSchema> {
  const registry: Partial<Record<ProjectmanTypedOperationId, ProjectmanToolInputSchema>> = {}
  for (const row of PROJECTMAN_OPERATION_CATALOG_ROWS) {
    registry[row.operationId] = buildProjectmanToolInputSchema(row)
  }
  return registry as Record<ProjectmanTypedOperationId, ProjectmanToolInputSchema>
}

export type ProjectmanToolInputRegistryEntry = {
  operationId: ProjectmanTypedOperationId
  schema: ProjectmanToolInputSchema
}

export const PROJECTMAN_TOOL_INPUT_REGISTRY = buildProjectmanToolInputRegistry()

export function getProjectmanToolInputSchema(operationId: ProjectmanTypedOperationId): ProjectmanToolInputSchema {
  const schema = PROJECTMAN_TOOL_INPUT_REGISTRY[operationId]
  if (!schema) {
    throw new Error(`unknown_projectman_operation:${operationId}`)
  }
  return schema
}

export function parseProjectmanToolInput<TId extends ProjectmanTypedOperationId>(
  operationId: TId,
  input: unknown,
): ProjectmanOperationInput<TId> {
  const parsed = getProjectmanToolInputSchema(operationId).parse(input)
  return parsed as ProjectmanOperationInput<TId>
}
