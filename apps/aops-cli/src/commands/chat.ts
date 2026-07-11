import { readFileSync, writeFileSync } from 'node:fs'
import { Command } from 'commander'
import { logError, logSuccess } from '@aopslab/xf-cli-ui'

import { applyCommonOptions, compactPayload, normalizeNonEmpty } from '../utils/command.js'
import {
  invokeHostedToolWithApiState,
  parseJsonInput,
  requireApiState,
  unwrapHostedToolResult,
  type AgentGatewayContextOptions,
} from '../utils/agent-gateway.js'
import {
  preferProjectNameBinding,
  resolveOwnerScopeIdFromBinding,
  resolveOwnerScopeIdFromProjectRecord,
  resolveProjectBindingContext,
} from '../utils/project-context.js'
import {
  buildHostedSugarEnvelope,
  buildOperatorCookbook,
  ensureGuardedWrite,
  missingScopeIdMessage,
} from '../utils/hosted-sugar.js'
import { GUIDE_PATHS } from '../utils/guide-paths.js'
import type { CliApiClientState } from '../utils/api.js'

type ChatContextOptions = AgentGatewayContextOptions & {
  projectName?: string
  scopeId?: string
  scopeResolution?: 'explicit' | 'cascade'
}

type GuardedWriteOptions = {
  preview?: boolean
  apply?: boolean
  confirm?: boolean
  idempotencyKey?: string
}

type JsonSeedOptions = {
  input?: string
}

type HostedWriteOptions = GuardedWriteOptions & {
  timeoutMs?: number
  apiBaseUrl?: string
  accessToken?: string
  refreshToken?: string
  tenantId?: string
  locale?: string
  fallbackLocale?: string
}

type ChatRoomListOptions = ChatContextOptions & {
  slug?: string
  title?: string
  kind?: string
  status?: string
  limit?: string | number
  summary?: boolean
}

type ChatRoomGetOptions = ChatContextOptions & {
  id?: string
}

type ChatRoomCreateOptions = ChatContextOptions &
  JsonSeedOptions &
  HostedWriteOptions & {
    slug?: string
    title?: string
    kind?: string
    purpose?: string
    guidance?: string
    status?: string
    createdBy?: string
    updatedBy?: string
    member?: string[]
    binding?: string[]
  }

type ChatRoomUpdateOptions = ChatContextOptions &
  JsonSeedOptions &
  HostedWriteOptions & {
    id?: string
    title?: string
    purpose?: string
    guidance?: string
    updatedBy?: string
  }

type ChatRoomArchiveOptions = ChatContextOptions &
  HostedWriteOptions & {
    id?: string
    updatedBy?: string
  }

type ChatRoomOpenDmOptions = ChatContextOptions &
  JsonSeedOptions &
  HostedWriteOptions & {
    agent?: string[]
    title?: string
    purpose?: string
    guidance?: string
    role?: string[]
    roles?: string
    createdBy?: string
    updatedBy?: string
  }

type ChatRoomManifestOptions = ChatContextOptions & {
  roomId?: string
  includeMessages?: boolean
  out?: string
  summary?: boolean
}

type ChatRoomBriefOptions = ChatContextOptions & {
  roomId?: string
  for?: string
}

type ChatMemberAddOptions = ChatContextOptions &
  JsonSeedOptions &
  HostedWriteOptions & {
    roomId?: string
    agent?: string
    role?: string
    brief?: string
    status?: string
    lastReadSeq?: string | number
    createdBy?: string
    updatedBy?: string
  }

type ChatMemberUpdateOptions = ChatContextOptions &
  JsonSeedOptions &
  HostedWriteOptions & {
    id?: string
    role?: string
    brief?: string
    status?: string
    lastReadSeq?: string | number
    updatedBy?: string
  }

type ChatMemberRemoveOptions = ChatContextOptions &
  JsonSeedOptions &
  HostedWriteOptions & {
    memberId?: string
    roomId?: string
    agent?: string
    updatedBy?: string
  }

type ChatBindingAddOptions = ChatContextOptions &
  JsonSeedOptions &
  HostedWriteOptions & {
    roomId?: string
    bindingType?: string
    refId?: string
    uri?: string
    title?: string
    note?: string
    createdBy?: string
    updatedBy?: string
  }

type ChatBindingRemoveOptions = ChatContextOptions &
  HostedWriteOptions & {
    id?: string
  }

type ChatMessageSendOptions = ChatContextOptions &
  JsonSeedOptions &
  HostedWriteOptions & {
    roomId?: string
    from?: string
    text?: string
    mention?: string[]
    replyToSeq?: string | number
    createdBy?: string
  }

type ChatMessageListOptions = ChatContextOptions & {
  roomId?: string
  author?: string
  afterSeq?: string | number
  idempotencyKey?: string
  limit?: string | number
  summary?: boolean
}

type ChatCatchupOptions = ChatContextOptions &
  HostedWriteOptions & {
  roomId?: string
  for?: string
  limit?: string | number
  peek?: boolean
  summary?: boolean
}

type ChatInboxOptions = ChatContextOptions & {
  roomId?: string
  for?: string
  limit?: string | number
  summary?: boolean
}

type ChatListenOptions = ChatContextOptions & {
  roomId?: string
  for?: string
  limit?: string | number
  timeoutSec?: string | number
  intervalSec?: string | number
  maxLoops?: string | number
  summary?: boolean
}

type ChatMarkReadOptions = ChatContextOptions &
  HostedWriteOptions & {
    roomId?: string
    agent?: string
    seq?: string | number
    updatedBy?: string
  }

type ResolvedChatContext = Awaited<ReturnType<typeof resolveProjectBindingContext>> & {
  scopeId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function unwrapResultData<T>(result: unknown): T | undefined {
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'data')) {
    return result.data as T
  }
  return result as T
}

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  const normalized = normalizeNonEmpty(value)
  return normalized ? [...previous, normalized] : previous
}

function toInteger(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  const normalized = normalizeNonEmpty(value)
  if (!normalized) throw new Error(`${label} must be an integer.`)
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer.`)
  return parsed
}

function toStringArray(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}

function parseJsonSeed(input: unknown, label = '--input'): Record<string, unknown> {
  const normalized = normalizeNonEmpty(input)
  if (!normalized) return {}
  const parsed = parseJsonInput(normalized, label)
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object or @file.json object.`)
  return parsed
}

function parseJsonObjectInput(input: unknown, label: string): Record<string, unknown> | undefined {
  const normalized = normalizeNonEmpty(input)
  if (!normalized) return undefined
  const parsed = parseJsonInput(normalized, label)
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object or @file.json object.`)
  return parsed
}

function readTextInput(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const trimmed = input.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('@')) {
    const filePath = trimmed.slice(1).trim()
    if (!filePath) throw new Error('Expected a file path after @.')
    return readFileSync(filePath, 'utf8')
  }
  return input
}

function seedSection(seed: Record<string, unknown>, key: 'data' | 'patch' | 'filter'): Record<string, unknown> {
  const nested = seed[key]
  return isRecord(nested) ? nested : seed
}

function resolveStringField(explicit: unknown, seed: Record<string, unknown>, key: string): string | undefined {
  return normalizeNonEmpty(explicit) ?? normalizeNonEmpty(seed[key])
}

function resolveTextField(explicit: unknown, seed: Record<string, unknown>, key: string): string | undefined {
  const explicitValue = readTextInput(explicit)
  if (explicitValue !== undefined) return explicitValue
  return typeof seed[key] === 'string' ? (seed[key] as string) : undefined
}

function resolveIntegerField(explicit: unknown, seed: Record<string, unknown>, key: string, label: string): number | undefined {
  if (explicit !== undefined && explicit !== null && explicit !== '') return toInteger(explicit, label)
  if (seed[key] !== undefined && seed[key] !== null && seed[key] !== '') return toInteger(seed[key], label)
  return undefined
}

function resolveStringArrayField(explicit: unknown, seed: Record<string, unknown>, key: string): string[] | undefined {
  const explicitValues = toStringArray(explicit)
  if (explicitValues.length > 0) return explicitValues
  const seededValues = toStringArray(seed[key])
  return seededValues.length > 0 ? seededValues : undefined
}

function buildGatewayOptions(
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedChatContext,
): AgentGatewayContextOptions {
  return {
    ...options,
    ...preferProjectNameBinding(resolvedContext),
    projectId: normalizeNonEmpty(options.projectId) ?? normalizeNonEmpty(resolvedContext.projectId),
    scopeId: normalizeNonEmpty(options.scopeId) ?? normalizeNonEmpty(resolvedContext.scopeId),
  }
}

async function hydrateProjectContext(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedChatContext,
): Promise<ResolvedChatContext> {
  const projectId = normalizeNonEmpty(resolvedContext.projectId)
  if (!projectId) return resolvedContext
  if (normalizeNonEmpty(options.scopeId)) return resolvedContext

  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    toolId: 'agentspace.project.get-by-id',
    input: { id: projectId },
  })
  const result = unwrapHostedToolResult(payload)
  const project = unwrapResultData<Record<string, unknown>>(result)
  if (!isRecord(project)) return resolvedContext

  return {
    ...resolvedContext,
    scopeId: resolveOwnerScopeIdFromProjectRecord(project, resolvedContext.scopeId),
    projectName: normalizeNonEmpty(project.name) ?? resolvedContext.projectName,
  }
}

async function resolveChatContext(
  options: ChatContextOptions,
  apiState: CliApiClientState,
): Promise<ResolvedChatContext> {
  const resolved = await resolveProjectBindingContext(options, {
    requireProject: false,
  })
  const scopeId = normalizeNonEmpty(options.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  return hydrateProjectContext(apiState, options, {
    ...resolved,
    scopeId,
  })
}

function buildResolvedContextRecord(context: ResolvedChatContext): Record<string, unknown> {
  return compactPayload({
    repoRoot: context.repoRoot,
    configPath: context.configPath,
    configFound: context.configFound,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
  })
}

const buildEnvelope = buildHostedSugarEnvelope

function requireScopeId(context: ResolvedChatContext, seed: Record<string, unknown>, subject: string): string {
  const scopeId = normalizeNonEmpty(context.scopeId) ?? normalizeNonEmpty(seed.scopeId)
  if (!scopeId) throw new Error(missingScopeIdMessage(subject))
  return scopeId
}

function requireField(value: unknown, label: string): string {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) throw new Error(`Provide ${label}.`)
  return normalized
}

function parseMemberSpec(spec: string): Record<string, unknown> {
  const normalized = requireField(spec, '--member')
  if (normalized.startsWith('{') || normalized.startsWith('@')) {
    const parsed = parseJsonObjectInput(normalized, '--member')
    if (!parsed) throw new Error('--member JSON must be an object.')
    return parsed
  }
  const [agentId, roleKey] = normalized.split(':', 2)
  return compactPayload({
    agentId: requireField(agentId, '--member agentId'),
    roleKey: normalizeNonEmpty(roleKey),
  })
}

function parseKeyValueList(input: string): Record<string, string> {
  const result: Record<string, string> = {}
  input.split(',').forEach((part) => {
    const separator = part.indexOf('=')
    if (separator < 1) throw new Error(`Expected key=value in "${part}".`)
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (!key || !value) throw new Error(`Expected non-empty key=value in "${part}".`)
    result[key] = value
  })
  return result
}

function parseBindingSpec(spec: string): Record<string, unknown> {
  const normalized = requireField(spec, '--binding')
  if (normalized.startsWith('{') || normalized.startsWith('@')) {
    const parsed = parseJsonObjectInput(normalized, '--binding')
    if (!parsed) throw new Error('--binding JSON must be an object.')
    return parsed
  }
  return parseKeyValueList(normalized)
}

function parseRoleSpecs(values: string[] = []): Record<string, string> | undefined {
  if (values.length === 0) return undefined
  const roles: Record<string, string> = {}
  values.forEach((entry) => {
    const parsed = parseKeyValueList(entry)
    Object.assign(roles, parsed)
  })
  return roles
}

function mergeObjectArrays(seedValue: unknown, explicitValue: string[] | undefined, parser: (value: string) => Record<string, unknown>): Record<string, unknown>[] | undefined {
  const seeded = Array.isArray(seedValue)
    ? seedValue.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : []
  const explicit = (explicitValue ?? []).map(parser)
  const merged = [...seeded, ...explicit]
  return merged.length > 0 ? merged : undefined
}

function collectChatArtifacts(result: unknown): Record<string, string> | undefined {
  const root = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : {})
  const artifacts: Record<string, string> = {}
  const push = (key: string, value: unknown) => {
    const normalized = normalizeNonEmpty(value)
    if (normalized) artifacts[key] = normalized
  }

  push('roomId', root.roomId)
  if (!artifacts.roomId && (normalizeNonEmpty(root.slug) || normalizeNonEmpty(root.title) || normalizeNonEmpty(root.dmKey))) {
    push('roomId', root.id)
  }
  if (normalizeNonEmpty(root.agentId) && normalizeNonEmpty(root.roomId)) push('memberId', root.id)
  if (normalizeNonEmpty(root.bindingType)) push('bindingId', root.id)
  if (normalizeNonEmpty(root.text) || Number.isInteger(root.seq)) push('messageId', root.id)
  if (Number.isInteger(root.seq)) artifacts.seq = String(root.seq)

  return Object.keys(artifacts).length > 0 ? artifacts : undefined
}

function summarizeText(value: unknown, maxLength = 160): string | undefined {
  const text = normalizeNonEmpty(value)
  if (!text) return undefined
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`
}

function summarizeRoom(value: unknown): unknown {
  if (!isRecord(value)) return value
  return compactPayload({
    id: normalizeNonEmpty(value.id),
    scopeId: normalizeNonEmpty(value.scopeId),
    projectId: normalizeNonEmpty(value.projectId),
    slug: normalizeNonEmpty(value.slug),
    title: normalizeNonEmpty(value.title),
    kind: normalizeNonEmpty(value.kind),
    status: normalizeNonEmpty(value.status),
    purpose: summarizeText(value.purpose),
    lastSeq: value.lastSeq,
    dmKey: normalizeNonEmpty(value.dmKey),
    createdBy: normalizeNonEmpty(value.createdBy),
    updatedBy: normalizeNonEmpty(value.updatedBy),
    createdAt: normalizeNonEmpty(value.createdAt),
    updatedAt: normalizeNonEmpty(value.updatedAt),
    archivedAt: normalizeNonEmpty(value.archivedAt),
  })
}

function summarizeMember(value: unknown): unknown {
  if (!isRecord(value)) return value
  return compactPayload({
    id: normalizeNonEmpty(value.id),
    roomId: normalizeNonEmpty(value.roomId),
    agentId: normalizeNonEmpty(value.agentId),
    roleKey: normalizeNonEmpty(value.roleKey),
    brief: summarizeText(value.brief),
    status: normalizeNonEmpty(value.status),
    lastReadSeq: value.lastReadSeq,
    joinedAt: normalizeNonEmpty(value.joinedAt),
    leftAt: normalizeNonEmpty(value.leftAt),
  })
}

function summarizeBinding(value: unknown): unknown {
  if (!isRecord(value)) return value
  return compactPayload({
    id: normalizeNonEmpty(value.id),
    roomId: normalizeNonEmpty(value.roomId),
    bindingType: normalizeNonEmpty(value.bindingType),
    refId: normalizeNonEmpty(value.refId),
    uri: normalizeNonEmpty(value.uri),
    title: normalizeNonEmpty(value.title),
    note: summarizeText(value.note),
  })
}

function summarizeMessage(value: unknown): unknown {
  if (!isRecord(value)) return value
  return compactPayload({
    id: normalizeNonEmpty(value.id),
    roomId: normalizeNonEmpty(value.roomId),
    seq: value.seq,
    authorAgentId: normalizeNonEmpty(value.authorAgentId),
    kind: normalizeNonEmpty(value.kind),
    text: summarizeText(value.text, 220),
    mentions: Array.isArray(value.mentions) ? value.mentions : undefined,
    replyToSeq: value.replyToSeq,
    idempotencyKey: normalizeNonEmpty(value.idempotencyKey),
    createdAt: normalizeNonEmpty(value.createdAt),
  })
}

function summarizeArrayResult(result: unknown, mapper: (value: unknown) => unknown, mode: string, hint: string): unknown {
  if (Array.isArray(result)) {
    return {
      data: result.map(mapper),
      summary: { mode, count: result.length, fullRecordHint: hint },
    }
  }
  if (isRecord(result) && Array.isArray(result.data)) {
    return {
      ...result,
      data: result.data.map(mapper),
      summary: {
        ...(isRecord(result.summary) ? result.summary : {}),
        mode,
        count: result.data.length,
        fullRecordHint: hint,
      },
    }
  }
  return result
}

function summarizeManifestResult(result: unknown): unknown {
  const manifest = unwrapResultData<Record<string, unknown>>(result)
  if (!isRecord(manifest)) return result
  return compactPayload({
    ...manifest,
    room: summarizeRoom(manifest.room),
    members: Array.isArray(manifest.members) ? manifest.members.map(summarizeMember) : undefined,
    bindings: Array.isArray(manifest.bindings) ? manifest.bindings.map(summarizeBinding) : undefined,
    messages: Array.isArray(manifest.messages) ? manifest.messages.map(summarizeMessage) : undefined,
    summary: {
      mode: 'chat-room-manifest-summary',
      memberCount: Array.isArray(manifest.members) ? manifest.members.length : 0,
      bindingCount: Array.isArray(manifest.bindings) ? manifest.bindings.length : 0,
      messageCount: Array.isArray(manifest.messages) ? manifest.messages.length : undefined,
    },
  })
}

function summarizeCatchupResult(result: unknown): unknown {
  const catchup = unwrapResultData<Record<string, unknown>>(result)
  if (!isRecord(catchup)) return result
  const rooms = Array.isArray(catchup.rooms)
    ? catchup.rooms.map((entry) => isRecord(entry)
      ? compactPayload({
        room: summarizeRoom(entry.room),
        member: summarizeMember(entry.member),
        messages: Array.isArray(entry.messages) ? entry.messages.map(summarizeMessage) : undefined,
        unreadCount: entry.unreadCount,
      })
      : entry)
    : undefined
  return compactPayload({
    ...catchup,
    rooms,
    summary: {
      mode: 'chat-catchup-summary',
      roomCount: rooms?.length ?? 0,
      unreadCount: catchup.unreadCount,
    },
  })
}

function catchupData(result: unknown): Record<string, unknown> | undefined {
  const data = unwrapResultData<Record<string, unknown>>(result)
  return isRecord(data) ? data : undefined
}

function catchupRooms(result: unknown): Record<string, unknown>[] {
  const data = catchupData(result)
  return Array.isArray(data?.rooms)
    ? data.rooms.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : []
}

function maxMessageSeq(messages: unknown): number | undefined {
  if (!Array.isArray(messages)) return undefined
  let max: number | undefined
  for (const message of messages) {
    if (!isRecord(message)) continue
    const seq = typeof message.seq === 'number' ? message.seq : undefined
    if (seq !== undefined && Number.isInteger(seq) && (max === undefined || seq > max)) max = seq
  }
  return max
}

function catchupHasUnread(result: unknown): boolean {
  const data = catchupData(result)
  const unreadCount = typeof data?.unreadCount === 'number' ? data.unreadCount : 0
  if (unreadCount > 0) return true
  return catchupRooms(result).some(catchupRoomHasUnread)
}

function catchupRoomHasUnread(entry: Record<string, unknown>): boolean {
  const unreadCount = typeof entry.unreadCount === 'number' ? entry.unreadCount : 0
  return unreadCount > 0
}

function catchupUnreadCountFromRooms(rooms: Record<string, unknown>[]): number {
  let total = 0
  for (const room of rooms) {
    const unreadCount = typeof room.unreadCount === 'number' ? room.unreadCount : undefined
    if (unreadCount !== undefined && unreadCount > 0) {
      total += unreadCount
    }
  }
  return total
}

function isTerminalCatchupRoom(entry: Record<string, unknown>): boolean {
  const room = isRecord(entry.room) ? entry.room : {}
  const member = isRecord(entry.member) ? entry.member : {}
  return normalizeNonEmpty(room.status) === 'archived' || normalizeNonEmpty(member.status) === 'left'
}

function catchupHasTerminalRoom(result: unknown): boolean {
  return catchupRooms(result).some(isTerminalCatchupRoom)
}

function filterTerminalCatchupRooms(result: unknown): unknown {
  const data = catchupData(result)
  if (!data) return result
  const rooms = catchupRooms(result)
  const activeRooms = rooms.filter((entry) => !isTerminalCatchupRoom(entry))
  if (activeRooms.length === rooms.length) return result
  const filteredData = compactPayload({
    ...data,
    rooms: activeRooms,
    unreadCount: catchupUnreadCountFromRooms(activeRooms),
  })
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'data')) {
    return { ...result, data: filteredData }
  }
  return filteredData
}

function plannedCursorUpdates(result: unknown, agentId: string): Array<{ roomId: string; agentId: string; seq: number }> {
  const updates: Array<{ roomId: string; agentId: string; seq: number }> = []
  for (const entry of catchupRooms(result)) {
    const room = isRecord(entry.room) ? entry.room : {}
    const roomId = normalizeNonEmpty(room.id) ?? normalizeNonEmpty(room.roomId) ?? normalizeNonEmpty(entry.roomId)
    const seq = maxMessageSeq(entry.messages)
    if (!roomId || seq === undefined) continue
    updates.push({ roomId, agentId, seq })
  }
  return updates
}

function buildRoomBriefMarkdown(result: unknown, options: { forAgent?: string } = {}): string {
  const manifest = unwrapResultData<Record<string, unknown>>(result)
  const room = isRecord(manifest?.room) ? manifest.room : {}
  const members = Array.isArray(manifest?.members) ? manifest.members.filter((entry): entry is Record<string, unknown> => isRecord(entry)) : []
  const bindings = Array.isArray(manifest?.bindings) ? manifest.bindings.filter((entry): entry is Record<string, unknown> => isRecord(entry)) : []
  const title = normalizeNonEmpty(room.title) ?? normalizeNonEmpty(room.slug) ?? normalizeNonEmpty(room.id) ?? 'Chat Room'
  const lines: string[] = [
    `# ${title}`,
    '',
    `Room id: ${normalizeNonEmpty(room.id) ?? '(unknown)'}`,
  ]
  const forAgent = normalizeNonEmpty(options.forAgent)
  if (forAgent) lines.push(`Audience: ${forAgent}`)
  const purpose = normalizeNonEmpty(room.purpose)
  if (purpose) lines.push('', '## Purpose', purpose)
  const guidance = normalizeNonEmpty(room.guidanceMarkdown)
  if (guidance) lines.push('', '## Guidance', guidance)

  lines.push('', '## Members')
  if (members.length === 0) {
    lines.push('- (none listed)')
  } else {
    members.forEach((member) => {
      const agentId = normalizeNonEmpty(member.agentId) ?? '(unknown-agent)'
      const role = normalizeNonEmpty(member.roleKey)
      const brief = normalizeNonEmpty(member.brief)
      lines.push(`- ${agentId}${role ? ` (${role})` : ''}${brief ? `: ${brief}` : ''}`)
    })
  }

  lines.push('', '## Bindings')
  if (bindings.length === 0) {
    lines.push('- (none listed)')
  } else {
    bindings.forEach((binding) => {
      const type = normalizeNonEmpty(binding.bindingType) ?? 'binding'
      const titleOrRef = normalizeNonEmpty(binding.title) ?? normalizeNonEmpty(binding.refId) ?? normalizeNonEmpty(binding.uri) ?? '(unlabeled)'
      const uri = normalizeNonEmpty(binding.uri)
      const note = normalizeNonEmpty(binding.note)
      lines.push(`- ${type}: ${titleOrRef}${uri && uri !== titleOrRef ? ` <${uri}>` : ''}${note ? ` - ${note}` : ''}`)
    })
  }

  lines.push('', '## Join Prompt')
  lines.push('Use this room brief as the current shared context. Follow the room guidance, respect the member roles, and reference the bindings before taking action.')
  return `${lines.join('\n')}\n`
}

function buildCatchupInput(options: { roomId?: string; for?: string; limit?: string | number }): Record<string, unknown> {
  return {
    data: compactPayload({
      roomId: normalizeNonEmpty(options.roomId),
      agentId: requireField(options.for, '--for'),
      limit: options.limit !== undefined ? toInteger(options.limit, '--limit') : undefined,
    }),
  }
}

async function invokeChatRaw(
  apiState: CliApiClientState,
  options: ChatContextOptions & Partial<HostedWriteOptions>,
  resolvedContext: ResolvedChatContext,
  params: {
    toolId: string
    input: Record<string, unknown>
    preview?: boolean
    apply?: boolean
    idempotencyKey?: string
  },
): Promise<unknown> {
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    timeoutMs: options.timeoutMs,
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    toolId: params.toolId,
    input: params.input,
    preview: params.preview,
    apply: params.apply,
    idempotencyKey: params.idempotencyKey,
  })
  return unwrapHostedToolResult(payload)
}

async function applyCursorUpdates(
  apiState: CliApiClientState,
  options: ChatContextOptions & Partial<HostedWriteOptions>,
  resolvedContext: ResolvedChatContext,
  updates: Array<{ roomId: string; agentId: string; seq: number }>,
): Promise<unknown[]> {
  const results: unknown[] = []
  for (const update of updates) {
    const idempotencyKey = normalizeNonEmpty(options.idempotencyKey)
      ? `${options.idempotencyKey}:mark-read:${update.roomId}:${update.seq}`
      : undefined
    results.push(await invokeChatRaw(apiState, options, resolvedContext, {
      toolId: 'agentspace.chat.mark-read',
      input: { data: update },
      apply: options.apply,
      idempotencyKey,
    }))
  }
  return results
}

function writeChatEnvelope(params: {
  options: { json?: boolean }
  command: string
  toolId?: string
  resolvedContext: ResolvedChatContext
  input: Record<string, unknown>
  result: unknown
  artifacts?: Record<string, string>
  successText: string
}): void {
  if (params.options.json) {
    console.log(JSON.stringify(buildEnvelope({
      command: params.command,
      toolId: params.toolId,
      surface: 'agentspace-chat-v1',
      resolvedContext: buildResolvedContextRecord(params.resolvedContext),
      input: params.input,
      artifacts: params.artifacts,
      result: params.result,
    }), null, 2))
    return
  }

  logSuccess(params.successText)
  console.log(JSON.stringify(params.result, null, 2))
}

function listenTimeoutMs(value: string | number | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback
  const parsed = toInteger(value, label)
  if (parsed < 0) throw new Error(`${label} must be non-negative.`)
  return parsed
}

function isTerminalListenError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return normalized.includes('not_found') || normalized.includes('record not found')
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function invokeChatTool(
  apiState: CliApiClientState,
  options: ChatContextOptions & Partial<HostedWriteOptions>,
  resolvedContext: ResolvedChatContext,
  params: {
    command: string
    toolId: string
    input: Record<string, unknown>
    successText: string
    write?: boolean
    resultMapper?: (result: unknown) => unknown
    out?: string
  },
): Promise<void> {
  if (params.write) ensureGuardedWrite(options, 'This command mutates hosted chat state.')
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    timeoutMs: options.timeoutMs,
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    toolId: params.toolId,
    input: params.input,
    preview: options.preview,
    apply: options.apply,
    confirm: options.confirm,
    idempotencyKey: options.idempotencyKey,
  })
  const rawResult = unwrapHostedToolResult(payload)
  const result = params.resultMapper ? params.resultMapper(rawResult) : rawResult

  if (params.out) {
    writeFileSync(params.out, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  }

  if (options.json) {
    console.log(JSON.stringify(buildEnvelope({
      command: params.command,
      toolId: params.toolId,
      surface: 'agentspace-chat-v1',
      resolvedContext: buildResolvedContextRecord(resolvedContext),
      input: params.input,
      artifacts: collectChatArtifacts(rawResult),
      result,
    }), null, 2))
    return
  }

  logSuccess(params.successText)
  console.log(JSON.stringify(result, null, 2))
}

async function withChatContext<TOptions extends ChatContextOptions>(
  options: TOptions,
  body: (apiState: CliApiClientState, resolvedContext: ResolvedChatContext) => Promise<void>,
): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveChatContext(options, apiState)
    await body(apiState, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runChatRoomList(options: ChatRoomListOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const input = {
      filter: compactPayload({
        scopeId: normalizeNonEmpty(resolvedContext.scopeId),
        scopeResolution: normalizeNonEmpty(options.scopeResolution),
        projectId: normalizeNonEmpty(options.projectId) ?? normalizeNonEmpty(resolvedContext.projectId),
        slug: normalizeNonEmpty(options.slug),
        title: normalizeNonEmpty(options.title),
        kind: normalizeNonEmpty(options.kind),
        status: normalizeNonEmpty(options.status),
      }),
      options: compactPayload({
        limit: options.limit !== undefined ? toInteger(options.limit, '--limit') : undefined,
      }),
    }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.room.list',
      toolId: 'agentspace.chat-room.list',
      input,
      successText: 'Chat rooms loaded.',
      resultMapper: options.summary
        ? (result) => summarizeArrayResult(result, summarizeRoom, 'chat-room-list-summary', 'Use `aops-cli chat room get --id <room-id> --json` for a full room record.')
        : undefined,
    })
  })
}

export async function runChatRoomGet(options: ChatRoomGetOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const input = { id: requireField(options.id, '--id') }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.room.get',
      toolId: 'agentspace.chat-room.get-by-id',
      input,
      successText: 'Chat room loaded.',
    })
  })
}

export async function runChatRoomCreate(options: ChatRoomCreateOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const seed = seedSection(parseJsonSeed(options.input), 'data')
    const members = mergeObjectArrays(seed.members, options.member, parseMemberSpec)
    const bindings = mergeObjectArrays(seed.bindings, options.binding, parseBindingSpec)
    const createdBy = resolveStringField(options.createdBy, seed, 'createdBy')
    if (!createdBy && (!members || members.length === 0)) {
      throw new Error('Chat room create requires --created-by or at least one --member / input.members entry.')
    }
    const input = {
      data: compactPayload({
        scopeId: requireScopeId(resolvedContext, seed, 'Chat room create'),
        projectId: normalizeNonEmpty(options.projectId) ?? normalizeNonEmpty(resolvedContext.projectId) ?? normalizeNonEmpty(seed.projectId),
        slug: requireField(resolveStringField(options.slug, seed, 'slug'), '--slug'),
        title: requireField(resolveStringField(options.title, seed, 'title'), '--title'),
        kind: resolveStringField(options.kind, seed, 'kind'),
        purpose: resolveStringField(options.purpose, seed, 'purpose'),
        guidanceMarkdown: resolveTextField(options.guidance, seed, 'guidanceMarkdown'),
        status: resolveStringField(options.status, seed, 'status'),
        createdBy,
        updatedBy: resolveStringField(options.updatedBy, seed, 'updatedBy'),
        members,
        bindings,
      }),
    }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.room.create',
      toolId: 'agentspace.chat-room.create',
      input,
      successText: 'Chat room created.',
      write: true,
    })
  })
}

export async function runChatRoomUpdate(options: ChatRoomUpdateOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const rawSeed = parseJsonSeed(options.input)
    const seed = seedSection(rawSeed, 'patch')
    const patch = compactPayload({
      title: resolveStringField(options.title, seed, 'title'),
      purpose: resolveStringField(options.purpose, seed, 'purpose'),
      guidanceMarkdown: resolveTextField(options.guidance, seed, 'guidanceMarkdown'),
      updatedBy: resolveStringField(options.updatedBy, seed, 'updatedBy'),
    })
    if (Object.keys(patch).length === 0) throw new Error('Provide at least one chat room field to update.')
    const input = {
      id: requireField(resolveStringField(options.id, rawSeed, 'id'), '--id'),
      patch,
    }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.room.update',
      toolId: 'agentspace.chat-room.update',
      input,
      successText: 'Chat room updated.',
      write: true,
    })
  })
}

export async function runChatRoomArchive(options: ChatRoomArchiveOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const input = compactPayload({
      id: requireField(options.id, '--id'),
      updatedBy: normalizeNonEmpty(options.updatedBy),
    })
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.room.archive',
      toolId: 'agentspace.chat-room.archive',
      input,
      successText: 'Chat room archived.',
      write: true,
    })
  })
}

export async function runChatRoomOpenDm(options: ChatRoomOpenDmOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const seed = seedSection(parseJsonSeed(options.input), 'data')
    const agentIds = resolveStringArrayField(options.agent, seed, 'agentIds') ?? []
    if (agentIds.length !== 2) throw new Error('Open DM requires exactly two --agent values or input.agentIds entries.')
    const explicitRoles = parseJsonObjectInput(options.roles, '--roles')
    const roles = explicitRoles ?? parseRoleSpecs(options.role) ?? (isRecord(seed.roles) ? seed.roles : undefined)
    const input = {
      data: compactPayload({
        scopeId: requireScopeId(resolvedContext, seed, 'Chat room open-dm'),
        agentIds,
        projectId: normalizeNonEmpty(options.projectId) ?? normalizeNonEmpty(resolvedContext.projectId) ?? normalizeNonEmpty(seed.projectId),
        title: resolveStringField(options.title, seed, 'title'),
        purpose: resolveStringField(options.purpose, seed, 'purpose'),
        guidanceMarkdown: resolveTextField(options.guidance, seed, 'guidanceMarkdown'),
        roles,
        createdBy: resolveStringField(options.createdBy, seed, 'createdBy'),
        updatedBy: resolveStringField(options.updatedBy, seed, 'updatedBy'),
      }),
    }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.room.open-dm',
      toolId: 'agentspace.chat-room.open-dm',
      input,
      successText: 'Chat DM opened.',
      write: true,
    })
  })
}

export async function runChatRoomManifest(options: ChatRoomManifestOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const input = {
      data: compactPayload({
        roomId: requireField(options.roomId, '--room-id'),
        includeMessages: options.includeMessages === true ? true : undefined,
      }),
    }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.room.manifest',
      toolId: 'agentspace.chat-room.export-manifest',
      input,
      successText: options.out ? `Chat room manifest exported to ${options.out}.` : 'Chat room manifest exported.',
      resultMapper: options.summary ? summarizeManifestResult : undefined,
      out: normalizeNonEmpty(options.out),
    })
  })
}

export async function runChatRoomBrief(options: ChatRoomBriefOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const input = {
      data: {
        roomId: requireField(options.roomId, '--room-id'),
      },
    }
    const result = await invokeChatRaw(apiState, options, resolvedContext, {
      toolId: 'agentspace.chat-room.export-manifest',
      input,
    })
    const briefMarkdown = buildRoomBriefMarkdown(result, { forAgent: options.for })
    const output = {
      manifest: summarizeManifestResult(result),
      briefMarkdown,
    }

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'chat.room.brief',
        toolId: 'agentspace.chat-room.export-manifest',
        surface: 'agentspace-chat-v1',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: output,
      }), null, 2))
      return
    }

    console.log(briefMarkdown)
  })
}

export async function runChatMemberAdd(options: ChatMemberAddOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const seed = seedSection(parseJsonSeed(options.input), 'data')
    const input = {
      data: compactPayload({
        scopeId: requireScopeId(resolvedContext, seed, 'Chat member add'),
        roomId: requireField(resolveStringField(options.roomId, seed, 'roomId'), '--room-id'),
        agentId: requireField(resolveStringField(options.agent, seed, 'agentId'), '--agent'),
        roleKey: resolveStringField(options.role, seed, 'roleKey'),
        brief: resolveStringField(options.brief, seed, 'brief'),
        status: resolveStringField(options.status, seed, 'status'),
        lastReadSeq: resolveIntegerField(options.lastReadSeq, seed, 'lastReadSeq', '--last-read-seq'),
        createdBy: resolveStringField(options.createdBy, seed, 'createdBy'),
        updatedBy: resolveStringField(options.updatedBy, seed, 'updatedBy'),
      }),
    }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.member.add',
      toolId: 'agentspace.chat-member.add',
      input,
      successText: 'Chat member added.',
      write: true,
    })
  })
}

export async function runChatMemberUpdate(options: ChatMemberUpdateOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const rawSeed = parseJsonSeed(options.input)
    const seed = seedSection(rawSeed, 'patch')
    const patch = compactPayload({
      roleKey: resolveStringField(options.role, seed, 'roleKey'),
      brief: resolveStringField(options.brief, seed, 'brief'),
      status: resolveStringField(options.status, seed, 'status'),
      lastReadSeq: resolveIntegerField(options.lastReadSeq, seed, 'lastReadSeq', '--last-read-seq'),
      updatedBy: resolveStringField(options.updatedBy, seed, 'updatedBy'),
    })
    if (Object.keys(patch).length === 0) throw new Error('Provide at least one chat member field to update.')
    const input = {
      id: requireField(resolveStringField(options.id, rawSeed, 'id'), '--id'),
      patch,
    }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.member.update',
      toolId: 'agentspace.chat-member.update',
      input,
      successText: 'Chat member updated.',
      write: true,
    })
  })
}

export async function runChatMemberRemove(options: ChatMemberRemoveOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const seed = seedSection(parseJsonSeed(options.input), 'data')
    const memberId = resolveStringField(options.memberId, seed, 'memberId')
    const roomId = resolveStringField(options.roomId, seed, 'roomId')
    const agentId = resolveStringField(options.agent, seed, 'agentId')
    if (!memberId && (!roomId || !agentId)) {
      throw new Error('Chat member remove requires --member-id or both --room-id and --agent.')
    }
    const input = {
      data: compactPayload({
        memberId,
        roomId,
        agentId,
        updatedBy: resolveStringField(options.updatedBy, seed, 'updatedBy'),
      }),
    }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.member.remove',
      toolId: 'agentspace.chat-member.remove',
      input,
      successText: 'Chat member removed.',
      write: true,
    })
  })
}

export async function runChatBindingAdd(options: ChatBindingAddOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const seed = seedSection(parseJsonSeed(options.input), 'data')
    const input = {
      data: compactPayload({
        scopeId: requireScopeId(resolvedContext, seed, 'Chat binding add'),
        roomId: requireField(resolveStringField(options.roomId, seed, 'roomId'), '--room-id'),
        bindingType: requireField(resolveStringField(options.bindingType, seed, 'bindingType'), '--binding-type'),
        refId: resolveStringField(options.refId, seed, 'refId'),
        uri: resolveStringField(options.uri, seed, 'uri'),
        title: resolveStringField(options.title, seed, 'title'),
        note: resolveStringField(options.note, seed, 'note'),
        createdBy: resolveStringField(options.createdBy, seed, 'createdBy'),
        updatedBy: resolveStringField(options.updatedBy, seed, 'updatedBy'),
      }),
    }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.binding.add',
      toolId: 'agentspace.chat-binding.add',
      input,
      successText: 'Chat binding added.',
      write: true,
    })
  })
}

export async function runChatBindingRemove(options: ChatBindingRemoveOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const input = { id: requireField(options.id, '--id') }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.binding.remove',
      toolId: 'agentspace.chat-binding.remove',
      input,
      successText: 'Chat binding removed.',
      write: true,
    })
  })
}

export async function runChatMessageSend(options: ChatMessageSendOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const seed = seedSection(parseJsonSeed(options.input), 'data')
    const input = {
      data: compactPayload({
        scopeId: requireScopeId(resolvedContext, seed, 'Chat message send'),
        roomId: requireField(resolveStringField(options.roomId, seed, 'roomId'), '--room-id'),
        authorAgentId: requireField(resolveStringField(options.from, seed, 'authorAgentId'), '--from'),
        text: requireField(resolveTextField(options.text, seed, 'text'), '--text'),
        mentions: resolveStringArrayField(options.mention, seed, 'mentions'),
        replyToSeq: resolveIntegerField(options.replyToSeq, seed, 'replyToSeq', '--reply-to-seq'),
        idempotencyKey: normalizeNonEmpty(options.idempotencyKey) ?? normalizeNonEmpty(seed.idempotencyKey),
        createdBy: resolveStringField(options.createdBy, seed, 'createdBy'),
      }),
    }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.message.send',
      toolId: 'agentspace.chat-message.send',
      input,
      successText: 'Chat message sent.',
      write: true,
    })
  })
}

export async function runChatMessageList(options: ChatMessageListOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const input = {
      filter: compactPayload({
        roomId: normalizeNonEmpty(options.roomId),
        scopeId: normalizeNonEmpty(resolvedContext.scopeId),
        authorAgentId: normalizeNonEmpty(options.author),
        afterSeq: options.afterSeq !== undefined ? toInteger(options.afterSeq, '--after-seq') : undefined,
        idempotencyKey: normalizeNonEmpty(options.idempotencyKey),
      }),
      options: compactPayload({
        limit: options.limit !== undefined ? toInteger(options.limit, '--limit') : undefined,
      }),
    }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.message.list',
      toolId: 'agentspace.chat-message.list',
      input,
      successText: 'Chat messages loaded.',
      resultMapper: options.summary
        ? (result) => summarizeArrayResult(result, summarizeMessage, 'chat-message-list-summary', 'Use `aops-cli chat message list --room-id <room-id> --json` without --summary for full message records.')
        : undefined,
    })
  })
}

export async function runChatCatchup(options: ChatCatchupOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const input = buildCatchupInput(options)
    const agentId = requireField(options.for, '--for')
    const peek = options.peek === true
    if (!peek && options.apply !== true && options.preview !== true) {
      throw new Error('Chat catchup advances the read cursor by default. Retry with --apply, use --preview, or add --peek for read-only catchup.')
    }
    const rawResult = await invokeChatRaw(apiState, options, resolvedContext, {
      toolId: 'agentspace.chat.catchup',
      input,
    })
    const cursorUpdates = plannedCursorUpdates(rawResult, agentId)
    const cursorResults = !peek && options.apply === true
      ? await applyCursorUpdates(apiState, options, resolvedContext, cursorUpdates)
      : []
    const result = compactPayload({
      catchup: options.summary ? summarizeCatchupResult(rawResult) : rawResult,
      cursor: compactPayload({
        mode: peek ? 'peek' : options.preview ? 'preview' : 'advance',
        planned: cursorUpdates,
        applied: cursorResults.length,
      }),
    })
    writeChatEnvelope({
      options,
      command: 'chat.catchup',
      toolId: 'agentspace.chat.catchup',
      resolvedContext,
      input,
      result,
      successText: peek ? 'Chat catchup loaded without advancing cursors.' : 'Chat catchup loaded and cursors advanced.',
    })
  })
}

export async function runChatInbox(options: ChatInboxOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const input = buildCatchupInput(options)
    const rawResult = await invokeChatRaw(apiState, options, resolvedContext, {
      toolId: 'agentspace.chat.catchup',
      input,
    })
    writeChatEnvelope({
      options,
      command: 'chat.inbox',
      toolId: 'agentspace.chat.catchup',
      resolvedContext,
      input,
      result: options.summary ? summarizeCatchupResult(rawResult) : rawResult,
      successText: 'Chat inbox loaded.',
    })
  })
}

export async function runChatListen(options: ChatListenOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const input = buildCatchupInput(options)
    const roomScoped = Boolean(normalizeNonEmpty(options.roomId))
    const timeoutSec = listenTimeoutMs(options.timeoutSec, 540, '--timeout-sec')
    const intervalSec = listenTimeoutMs(options.intervalSec, 5, '--interval-sec')
    const maxLoops = options.maxLoops !== undefined ? toInteger(options.maxLoops, '--max-loops') : undefined
    const startedAt = Date.now()
    const deadline = startedAt + timeoutSec * 1000
    let loop = 0
    let lastResult: unknown
    let exitCode = 22
    let outcome: 'work-ready' | 'terminal' | 'timeout' = 'timeout'

    while (Date.now() <= deadline) {
      loop += 1
      try {
        lastResult = await invokeChatRaw(apiState, options, resolvedContext, {
          toolId: 'agentspace.chat.catchup',
          input,
        })
        if (!roomScoped) lastResult = filterTerminalCatchupRooms(lastResult)
      } catch (error) {
        if (roomScoped && isTerminalListenError(error)) {
          outcome = 'terminal'
          exitCode = 21
          lastResult = { error: error instanceof Error ? error.message : String(error) }
          break
        }
        throw error
      }

      if (roomScoped && catchupHasTerminalRoom(lastResult)) {
        outcome = 'terminal'
        exitCode = 21
        break
      }
      if (catchupHasUnread(lastResult)) {
        outcome = 'work-ready'
        exitCode = 0
        break
      }
      if (maxLoops !== undefined && loop >= maxLoops) break
      if (Date.now() + intervalSec * 1000 > deadline) break
      await delay(intervalSec * 1000)
    }

    if (exitCode !== 0) process.exitCode = exitCode
    const result = {
      listen: {
        agentId: requireField(options.for, '--for'),
        roomId: normalizeNonEmpty(options.roomId),
        outcome,
        exitCode,
        loop,
        maxLoops,
        timeoutSec,
        intervalSec,
        cursorAdvanced: false,
      },
      catchup: options.summary ? summarizeCatchupResult(lastResult) : lastResult,
    }
    writeChatEnvelope({
      options,
      command: 'chat.listen',
      toolId: 'agentspace.chat.catchup',
      resolvedContext,
      input,
      result,
      successText: exitCode === 0 ? 'Unread chat work is ready.' : exitCode === 21 ? 'Chat room is no longer active for this listener.' : 'Chat listen timed out.',
    })
  })
}

export async function runChatMarkRead(options: ChatMarkReadOptions = {}): Promise<void> {
  await withChatContext(options, async (apiState, resolvedContext) => {
    const input = {
      data: compactPayload({
        roomId: requireField(options.roomId, '--room-id'),
        agentId: requireField(options.agent, '--agent'),
        seq: options.seq !== undefined ? toInteger(options.seq, '--seq') : undefined,
        updatedBy: normalizeNonEmpty(options.updatedBy),
      }),
    }
    await invokeChatTool(apiState, options, resolvedContext, {
      command: 'chat.mark-read',
      toolId: 'agentspace.chat.mark-read',
      input,
      successText: 'Chat read cursor updated.',
      write: true,
    })
  })
}

function applyChatContextOptions(
  cmd: Command,
  params: { withScopeResolution?: boolean } = {},
): Command {
  applyCommonOptions(cmd)
  cmd.option('--project-id <id>', 'Project id used to resolve repo-bound chat ownership')
  cmd.option('--project-name <name>', 'Project name used to resolve repo-bound chat ownership')
  cmd.option('--scope-id <id>', 'Explicit scope id override for chat ownership')
  if (params.withScopeResolution) {
    cmd.option('--scope-resolution <mode>', 'Scope resolution policy: explicit or cascade')
  }
  return cmd
}

function applyWriteGuards(cmd: Command): Command {
  cmd.option('--preview', 'Return a validated preflight summary without executing the tool')
  cmd.option('--apply', 'Execute the hosted write operation')
  cmd.option('--idempotency-key <key>', 'Optional idempotency key for hosted writes')
  return cmd
}

function applyJsonSeedOption(cmd: Command): Command {
  cmd.option('--input <jsonOrFile>', 'Optional command data seed, hosted input envelope, or @file.json')
  return cmd
}

function addSchemaHelp(cmd: Command, toolId: string): Command {
  cmd.addHelpText(
    'after',
    `
Schema:
  aops-cli agent schema --tool ${toolId} --summary --json
`,
  )
  return cmd
}

export function makeChatCommand(): Command {
  const cmd = new Command('chat').description('Hosted Agentspace chat rooms/DMs for agent-to-agent messaging; separate from the now-retired collab chat and the legacy codex-chat bridge tools')

  const room = cmd.command('room').description('Chat room lifecycle, DM, and manifest commands')
  applyChatContextOptions(
    room.command('list')
      .description('List chat rooms')
      .option('--slug <slug>', 'Room slug filter')
      .option('--title <text>', 'Room title filter')
      .option('--kind <kind>', 'Room kind filter')
      .option('--status <status>', 'Room status filter')
      .option('--limit <n>', 'Optional item limit')
      .option('--summary', 'Print compact room records'),
    { withScopeResolution: true },
  ).action(async (options: ChatRoomListOptions) => {
    await runChatRoomList(options)
  })

  applyChatContextOptions(
    room.command('get')
      .description('Get a chat room by id')
      .requiredOption('--id <id>', 'Room id'),
  ).action(async (options: ChatRoomGetOptions) => {
    await runChatRoomGet(options)
  })

  addSchemaHelp(applyWriteGuards(applyJsonSeedOption(applyChatContextOptions(
    room.command('create')
      .description('Create a group chat room')
      .option('--slug <slug>', 'Room slug')
      .option('--title <text>', 'Room title')
      .option('--kind <kind>', 'Room kind; v1 expects group')
      .option('--purpose <text>', 'Room purpose')
      .option('--guidance <textOrFile>', 'Room guidance markdown or @file.md')
      .option('--status <status>', 'Room status')
      .option('--created-by <agent>', 'Creator agent id; auto-added as roleKey creator when absent from members')
      .option('--updated-by <agent>', 'Updater agent id')
      .option('--member <agent[:role]|json>', 'Initial member; repeatable', collectRepeatedOption, [])
      .option('--binding <key=value,...|json>', 'Initial binding; repeatable. Complex bindings may be passed through --input.', collectRepeatedOption, []),
  ))), 'agentspace.chat-room.create').action(async (options: ChatRoomCreateOptions) => {
    await runChatRoomCreate(options)
  })

  addSchemaHelp(applyWriteGuards(applyJsonSeedOption(applyChatContextOptions(
    room.command('update')
      .description('Update mutable chat room fields')
      .option('--id <id>', 'Room id')
      .option('--title <text>', 'Room title')
      .option('--purpose <text>', 'Room purpose')
      .option('--guidance <textOrFile>', 'Room guidance markdown or @file.md')
      .option('--updated-by <agent>', 'Updater agent id'),
  ))), 'agentspace.chat-room.update').action(async (options: ChatRoomUpdateOptions) => {
    await runChatRoomUpdate(options)
  })

  addSchemaHelp(applyWriteGuards(applyChatContextOptions(
    room.command('archive')
      .description('Archive a chat room')
      .requiredOption('--id <id>', 'Room id')
      .option('--updated-by <agent>', 'Updater agent id'),
  )), 'agentspace.chat-room.archive').action(async (options: ChatRoomArchiveOptions) => {
    await runChatRoomArchive(options)
  })

  addSchemaHelp(applyWriteGuards(applyJsonSeedOption(applyChatContextOptions(
    room.command('open-dm')
      .alias('dm')
      .description('Open or create a deterministic direct-message room for two agents')
      .option('--agent <agent>', 'DM participant; repeat exactly twice', collectRepeatedOption, [])
      .option('--title <text>', 'Room title')
      .option('--purpose <text>', 'Room purpose')
      .option('--guidance <textOrFile>', 'Room guidance markdown or @file.md')
      .option('--role <agent=role>', 'Participant role mapping; repeatable')
      .option('--roles <jsonOrFile>', 'JSON role mapping object or @file.json')
      .option('--created-by <agent>', 'Creator agent id')
      .option('--updated-by <agent>', 'Updater agent id'),
  ))), 'agentspace.chat-room.open-dm').action(async (options: ChatRoomOpenDmOptions) => {
    await runChatRoomOpenDm(options)
  })

  applyChatContextOptions(
    room.command('manifest')
      .alias('export-manifest')
      .description('Export a room manifest as JSON')
      .requiredOption('--room-id <id>', 'Room id')
      .option('--include-messages', 'Include room messages in the manifest')
      .option('--out <path>', 'Write manifest result JSON to a file')
      .option('--summary', 'Print compact manifest records'),
  ).action(async (options: ChatRoomManifestOptions) => {
    await runChatRoomManifest(options)
  })

  applyChatContextOptions(
    room.command('brief')
      .description('Render a paste-ready onboarding brief from the room manifest')
      .requiredOption('--room-id <id>', 'Room id')
      .option('--for <agent>', 'Agent id the brief is being prepared for'),
  ).action(async (options: ChatRoomBriefOptions) => {
    await runChatRoomBrief(options)
  })

  const member = cmd.command('member').description('Chat room member commands')
  addSchemaHelp(applyWriteGuards(applyJsonSeedOption(applyChatContextOptions(
    member.command('add')
      .description('Add or reactivate a room member')
      .option('--room-id <id>', 'Room id')
      .option('--agent <agent>', 'Agent id')
      .option('--role <role>', 'Member roleKey')
      .option('--brief <text>', 'Member brief')
      .option('--status <status>', 'Member status')
      .option('--last-read-seq <seq>', 'Initial read cursor')
      .option('--created-by <agent>', 'Creator agent id')
      .option('--updated-by <agent>', 'Updater agent id'),
  ))), 'agentspace.chat-member.add').action(async (options: ChatMemberAddOptions) => {
    await runChatMemberAdd(options)
  })

  addSchemaHelp(applyWriteGuards(applyJsonSeedOption(applyChatContextOptions(
    member.command('update')
      .description('Update room member fields')
      .option('--id <id>', 'Member id')
      .option('--role <role>', 'Member roleKey')
      .option('--brief <text>', 'Member brief')
      .option('--status <status>', 'Member status')
      .option('--last-read-seq <seq>', 'Read cursor')
      .option('--updated-by <agent>', 'Updater agent id'),
  ))), 'agentspace.chat-member.update').action(async (options: ChatMemberUpdateOptions) => {
    await runChatMemberUpdate(options)
  })

  addSchemaHelp(applyWriteGuards(applyJsonSeedOption(applyChatContextOptions(
    member.command('remove')
      .description('Mark a room member as left')
      .option('--member-id <id>', 'Member id')
      .option('--room-id <id>', 'Room id; use with --agent when --member-id is omitted')
      .option('--agent <agent>', 'Agent id; use with --room-id when --member-id is omitted')
      .option('--updated-by <agent>', 'Updater agent id'),
  ))), 'agentspace.chat-member.remove').action(async (options: ChatMemberRemoveOptions) => {
    await runChatMemberRemove(options)
  })

  const binding = cmd.command('binding').description('Chat room reference binding commands')
  addSchemaHelp(applyWriteGuards(applyJsonSeedOption(applyChatContextOptions(
    binding.command('add')
      .description('Add a reference binding to a room')
      .option('--room-id <id>', 'Room id')
      .option('--binding-type <type>', 'Binding type, such as projectman.kanban-task, repo.url, docman.document, skill, or agents.md')
      .option('--ref-id <id>', 'Bound reference id')
      .option('--uri <uri>', 'Bound reference URI')
      .option('--title <text>', 'Binding title')
      .option('--note <text>', 'Binding note')
      .option('--created-by <agent>', 'Creator agent id')
      .option('--updated-by <agent>', 'Updater agent id'),
  ))), 'agentspace.chat-binding.add').action(async (options: ChatBindingAddOptions) => {
    await runChatBindingAdd(options)
  })

  addSchemaHelp(applyWriteGuards(applyChatContextOptions(
    binding.command('remove')
      .description('Remove a reference binding from a room')
      .requiredOption('--id <id>', 'Binding id'),
  )), 'agentspace.chat-binding.remove').action(async (options: ChatBindingRemoveOptions) => {
    await runChatBindingRemove(options)
  })

  const message = cmd.command('message').description('Chat message commands')
  addSchemaHelp(applyWriteGuards(applyJsonSeedOption(applyChatContextOptions(
    message.command('send')
      .description('Send an append-only message to a room')
      .option('--room-id <id>', 'Room id')
      .option('--from <agent>', 'Author agent id')
      .option('--text <textOrFile>', 'Message text or @file.md')
      .option('--mention <agent>', 'Mentioned agent id; repeatable', collectRepeatedOption, [])
      .option('--reply-to-seq <seq>', 'Reply target message sequence')
      .option('--created-by <agent>', 'Creator agent id'),
  ))), 'agentspace.chat-message.send').action(async (options: ChatMessageSendOptions) => {
    await runChatMessageSend(options)
  })

  applyChatContextOptions(
    message.command('list')
      .description('List room messages')
      .option('--room-id <id>', 'Room id filter')
      .option('--author <agent>', 'Author agent id filter')
      .option('--after-seq <seq>', 'Only return messages after this sequence')
      .option('--idempotency-key <key>', 'Message idempotency key filter')
      .option('--limit <n>', 'Optional item limit')
      .option('--summary', 'Print compact message records'),
  ).action(async (options: ChatMessageListOptions) => {
    await runChatMessageList(options)
  })

  applyChatContextOptions(
    cmd.command('catchup')
      .description('Read unread messages and advance the read cursor by default')
      .requiredOption('--for <agent>', 'Agent id')
      .option('--room-id <id>', 'Optional room id')
      .option('--limit <n>', 'Optional per-room message limit')
      .option('--peek', 'Read without advancing the cursor')
      .option('--summary', 'Print compact catchup records'),
  )
    .option('--preview', 'Plan cursor advancement without writing read cursors')
    .option('--apply', 'Advance read cursors after reading unread messages')
    .option('--idempotency-key <key>', 'Optional idempotency key prefix for cursor updates')
    .action(async (options: ChatCatchupOptions) => {
    await runChatCatchup(options)
  })

  applyChatContextOptions(
    cmd.command('inbox')
      .description('Peek unread messages without advancing read cursors')
      .requiredOption('--for <agent>', 'Agent id')
      .option('--room-id <id>', 'Optional room id')
      .option('--limit <n>', 'Optional per-room message limit')
      .option('--summary', 'Print compact inbox records'),
  ).action(async (options: ChatInboxOptions) => {
    await runChatInbox(options)
  })

  applyChatContextOptions(
    cmd.command('listen')
      .description('Poll for unread chat without advancing read cursors; exits 0 unread, 21 room-scoped terminal, 22 timeout')
      .requiredOption('--for <agent>', 'Agent id')
      .option('--room-id <id>', 'Optional room id')
      .option('--limit <n>', 'Optional per-room message limit')
      .option('--timeout-sec <sec>', 'Maximum wait seconds', '540')
      .option('--interval-sec <sec>', 'Polling interval seconds', '5')
      .option('--max-loops <n>', 'Optional maximum poll loops')
      .option('--summary', 'Print compact catchup records'),
  ).action(async (options: ChatListenOptions) => {
    await runChatListen(options)
  })

  addSchemaHelp(applyWriteGuards(applyChatContextOptions(
    cmd.command('mark-read')
      .description('Advance an agent read cursor in a room')
      .requiredOption('--room-id <id>', 'Room id')
      .requiredOption('--agent <agent>', 'Agent id')
      .option('--seq <seq>', 'Read cursor sequence; omit to mark through current room lastSeq')
      .option('--updated-by <agent>', 'Updater agent id'),
  )), 'agentspace.chat.mark-read').action(async (options: ChatMarkReadOptions) => {
    await runChatMarkRead(options)
  })

  cmd.addHelpText(
    'after',
    buildOperatorCookbook({
      examples: [
        'aops-cli chat room create --slug design-room --title "Design Room" --created-by codex --apply --json',
        'aops-cli chat room open-dm --agent codex --agent claude --created-by codex --apply --json',
        'aops-cli chat message send --room-id <room-id> --from codex --text "Ready for review." --apply --json',
        'aops-cli chat inbox --for claude --summary --json',
        'aops-cli chat listen --for claude --timeout-sec 60 --interval-sec 5 --json',
        'aops-cli chat catchup --for claude --apply --summary --json',
        'aops-cli chat mark-read --room-id <room-id> --agent claude --seq <seq> --apply --json',
        'aops-cli chat room brief --room-id <room-id> --for claude',
        'aops-cli chat room manifest --room-id <room-id> --include-messages --out ./chat-manifest.json --json',
      ],
      guide: GUIDE_PATHS.agentspace,
      notes: [
        'Disambiguation: `aops-cli chat` wraps the new hosted `agentspace.chat-*` room/DM tools. It is not the now-retired `aops-cli collab chat`, and it is not the legacy `agentspace.codex-chat-*` Codex SDK app bridge.',
        '`chat inbox` and `chat listen` never advance read cursors. `chat catchup` advances by default through `agentspace.chat.mark-read`; add --peek for a read-only catchup.',
        'Agent-wide `chat listen` ignores archived/left rooms; exit 21 is reserved for --room-id listen when that room is archived or membership ended.',
        'Listener exit codes: 0 unread found, 21 room-scoped terminal, 22 timeout.',
        'Writes are thin hosted-tool invokes; run `aops-cli agent schema --tool agentspace.chat-message.send --summary --json` before authoring raw --input payloads.',
        'Use `--summary` on list/catchup/manifest reads for compact agent-facing output.',
      ],
    }),
  )

  return cmd
}
