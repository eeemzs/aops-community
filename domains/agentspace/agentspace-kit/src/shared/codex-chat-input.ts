import type { AgentspaceTypedOperationId } from '../operations/io-types.js'
import { hasNonEmptyValue, normalizeNonEmpty, resolveProjectContextValue, toRecord } from './tool-input.js'

type ToolInputRecord = Record<string, unknown>

const CODEX_CHAT_MESSAGE_CREATE_OPERATION_IDS = new Set<AgentspaceTypedOperationId>([
  'codex-chat-message.add-message',
  'codex-chat-message.create',
])

const CODEX_CHAT_MESSAGE_LIST_OPERATION_IDS = new Set<AgentspaceTypedOperationId>([
  'codex-chat-message.list-messages',
])

const CODEX_CHAT_THREAD_LIST_OPERATION_IDS = new Set<AgentspaceTypedOperationId>([
  'codex-chat-thread.list-threads',
])

const CODEX_CHAT_THREAD_CREATE_OPERATION_IDS = new Set<AgentspaceTypedOperationId>([
  'codex-chat-thread.create',
])

const MESSAGE_LIST_LEGACY_FILTER_KEYS = [
  'projectId',
  'scopeId',
  'externalThreadId',
  'threadId',
  'role',
  'turnId',
  'itemId',
] as const

const THREAD_LIST_LEGACY_FILTER_KEYS = [
  'projectId',
  'scopeId',
  'externalThreadId',
  'title',
  'scopeLabel',
  'cwd',
] as const

const LEGACY_OPTION_KEYS = ['limit', 'offset', 'sort'] as const

function normalizeDateLikeMessageAt(value: unknown): string | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined
    return value.toISOString()
  }
  const text = normalizeNonEmpty(value)
  return text
}

function maybeParseInteger(value: unknown): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return value
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return value
  return Math.floor(parsed)
}

function normalizeLegacyListInput(
  input: ToolInputRecord,
  filterKeys: readonly string[],
): ToolInputRecord {
  const source: ToolInputRecord = { ...toRecord(input) }
  const filter: ToolInputRecord = { ...toRecord(source.filter) }
  const options: ToolInputRecord = { ...toRecord(source.options) }

  for (const key of filterKeys) {
    if (filter[key] === undefined && source[key] !== undefined && hasNonEmptyValue(source[key])) {
      filter[key] = source[key]
    }
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      delete source[key]
    }
  }

  for (const key of LEGACY_OPTION_KEYS) {
    if (options[key] === undefined && source[key] !== undefined && hasNonEmptyValue(source[key])) {
      options[key] = key === 'limit' || key === 'offset' ? maybeParseInteger(source[key]) : source[key]
    }
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      delete source[key]
    }
  }

  if (options.sort === undefined) {
    const sortField = normalizeNonEmpty(source.sortField)
    if (sortField) {
      const sortDir = normalizeNonEmpty(source.sortDir)?.toLowerCase() === 'desc' ? 'desc' : 'asc'
      options.sort = [{ field: sortField, type: sortDir }]
    }
  }
  if (Object.prototype.hasOwnProperty.call(source, 'sortField')) delete source.sortField
  if (Object.prototype.hasOwnProperty.call(source, 'sortDir')) delete source.sortDir

  if (!hasNonEmptyValue(filter.projectId)) {
    const projectId = resolveProjectContextValue(source)
    if (projectId) filter.projectId = projectId
  }

  if (Object.keys(filter).length > 0) {
    source.filter = filter
  }
  if (Object.keys(options).length > 0) {
    source.options = options
  }

  return source
}

export function normalizeCodexChatMessageCreateInput(input: ToolInputRecord): ToolInputRecord {
  const source: ToolInputRecord = { ...toRecord(input) }
  const data: ToolInputRecord = { ...toRecord(source.data) }
  if (Object.keys(data).length === 0) return source

  const normalizedMessageAt = normalizeDateLikeMessageAt(data.messageAt)
  data.messageAt = normalizedMessageAt ?? new Date().toISOString()
  source.data = data
  return source
}

export function normalizeCodexChatThreadCreateInput(input: ToolInputRecord): ToolInputRecord {
  const source: ToolInputRecord = { ...toRecord(input) }
  const data: ToolInputRecord = { ...toRecord(source.data) }
  if (Object.keys(data).length === 0) return source

  const scopeId =
    normalizeNonEmpty(data.scopeId) ??
    normalizeNonEmpty(data.projectId) ??
    normalizeNonEmpty(data.projectName) ??
    normalizeNonEmpty(data.project) ??
    resolveProjectContextValue(source)
  if (scopeId) {
    data.scopeId = scopeId
  }
  delete data.projectId
  delete data.projectName
  delete data.project

  source.data = data
  return source
}

export function normalizeAgentspaceOperationInputForCompatibility(
  operationId: AgentspaceTypedOperationId,
  input: ToolInputRecord,
): ToolInputRecord {
  if (CODEX_CHAT_THREAD_CREATE_OPERATION_IDS.has(operationId)) {
    return normalizeCodexChatThreadCreateInput(input)
  }
  if (CODEX_CHAT_MESSAGE_CREATE_OPERATION_IDS.has(operationId)) {
    return normalizeCodexChatMessageCreateInput(input)
  }
  if (CODEX_CHAT_MESSAGE_LIST_OPERATION_IDS.has(operationId)) {
    return normalizeLegacyListInput(input, MESSAGE_LIST_LEGACY_FILTER_KEYS)
  }
  if (CODEX_CHAT_THREAD_LIST_OPERATION_IDS.has(operationId)) {
    return normalizeLegacyListInput(input, THREAD_LIST_LEGACY_FILTER_KEYS)
  }
  return toRecord(input)
}

export function normalizeAgentspaceToolInputForCompatibility(
  toolId: string,
  input: ToolInputRecord,
): ToolInputRecord {
  const normalizedToolId = normalizeNonEmpty(toolId) ?? ''
  const operationId = normalizedToolId.startsWith('agentspace.')
    ? normalizedToolId.slice('agentspace.'.length)
    : normalizedToolId
  if (!operationId) return toRecord(input)
  return normalizeAgentspaceOperationInputForCompatibility(operationId as AgentspaceTypedOperationId, input)
}
