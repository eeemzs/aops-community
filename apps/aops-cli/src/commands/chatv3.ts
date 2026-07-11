import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { logSuccess } from '@aopslab/xf-cli-ui'
import {
  Chatv3Client,
  deriveKek,
  importEpochKey,
  MemoryKeyStore,
  parseInvite,
  unwrapEpochKey,
  type Channel,
  type ChannelEncryptionMode,
  type ChannelMineRow,
  type Room,
  type ServerEpochKeyRow,
} from '@aopslab/domain-product-client-chatv3'

import { resolveCliApiBaseUrl } from '../utils/api.js'
import { applyCommonOptions, compactPayload, normalizeNonEmpty, type CommonOptions } from '../utils/command.js'
import { buildOperatorCookbook } from '../utils/hosted-sugar.js'
import {
  deleteChatv3Session,
  getChatv3SessionRecord,
  listChatv3SessionRecords,
  loadChatv3Session,
  resolveChatv3SessionStorePath,
  saveChatv3Session,
  summarizeChatv3Session,
  type Chatv3LoadedSession,
  type Chatv3SessionEpochKey,
  type Chatv3SessionPlainInput,
  type Chatv3SessionRoom,
} from '../utils/chatv3-session-store.js'

type Chatv3CommonOptions = CommonOptions & {
  storePath?: string
}

type Chatv3JoinOptions = Chatv3CommonOptions & {
  handle?: string
  session?: string
  saveSession?: boolean
  force?: boolean
}

type Chatv3ChannelCreateOptions = Chatv3CommonOptions & {
  title?: string
  slug?: string
  space?: string
  mode?: ChannelEncryptionMode
  handle?: string
  session?: string
  saveSession?: boolean
  force?: boolean
}

type Chatv3ChannelDeleteOptions = Chatv3CommonOptions & {
  session?: string
  channel?: string
  confirmSlug?: string
}

type Chatv3ChannelPurgeBeforeOptions = Chatv3CommonOptions & {
  before?: string
  confirm?: boolean
}

type Chatv3ChannelsOptions = Chatv3CommonOptions & {
  space?: string
  status?: 'active' | 'archived'
}

type Chatv3SendOptions = Chatv3CommonOptions & {
  session?: string
  room?: string
  text?: string
  kind?: string
  markDelivered?: boolean
  markRead?: boolean
}

type Chatv3ReadOptions = Chatv3CommonOptions & {
  session?: string
  room?: string
  afterSeq?: string | number
  limit?: string | number
  markDelivered?: boolean
  markRead?: boolean
}

type Chatv3ListenOptions = Chatv3ReadOptions & {
  timeoutSec?: string | number
  intervalSec?: string | number
}

type Chatv3MemberListOptions = Chatv3CommonOptions & {
  session?: string
  status?: 'active' | 'removed'
  limit?: string | number
}

type Chatv3MemberRemoveOptions = Chatv3CommonOptions & {
  session?: string
  channel?: string
  member?: string
}

type Chatv3PresenceListOptions = Chatv3CommonOptions & {
  session?: string
  room?: string
}

type Chatv3PresenceSetOptions = Chatv3PresenceListOptions & {
  state?: 'active' | 'idle' | 'working' | 'reviewing' | 'blocked' | 'offline'
  note?: string
  ttlSec?: string | number
}

type Chatv3BindingAddOptions = Chatv3CommonOptions & {
  session?: string
  room?: string
  channelOnly?: boolean
  bindingType?: string
  refId?: string
  uri?: string
  title?: string
  note?: string
}

type Chatv3BindingListOptions = Chatv3CommonOptions & {
  session?: string
  room?: string
  allRooms?: boolean
}

type Chatv3BindingRemoveOptions = Chatv3CommonOptions & {
  session?: string
  id?: string
}

type Chatv3RoomBriefOptions = Chatv3CommonOptions & {
  session?: string
  room?: string
  for?: string
  afterSeq?: string | number
}

type Chatv3RoomSummaryOptions = Chatv3RoomBriefOptions & {
  latestSeq?: string | number
}

type Chatv3LeaveOptions = Chatv3CommonOptions & {
  session?: string
  keepSession?: boolean
}

type Chatv3SessionListOptions = Chatv3CommonOptions

type Chatv3SessionGetOptions = Chatv3CommonOptions & {
  session?: string
}

type Chatv3SessionForgetOptions = Chatv3CommonOptions & {
  session?: string
}

type EpochRow = {
  roomId: string
  epoch: number
  wrappedKeyBlob: string
}

type LoadedRuntime = Chatv3LoadedSession & {
  client: Chatv3Client
  keyStore: MemoryKeyStore
  channel: Channel
  rooms: Room[]
  storePath: string
}

type Chatv3Binding = {
  id: string
  tenantId?: string
  channelId: string
  roomId?: string | null
  bindingType: string
  refId?: string | null
  uri?: string | null
  title?: string | null
  note?: string | null
  createdBy?: string | null
  createdAt?: string | null
}

type Chatv3TextMessage = Awaited<ReturnType<Chatv3Client['readText']>>[number]

const AGENT_BOOTSTRAP_STEPS = [
  'Read channel and active-room rules before acting.',
  'Use chat for coordination and wake; use PM for task/review truth.',
  'If PM/RR/doc/discuss refs are present, read those canonical records before changing code.',
  'Send a short ACK/status message after joining or consuming a directive.',
  'Mark delivered/read after reading messages so other members see cursor progress.',
  'Do not paste secrets, member tokens, or invite fragments into chat messages.',
]

const SUMMARY_SOURCE_MESSAGE_POLICY = 'For summarization only; DO NOT persist verbatim to memory.'
const DEFAULT_CHATV3_SPACE_SLUG = 'default'
const DEFAULT_CHATV3_CHANNEL_MODE: ChannelEncryptionMode = 'server-encrypted'
const CHATV3_INVITE_SECRET_WARNING = 'Invite contains secrets; share securely and do not paste it into public logs.'

const CHATV3_COMMAND_TREE: Record<string, Set<string> | null> = {
  channel: new Set(['create', 'delete', 'purge-before']),
  channels: null,
  join: null,
  send: null,
  read: null,
  listen: null,
  leave: null,
  binding: new Set(['add', 'list', 'remove']),
  member: new Set(['list', 'remove']),
  presence: new Set(['list', 'set']),
  room: new Set(['brief', 'summary']),
  session: new Set(['list', 'get', 'forget']),
  help: null,
}

function toInteger(value: unknown, label: string): number {
  if (value === undefined) return 0
  if (typeof value === 'number' && Number.isInteger(value)) return value
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return 0
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative integer.`)
  return parsed
}

function toPositiveInteger(value: unknown, label: string, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = toInteger(value, label)
  if (parsed <= 0) throw new Error(`${label} must be a positive integer.`)
  return parsed
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function guardChatv3UnknownSubcommand(argv: string[]): void {
  const index = argv.indexOf('chatv3')
  if (index < 0) return
  const top = argv[index + 1]
  if (!top || top.startsWith('-')) return
  const nested = CHATV3_COMMAND_TREE[top]
  if (nested === undefined) {
    throw new Error(`unknown chatv3 command '${top}'. Run aops-cli chatv3 --help.`)
  }
  if (nested === null) return
  const child = argv[index + 2]
  if (!child || child.startsWith('-')) return
  if (child === 'help') return
  if (!nested.has(child)) {
    throw new Error(`unknown chatv3 ${top} command '${child}'. Run aops-cli chatv3 ${top} --help.`)
  }
}

function readTextInput(value: unknown, label: string): string {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) throw new Error(`Provide ${label}.`)
  if (normalized.startsWith('@')) return readFileSync(normalized.slice(1).trim(), 'utf8')
  return normalized
}

function requireField(value: unknown, label: string): string {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) throw new Error(`Provide ${label}.`)
  return normalized
}

function resolveChatv3ServerBaseUrl(options: Chatv3CommonOptions): string {
  return resolveCliApiBaseUrl(options.apiBaseUrl)
}

function normalizeChatv3Slug(value: unknown, label: string): string {
  const slug = requireField(value, label)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`${label} must be lowercase kebab-case: /^[a-z0-9][a-z0-9-]*$/.`)
  }
  return slug
}

function slugifyChatv3Slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function resolveChannelSlug(title: string, explicitSlug?: string): string {
  if (explicitSlug !== undefined) return normalizeChatv3Slug(explicitSlug, '--slug <slug>')
  const slug = slugifyChatv3Slug(title)
  if (!slug) throw new Error('Provide --slug <slug>; the title cannot be converted to a lowercase kebab-case slug.')
  return slug
}

function resolveSpaceSlug(value: unknown): string {
  return normalizeNonEmpty(value) ? normalizeChatv3Slug(value, '--space <slug>') : DEFAULT_CHATV3_SPACE_SLUG
}

function normalizeChannelMode(value: unknown): ChannelEncryptionMode {
  const mode = normalizeNonEmpty(value) ?? DEFAULT_CHATV3_CHANNEL_MODE
  if (mode !== 'server-encrypted' && mode !== 'e2e') {
    throw new Error('--mode must be one of: server-encrypted, e2e.')
  }
  return mode
}

function normalizeChannelStatus(value: unknown): 'active' | 'archived' | undefined {
  const status = normalizeNonEmpty(value)
  if (!status) return undefined
  if (status !== 'active' && status !== 'archived') {
    throw new Error('--status must be one of: active, archived.')
  }
  return status
}

function looksUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function normalizeIsoDateTime(value: unknown, label: string): string {
  const raw = requireField(value, label)
  if (Number.isNaN(Date.parse(raw))) throw new Error(`${label} must be an ISO date/time.`)
  return raw
}

function slugifySessionId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'chatv3-session'
}

function sessionIdFor(handle: string, channelId: string, explicit?: string): string {
  return slugifySessionId(normalizeNonEmpty(explicit) ?? `${handle}-${channelId.slice(0, 8)}`)
}

function roomToSessionRoom(room: Room | Chatv3SessionRoom): Chatv3SessionRoom {
  return {
    id: room.id,
    slug: room.slug,
    title: room.title,
    currentEpoch: room.currentEpoch,
    purpose: 'purpose' in room ? room.purpose : undefined,
    guidanceMarkdown: 'guidanceMarkdown' in room ? room.guidanceMarkdown : undefined,
    status: 'status' in room ? room.status : undefined,
  }
}

function normalizePurpose(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function buildAgentGuidance(params: {
  channel: Pick<Channel, 'id' | 'slug' | 'title' | 'purpose' | 'guidanceMarkdown'>
  rooms: (Room | Chatv3SessionRoom)[]
}): Record<string, unknown> {
  return compactPayload({
    sourceField: 'guidanceMarkdown',
    channel: compactPayload({
      id: params.channel.id,
      slug: params.channel.slug,
      title: params.channel.title,
      purpose: normalizePurpose(params.channel.purpose),
      rules: normalizePurpose(params.channel.guidanceMarkdown),
    }),
    rooms: params.rooms.map((room) => compactPayload({
      id: room.id,
      slug: room.slug,
      title: room.title,
      purpose: 'purpose' in room ? normalizePurpose(room.purpose) : null,
      rules: 'guidanceMarkdown' in room ? normalizePurpose(room.guidanceMarkdown) : null,
    })),
    bootstrap: AGENT_BOOTSTRAP_STEPS,
  })
}

function summarizeChatv3Binding(binding: Chatv3Binding): Record<string, unknown> {
  return compactPayload({
    id: binding.id,
    channelId: binding.channelId,
    roomId: binding.roomId ?? undefined,
    bindingType: binding.bindingType,
    refId: binding.refId ?? undefined,
    uri: binding.uri ?? undefined,
    title: binding.title ?? undefined,
    note: binding.note ?? undefined,
    createdBy: binding.createdBy ?? undefined,
    createdAt: binding.createdAt ?? undefined,
  })
}

function bindingLabel(binding: Chatv3Binding): string {
  return normalizeNonEmpty(binding.title)
    ?? normalizeNonEmpty(binding.refId)
    ?? normalizeNonEmpty(binding.uri)
    ?? binding.id
}

function buildRecommendedNextReads(bindings: Chatv3Binding[]): Record<string, unknown>[] {
  return bindings.map((binding, index) => compactPayload({
    index: index + 1,
    type: binding.bindingType,
    refId: binding.refId ?? undefined,
    uri: binding.uri ?? undefined,
    title: binding.title ?? undefined,
    note: binding.note ?? undefined,
  }))
}

function senderHandleForMessage(
  message: Chatv3TextMessage,
  members: Awaited<ReturnType<Chatv3Client['listMembers']>>,
): string | undefined {
  const raw = message as Record<string, unknown>
  const senderMemberId = normalizeNonEmpty(raw.senderMemberId)
  if (!senderMemberId) return undefined
  return members.find((member) => member.id === senderMemberId)?.handle
}

function oneLine(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

function summarizeRoomSourceMessages(
  messages: Chatv3TextMessage[],
  members: Awaited<ReturnType<Chatv3Client['listMembers']>>,
): Record<string, unknown>[] {
  return messages.map((message) => {
    const raw = message as Record<string, unknown>
    return compactPayload({
      seq: message.seq,
      createdAt: normalizeNonEmpty(raw.createdAt),
      kind: normalizeNonEmpty(raw.kind),
      senderMemberId: normalizeNonEmpty(raw.senderMemberId),
      senderHandle: senderHandleForMessage(message, members),
      text: oneLine(raw.text),
      policy: SUMMARY_SOURCE_MESSAGE_POLICY,
    })
  })
}

function seqRangeForRoom(room: Room, afterSeq: number, explicitLatestSeq?: number): Record<string, unknown> {
  const latestSeq = explicitLatestSeq ?? room.lastSeq ?? afterSeq
  return {
    afterSeq,
    latestSeq,
    nextAfterSeq: latestSeq,
    messageCountEstimate: Math.max(0, latestSeq - afterSeq),
  }
}

function buildRoomContextMarkdown(params: {
  title: string
  runtime: LoadedRuntime
  room: Room
  forAgent?: string
  seqRange: Record<string, unknown>
  members: Awaited<ReturnType<Chatv3Client['listMembers']>>
  presence: Awaited<ReturnType<Chatv3Client['listPresence']>>
  receipts: Awaited<ReturnType<Chatv3Client['getReceipts']>>
  bindings: Chatv3Binding[]
  sourceMessages?: Record<string, unknown>[]
  summaryMode?: boolean
}): string {
  const lines: string[] = [
    `# ${params.title}`,
    '',
    `Channel: ${params.runtime.channel.title || params.runtime.channel.slug} (${params.runtime.channel.slug})`,
    `Room: ${params.room.title || params.room.slug} (${params.room.slug})`,
    `Room id: ${params.room.id}`,
    `Seq range: after ${params.seqRange.afterSeq ?? 0}, latest ${params.seqRange.latestSeq ?? 0}`,
  ]
  if (params.forAgent) lines.push(`Audience: ${params.forAgent}`)

  const channelGuidance = normalizeNonEmpty(params.runtime.channel.guidanceMarkdown)
  const roomGuidance = normalizeNonEmpty(params.room.guidanceMarkdown)
  if (!params.summaryMode && (channelGuidance || roomGuidance)) {
    lines.push('', '## Guidance')
    if (channelGuidance) lines.push(channelGuidance)
    if (roomGuidance && roomGuidance !== channelGuidance) lines.push(roomGuidance)
  }

  lines.push('', '## Members')
  if (params.members.length === 0) {
    lines.push('- (none listed)')
  } else {
    params.members.forEach((member) => {
      lines.push(`- ${member.handle} (${member.roleKey}, ${member.status})`)
    })
  }

  lines.push('', '## Presence')
  if (params.presence.length === 0) {
    lines.push('- (none listed)')
  } else {
    params.presence.forEach((entry) => {
      const member = params.members.find((candidate) => candidate.id === entry.memberId)
      const handle = member?.handle ?? entry.memberId
      const note = normalizeNonEmpty(entry.note)
      lines.push(`- ${handle}: ${entry.state}${entry.expired ? ' expired' : ''}${note ? ` - ${note}` : ''}`)
    })
  }

  lines.push('', '## Bindings')
  if (params.bindings.length === 0) {
    lines.push('- (none listed)')
  } else {
    params.bindings.forEach((binding) => {
      const label = bindingLabel(binding)
      const uri = normalizeNonEmpty(binding.uri)
      const note = normalizeNonEmpty(binding.note)
      lines.push(`- ${binding.bindingType}: ${label}${uri && uri !== label ? ` <${uri}>` : ''}${note ? ` - ${note}` : ''}`)
    })
  }

  lines.push('', '## Cursors')
  if (params.receipts.length === 0) {
    lines.push('- (none listed)')
  } else {
    params.receipts.forEach((receipt) => {
      lines.push(`- ${receipt.handle}: read ${receipt.lastReadSeq}, delivered ${receipt.deliveredSeq}, ack ${receipt.ackSeq}`)
    })
  }

  lines.push('', '## Recommended Next Reads')
  const nextReads = buildRecommendedNextReads(params.bindings)
  if (nextReads.length === 0) {
    lines.push('- (none listed)')
  } else {
    nextReads.forEach((read) => {
      const label = normalizeNonEmpty(read.title) ?? normalizeNonEmpty(read.refId) ?? normalizeNonEmpty(read.uri) ?? '(unlabeled)'
      lines.push(`- ${read.type}: ${label}`)
    })
  }

  if (params.summaryMode) {
    lines.push('', '## Source Messages For Summarization')
    lines.push(`Policy: ${SUMMARY_SOURCE_MESSAGE_POLICY}`)
    if (!params.sourceMessages || params.sourceMessages.length === 0) {
      lines.push('- (none in seq range)')
    } else {
      params.sourceMessages.forEach((message) => {
        const seq = message.seq ?? '?'
        const sender = normalizeNonEmpty(message.senderHandle) ?? normalizeNonEmpty(message.senderMemberId) ?? 'unknown'
        const createdAt = normalizeNonEmpty(message.createdAt)
        const kind = normalizeNonEmpty(message.kind) ?? 'message'
        const text = oneLine(message.text) || '(empty)'
        lines.push(`- seq ${seq}${createdAt ? ` @ ${createdAt}` : ''} | ${sender} | ${kind}: ${text}`)
      })
    }
    lines.push(
      '',
      'Narrative digest slot: write an abstractive NARRATIVE-DIGEST from the source messages, refs, and seq range; never store source messages verbatim in memory.',
    )
  } else {
    lines.push('', 'Use this room brief as orientation. Follow PM/RR/doc/discuss refs in bindings before acting; chat remains coordination only.')
  }
  return `${lines.join('\n')}\n`
}

function buildJoinSummary(params: {
  channel: Pick<Channel, 'id' | 'slug' | 'title'>
  rooms: (Room | Chatv3SessionRoom)[]
  activeRoomId?: string | null
  memberCount?: number | null
  initialMessageCount?: number | null
}): Record<string, unknown> {
  const activeRoom =
    params.rooms.find((room) => room.id === params.activeRoomId) ??
    params.rooms.find((room) => room.slug === 'general') ??
    params.rooms[0]
  const channelLabel = params.channel.title || params.channel.slug
  const roomLabel = activeRoom?.title || activeRoom?.slug || 'room'
  return {
    text: `Joined ${channelLabel} / ${roomLabel} - ${params.rooms.length} room${params.rooms.length === 1 ? '' : 's'}, ${params.memberCount ?? 0} member${params.memberCount === 1 ? '' : 's'}, ${params.initialMessageCount ?? 0} recent message${params.initialMessageCount === 1 ? '' : 's'}.`,
    channel: { id: params.channel.id, slug: params.channel.slug, title: params.channel.title },
    activeRoom: activeRoom ? { id: activeRoom.id, slug: activeRoom.slug, title: activeRoom.title } : null,
    roomCount: params.rooms.length,
    memberCount: params.memberCount ?? null,
    initialMessageCount: params.initialMessageCount ?? null,
  }
}

function summarizeChannelMine(row: ChannelMineRow): Record<string, unknown> {
  const channel = row.channel
  const membershipStatus = row.membership?.status ?? null
  const archived = channel.status === 'archived' || Boolean(channel.archivedAt)
  const locked = archived || (membershipStatus !== null && membershipStatus !== 'active')
  return compactPayload({
    id: channel.id,
    slug: channel.slug,
    title: channel.title,
    status: channel.status,
    archived,
    locked,
    generalRoomId: channel.generalRoomId,
    updatedAt: channel.updatedAt,
    archivedAt: channel.archivedAt,
    isOwner: row.isOwner,
    canDelete: row.canDelete,
    membership: row.membership ? compactPayload({
      id: row.membership.id,
      handle: row.membership.handle,
      roleKey: row.membership.roleKey,
      status: row.membership.status,
      joinedAt: row.membership.joinedAt,
      removedAt: row.membership.removedAt,
    }) : null,
    modeStatus: row.modeStatus,
  })
}

type ChannelDeleteTarget = Pick<Channel, 'id' | 'slug'> & Partial<Pick<
  Channel,
  'title' | 'status' | 'spaceId' | 'encryptionMode' | 'generalRoomId' | 'createdAt' | 'updatedAt' | 'archivedAt'
>>

function summarizeChannelDeleteTarget(channel: ChannelDeleteTarget): Record<string, unknown> {
  return compactPayload({
    id: channel.id,
    slug: channel.slug,
    title: channel.title,
    status: channel.status,
    spaceId: channel.spaceId,
    encryptionMode: channel.encryptionMode,
    generalRoomId: channel.generalRoomId,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
    archivedAt: channel.archivedAt,
    archived: channel.status === 'archived' || Boolean(channel.archivedAt),
  })
}

function buildEnvelope(params: {
  options: Chatv3CommonOptions
  command: string
  serverBaseUrl?: string
  input: Record<string, unknown>
  result: unknown
  artifacts?: Record<string, string>
}): void {
  const resolvedContext = compactPayload({
    serverBaseUrl: params.serverBaseUrl,
    storePath: resolveChatv3SessionStorePath(params.options.storePath),
  })
  if (params.options.json) {
    console.log(JSON.stringify(compactPayload({
      command: params.command,
      surface: 'chatv3-product-client-v1',
      resolvedContext,
      input: params.input,
      artifacts: params.artifacts,
      result: params.result,
    }), null, 2))
    return
  }
  logSuccess(`${params.command} completed.`)
  console.log(JSON.stringify(params.result, null, 2))
}

async function hydrateRoomEpochs(runtime: LoadedRuntime, room: Room): Promise<void> {
  if (!runtime.secrets.wrapSecret) {
    if (runtime.channel.encryptionMode === 'server-encrypted') return
    throw new Error(`ChatV3 session "${runtime.record.id}" has no wrapSecret for e2e channel ${runtime.channel.id}.`)
  }
  const epochs = await runtime.client.http.get<EpochRow[]>(`/rooms/${room.id}/epochs`)
  for (const epoch of epochs) {
    const kek = await deriveKek(runtime.secrets.wrapSecret, {
      tenantId: runtime.channel.tenantId,
      spaceId: runtime.channel.spaceId,
      keyId: runtime.record.keyId,
      epoch: epoch.epoch,
    })
    const epochKey = await unwrapEpochKey(kek, epoch.wrappedKeyBlob)
    await runtime.keyStore.setEpochKey(epoch.roomId, epoch.epoch, epochKey)
  }
}

async function hydrateStoredServerEpochKeys(runtime: LoadedRuntime): Promise<void> {
  for (const epoch of runtime.secrets.epochKeys ?? []) {
    await runtime.keyStore.setEpochKey(epoch.roomId, epoch.epoch, await importEpochKey(epoch.rawEpochKey))
  }
}

function sessionEpochKeysFromServer(keys: ServerEpochKeyRow[] | undefined): Chatv3SessionEpochKey[] | undefined {
  if (!keys || keys.length === 0) return undefined
  return keys.map((key) => compactPayload({
    roomId: key.roomId,
    epoch: key.epoch,
    rawEpochKey: key.rawEpochKey,
    cipherSuite: key.cipherSuite,
    keyId: key.keyId,
  }) as Chatv3SessionEpochKey)
}

async function refreshServerEpochKeys(runtime: LoadedRuntime): Promise<void> {
  if (runtime.channel.encryptionMode !== 'server-encrypted') return
  const bundle = await runtime.client.epochKeys(runtime.channel.id, { tenantId: runtime.channel.tenantId })
  await Promise.all(bundle.keys.map(async (epoch) => {
    await runtime.keyStore.setEpochKey(epoch.roomId, epoch.epoch, await importEpochKey(epoch.rawEpochKey))
  }))
  runtime.secrets.epochKeys = sessionEpochKeysFromServer(bundle.keys)
}

async function persistRuntimeSnapshot(runtime: LoadedRuntime, activeRoomId?: string): Promise<void> {
  const plain: Chatv3SessionPlainInput = {
    id: runtime.record.id,
    serverBaseUrl: runtime.client.http.url('/').replace(/\/api\/chatv3\/v1\/$/, ''),
    handle: runtime.record.handle,
    channel: {
      id: runtime.channel.id,
      tenantId: runtime.channel.tenantId,
      spaceId: runtime.channel.spaceId,
      slug: runtime.channel.slug,
      title: runtime.channel.title,
      purpose: runtime.channel.purpose,
      guidanceMarkdown: runtime.channel.guidanceMarkdown,
      encryptionMode: runtime.channel.encryptionMode,
    },
    keyId: runtime.record.keyId,
    activeRoomId: activeRoomId ?? runtime.record.activeRoomId ?? runtime.rooms[0]?.id,
    rooms: runtime.rooms.map(roomToSessionRoom),
    createdAt: runtime.record.createdAt,
  }
  runtime.record = await saveChatv3Session(plain, runtime.secrets, { storePath: runtime.storePath })
}

async function loadRuntime(options: Chatv3CommonOptions, sessionId: string): Promise<LoadedRuntime> {
  const storePath = resolveChatv3SessionStorePath(options.storePath)
  const loaded = await loadChatv3Session(sessionId, { storePath })
  const serverBaseUrl = normalizeNonEmpty(options.apiBaseUrl) ?? loaded.record.serverBaseUrl
  const keyStore = new MemoryKeyStore()
  if (loaded.secrets.wrapSecret) {
    await keyStore.setWrapSecret(loaded.record.channel.id, loaded.secrets.wrapSecret)
  }
  const client = new Chatv3Client({
    serverBaseUrl,
    memberToken: loaded.secrets.memberToken,
    keyStore,
  })
  const channel = await client.getChannel(loaded.record.channel.id)
  const rooms = await client.listRooms(channel.id, { status: 'active' }).catch(() =>
    loaded.record.rooms.map((room) => ({
      ...room,
      tenantId: channel.tenantId,
      channelId: channel.id,
      kind: 'session',
      purpose: null,
      status: room.status ?? 'active',
      lastSeq: 0,
      lastMessageAt: null,
      createdBy: null,
      updatedBy: null,
      createdAt: loaded.record.createdAt,
      updatedAt: loaded.record.updatedAt,
      archivedAt: null,
    } as Room)),
  )
  const runtime: LoadedRuntime = {
    ...loaded,
    client,
    keyStore,
    channel,
    rooms,
    storePath,
  }
  await hydrateStoredServerEpochKeys(runtime)
  if (channel.encryptionMode === 'server-encrypted') {
    await refreshServerEpochKeys(runtime)
  } else {
    for (const room of rooms) {
      await hydrateRoomEpochs(runtime, room)
    }
  }
  await persistRuntimeSnapshot(runtime)
  return runtime
}

function channelMatchesSelector(channel: Pick<Channel, 'id' | 'slug'>, selector: string): boolean {
  return channel.id === selector || channel.slug === selector || (selector.length >= 8 && channel.id.startsWith(selector))
}

function resolveRoom(runtime: LoadedRuntime, selector?: string): Room {
  const normalized = normalizeNonEmpty(selector)
  let room: Room | undefined
  if (normalized) {
    const matches = runtime.rooms.filter((candidate) => candidate.id === normalized || candidate.slug === normalized)
    if (matches.length > 1) {
      throw new Error(`Room selector "${normalized}" matched multiple rooms in channel ${runtime.channel.slug}; use a room id.`)
    }
    room = matches[0]
  } else {
    room =
      runtime.rooms.find((candidate) => candidate.id === runtime.record.activeRoomId) ??
      runtime.rooms.find((candidate) => candidate.slug === 'general') ??
      runtime.rooms[0]
  }
  if (!room) throw new Error(normalized ? `Room not found in session: ${normalized}` : 'Session has no active rooms.')
  return room
}

async function loadRuntimeForChannelGuard(options: Chatv3MemberRemoveOptions): Promise<{
  sessionId: string
  runtime: LoadedRuntime
}> {
  const explicitSessionId = normalizeNonEmpty(options.session)
  const channelSelector = normalizeNonEmpty(options.channel)
  if (explicitSessionId) {
    const runtime = await loadRuntime(options, explicitSessionId)
    if (channelSelector && !channelMatchesSelector(runtime.channel, channelSelector)) {
      throw new Error(
        `Session "${explicitSessionId}" is bound to channel ${runtime.channel.slug} (${runtime.channel.id}); refusing --channel ${channelSelector}.`,
      )
    }
    return { sessionId: explicitSessionId, runtime }
  }
  if (!channelSelector) throw new Error('Provide --session <id> or --channel <channel-id-or-slug>.')

  const storePath = resolveChatv3SessionStorePath(options.storePath)
  const matches = (await listChatv3SessionRecords({ storePath }))
    .filter((record) => channelMatchesSelector(record.channel, channelSelector))
  if (matches.length === 0) throw new Error(`No local ChatV3 session found for channel ${channelSelector}. Provide --session <id>.`)
  if (matches.length > 1) {
    const ids = matches.map((record) => `${record.id}=${record.channel.slug}(${record.channel.id})`).join(', ')
    throw new Error(`Multiple local ChatV3 sessions match channel ${channelSelector}: ${ids}. Provide --session <id>.`)
  }
  const sessionId = matches[0]!.id
  return { sessionId, runtime: await loadRuntime(options, sessionId) }
}

async function listChatv3Bindings(runtime: LoadedRuntime, roomId?: string): Promise<Chatv3Binding[]> {
  const q = new URLSearchParams()
  if (roomId) q.set('roomId', roomId)
  const qs = q.toString()
  return runtime.client.http.get<Chatv3Binding[]>(`/channels/${runtime.channel.id}/bindings${qs ? `?${qs}` : ''}`)
}

async function resolveChannelListSpaceId(
  client: Chatv3Client,
  spaceSlugOrId: string | undefined,
): Promise<{ spaceId?: string; spaceSlug?: string }> {
  if (!spaceSlugOrId) return {}
  const space = normalizeChatv3Slug(spaceSlugOrId, '--space <slug>')
  if (looksUuid(space)) return { spaceId: space, spaceSlug: space }
  const spaces = await client.listSpaces({ limit: 500 })
  const row = spaces.find((entry) => entry.slug === space)
  if (!row) throw new Error(`No ChatV3 space found for --space ${space}.`)
  return { spaceId: row.id, spaceSlug: row.slug }
}

async function listChannelsForDeleteLookup(client: Chatv3Client): Promise<Channel[]> {
  const rows = await Promise.all([
    client.listChannels({ status: 'active', limit: 500 }),
    client.listChannels({ status: 'archived', limit: 500 }),
  ])
  const byId = new Map<string, Channel>()
  rows.flat().forEach((channel) => byId.set(channel.id, channel))
  return [...byId.values()]
}

function assertConfirmSlugMatches(target: ChannelDeleteTarget, confirmSlug: string): void {
  if (target.slug !== confirmSlug) {
    throw new Error(`--confirm-slug ${confirmSlug} does not match target channel slug ${target.slug}. Nothing was deleted.`)
  }
}

async function resolveChannelDeleteTarget(params: {
  selector: string
  runtime?: LoadedRuntime
  client: Chatv3Client
}): Promise<ChannelDeleteTarget> {
  const selector = params.selector
  if (params.runtime) {
    const channel = params.runtime.channel
    if (selector !== channel.id && selector !== channel.slug) {
      throw new Error(`--channel ${selector} does not match session channel ${channel.slug} (${channel.id}). Nothing was deleted.`)
    }
    return channel
  }

  if (looksUuid(selector)) {
    const known = (await listChannelsForDeleteLookup(params.client).catch(() => []))
      .find((channel) => channel.id === selector)
    return known ?? { id: selector, slug: '' }
  }

  const slug = normalizeChatv3Slug(selector, '--channel <id|slug>')
  const matches = (await listChannelsForDeleteLookup(params.client)).filter((channel) => channel.slug === slug)
  if (matches.length === 0) {
    throw new Error(`No ChatV3 channel found for slug ${slug}. Pass a channel id or use --session for a local session-bound delete.`)
  }
  if (matches.length > 1) {
    throw new Error(`Channel slug ${slug} matches ${matches.length} channels across spaces. Pass a channel id or use --session.`)
  }
  return matches[0]
}

export async function runChatv3ChannelCreate(options: Chatv3ChannelCreateOptions = {}): Promise<void> {
  const title = requireField(options.title, '--title <title>')
  const handle = requireField(options.handle, '--handle <handle>')
  const slug = resolveChannelSlug(title, normalizeNonEmpty(options.slug))
  const spaceSlug = resolveSpaceSlug(options.space)
  const mode = normalizeChannelMode(options.mode)
  const serverBaseUrl = resolveChatv3ServerBaseUrl(options)
  const storePath = resolveChatv3SessionStorePath(options.storePath)
  const explicitSessionId = normalizeNonEmpty(options.session)

  if (options.saveSession && explicitSessionId && options.force !== true) {
    const existing = await getChatv3SessionRecord(explicitSessionId, { storePath })
    if (existing) {
      throw new Error(
        `Refusing to overwrite existing ChatV3 session "${explicitSessionId}" bound to channel ${existing.channel.slug} (${existing.channel.id}). Rerun with --force to replace it.`,
      )
    }
  }

  const client = new Chatv3Client({ serverBaseUrl, accessToken: options.accessToken })
  const space = await client.ensureSpace(spaceSlug, spaceSlug)
  const created = await client.createChannel({
    space,
    slug,
    title,
    handle,
    encryptionMode: mode,
  })
  const channelMode = created.channel.encryptionMode ?? mode
  const parsedInvite = parseInvite(created.invite)
  const activeRoom = created.generalRoom
  const sessionId = sessionIdFor(handle, created.channel.id, explicitSessionId)
  const memberToken = client.http.memberToken
  if (!memberToken) throw new Error('ChatV3 channel create did not return a member token.')

  let record = null as ReturnType<typeof summarizeChatv3Session> | null
  if (options.saveSession) {
    if (options.force !== true) {
      const existing = await getChatv3SessionRecord(sessionId, { storePath })
      if (existing) {
        throw new Error(
          `Refusing to overwrite ChatV3 session "${sessionId}" bound to channel ${existing.channel.slug} (${existing.channel.id}). Rerun with --force to replace it.`,
        )
      }
    }
    const epochKeys = channelMode === 'server-encrypted'
      ? sessionEpochKeysFromServer((await client.epochKeys(created.channel.id, { tenantId: created.channel.tenantId })).keys)
      : undefined
    const saved = await saveChatv3Session({
      id: sessionId,
      serverBaseUrl,
      handle,
      channel: {
        id: created.channel.id,
        tenantId: created.channel.tenantId,
        spaceId: created.channel.spaceId,
        slug: created.channel.slug,
        title: created.channel.title ?? title,
        purpose: created.channel.purpose ?? null,
        guidanceMarkdown: created.channel.guidanceMarkdown ?? null,
        encryptionMode: channelMode,
      },
      keyId: parsedInvite.keyId,
      activeRoomId: activeRoom.id,
      rooms: [roomToSessionRoom(activeRoom)],
    }, {
      memberToken,
      wrapSecret: parsedInvite.mode === 'server-encrypted' ? undefined : parsedInvite.wrapSecret,
      epochKeys,
    }, { storePath })
    record = summarizeChatv3Session(saved)
  }

  const channelForGuidance = {
    id: created.channel.id,
    slug: created.channel.slug,
    title: created.channel.title ?? title,
    purpose: created.channel.purpose ?? null,
    guidanceMarkdown: created.channel.guidanceMarkdown ?? null,
  }

  buildEnvelope({
    options,
    command: 'chatv3.channel.create',
    serverBaseUrl,
    input: {
      title,
      slug,
      space: spaceSlug,
      mode,
      handle,
      session: sessionId,
      saveSession: options.saveSession === true,
    },
    artifacts: compactPayload({ sessionId, channelId: created.channel.id, activeRoomId: activeRoom.id }) as Record<string, string>,
    result: {
      created: true,
      saved: options.saveSession === true,
      warning: CHATV3_INVITE_SECRET_WARNING,
      invite: created.invite,
      channel: compactPayload({
        id: created.channel.id,
        tenantId: created.channel.tenantId,
        spaceId: created.channel.spaceId,
        slug: created.channel.slug,
        title: created.channel.title ?? title,
        encryptionMode: channelMode,
      }),
      activeRoom: { id: activeRoom.id, slug: activeRoom.slug, title: activeRoom.title },
      session: record,
      guidance: buildAgentGuidance({ channel: channelForGuidance, rooms: [activeRoom] }),
    },
  })
}

export async function runChatv3ChannelDelete(options: Chatv3ChannelDeleteOptions = {}): Promise<void> {
  const selector = requireField(options.channel, '--channel <id|slug>')
  const confirmSlug = normalizeChatv3Slug(options.confirmSlug, '--confirm-slug <slug>')
  const sessionId = normalizeNonEmpty(options.session)
  const runtime = sessionId ? await loadRuntime(options, sessionId) : undefined
  const serverBaseUrl = runtime?.client.http.url('/').replace(/\/api\/chatv3\/v1\/$/, '') ?? resolveChatv3ServerBaseUrl(options)
  const client = runtime?.client ?? new Chatv3Client({ serverBaseUrl, accessToken: options.accessToken })
  const target = await resolveChannelDeleteTarget({ selector, runtime, client })
  if (!target.slug) {
    target.slug = confirmSlug
  }
  assertConfirmSlugMatches(target, confirmSlug)
  const deleted = await client.deleteChannel(target.id, { confirmSlug })

  buildEnvelope({
    options,
    command: 'chatv3.channel.delete',
    serverBaseUrl,
    input: compactPayload({
      session: sessionId,
      channel: selector,
      confirmSlug,
    }),
    artifacts: compactPayload({ sessionId, channelId: target.id }) as Record<string, string>,
    result: {
      deleted: deleted.deleted === true,
      destructive: true,
      confirmSlug,
      whatWasDeleted: [summarizeChannelDeleteTarget(target)],
    },
  })
}

export async function runChatv3ChannelPurgeBefore(options: Chatv3ChannelPurgeBeforeOptions = {}): Promise<void> {
  const beforeDate = normalizeIsoDateTime(options.before, '--before <ISO>')
  const serverBaseUrl = resolveChatv3ServerBaseUrl(options)
  const client = new Chatv3Client({ serverBaseUrl, accessToken: options.accessToken })
  const dryRun = options.confirm !== true
  const result = await client.purgeChannelsBefore({
    beforeDate,
    dryRun,
    confirm: options.confirm === true ? true : undefined,
  })
  const candidates = result.candidates.map(summarizeChannelDeleteTarget)

  buildEnvelope({
    options,
    command: 'chatv3.channel.purge-before',
    serverBaseUrl,
    input: {
      before: beforeDate,
      dryRun,
      confirm: options.confirm === true,
    },
    result: {
      beforeDate: result.beforeDate,
      dryRun: result.dryRun,
      applied: result.applied,
      candidateCount: result.candidateCount,
      deletedCount: result.deletedCount,
      willDeleteCount: dryRun ? result.candidateCount : 0,
      whatWillBeDeleted: dryRun ? candidates : [],
      whatWasDeleted: result.applied ? candidates : [],
    },
  })
}

export async function runChatv3Channels(options: Chatv3ChannelsOptions = {}): Promise<void> {
  const serverBaseUrl = resolveChatv3ServerBaseUrl(options)
  const client = new Chatv3Client({ serverBaseUrl, accessToken: options.accessToken })
  const status = normalizeChannelStatus(options.status)
  const spaceFilter = await resolveChannelListSpaceId(client, normalizeNonEmpty(options.space))
  const rows = await client.listMyChannels({
    ...(spaceFilter.spaceId ? { spaceId: spaceFilter.spaceId } : {}),
    ...(status ? { status } : {}),
  })
  const channels = rows.map(summarizeChannelMine)

  buildEnvelope({
    options,
    command: 'chatv3.channels',
    serverBaseUrl,
    input: compactPayload({
      space: spaceFilter.spaceSlug ?? normalizeNonEmpty(options.space),
      spaceId: spaceFilter.spaceId,
      status,
    }),
    result: {
      count: channels.length,
      channels,
    },
  })
}

export async function runChatv3Join(invite: string, options: Chatv3JoinOptions = {}): Promise<void> {
  const parsed = parseInvite(invite)
  const handle = normalizeNonEmpty(options.handle)
  if (!handle) throw new Error('Provide --handle <agent-handle>.')
  const serverBaseUrl = normalizeNonEmpty(options.apiBaseUrl) ?? parsed.serverBaseUrl
  const sessionId = sessionIdFor(handle, parsed.channelId, options.session)
  const storePath = resolveChatv3SessionStorePath(options.storePath)

  if (options.saveSession && options.force !== true) {
    const existing = await getChatv3SessionRecord(sessionId, { storePath })
    if (existing?.channel.id === parsed.channelId) {
      buildEnvelope({
        options,
        command: 'chatv3.join',
        serverBaseUrl: existing.serverBaseUrl,
        input: { invite: 'redacted', handle, session: sessionId, saveSession: true, mode: parsed.mode ?? 'e2e' },
        artifacts: { sessionId, channelId: parsed.channelId },
        result: {
          joined: false,
          reusedSession: true,
          summary: buildJoinSummary({
            channel: {
              id: existing.channel.id,
              slug: existing.channel.slug,
              title: existing.channel.title ?? existing.channel.slug,
            },
            rooms: existing.rooms,
            activeRoomId: existing.activeRoomId,
          }),
          session: summarizeChatv3Session(existing),
          guidance: buildAgentGuidance({
            channel: {
              id: existing.channel.id,
              slug: existing.channel.slug,
              title: existing.channel.title ?? existing.channel.slug,
              purpose: existing.channel.purpose ?? null,
              guidanceMarkdown: existing.channel.guidanceMarkdown ?? null,
            },
            rooms: existing.rooms,
          }),
        },
      })
      return
    }
    if (existing) {
      throw new Error(
        `Refusing to overwrite ChatV3 session "${sessionId}" bound to channel ${existing.channel.slug} (${existing.channel.id}) with invite channel ${parsed.channelId}. Use a channel-qualified --session id or rerun with --force to replace it.`,
      )
    }
  }

  const client = new Chatv3Client({ serverBaseUrl })
  const joined = await client.joinFromInvite({ ...parsed, serverBaseUrl }, handle)
  const channel = await client.getChannel(parsed.channelId)
  const rooms = await client.listRooms(channel.id, { status: 'active' }).catch(() => joined.rooms as Room[])
  const activeRoom = rooms.find((room) => room.slug === 'general') ?? rooms[0]
  const members = await client.listMembers(channel.id, { status: 'active' }).catch(() => [])
  const initialMessages = activeRoom ? await client.readText(activeRoom, 0, 1).catch(() => []) : []
  const memberToken = client.http.memberToken
  if (!memberToken) throw new Error('ChatV3 join did not return a member token.')
  const channelMode = channel.encryptionMode ?? parsed.mode
  const epochKeys = channelMode === 'server-encrypted'
    ? sessionEpochKeysFromServer((await client.epochKeys(channel.id, { tenantId: channel.tenantId })).keys)
    : sessionEpochKeysFromServer(joined.epochKeys)

  let record = null as ReturnType<typeof summarizeChatv3Session> | null
  if (options.saveSession) {
    const saved = await saveChatv3Session({
      id: sessionId,
      serverBaseUrl,
      handle,
      channel: {
        id: channel.id,
        tenantId: channel.tenantId,
        spaceId: channel.spaceId,
        slug: channel.slug,
        title: channel.title,
        purpose: channel.purpose,
        guidanceMarkdown: channel.guidanceMarkdown,
        encryptionMode: channel.encryptionMode,
      },
      keyId: parsed.keyId,
      activeRoomId: activeRoom?.id,
      rooms: rooms.map(roomToSessionRoom),
    }, {
      memberToken,
      wrapSecret: parsed.mode === 'server-encrypted' ? undefined : parsed.wrapSecret,
      epochKeys,
    }, { storePath })
    record = summarizeChatv3Session(saved)
  }

  buildEnvelope({
    options,
    command: 'chatv3.join',
    serverBaseUrl,
    input: { invite: 'redacted', handle, session: sessionId, saveSession: options.saveSession === true, mode: parsed.mode ?? 'e2e' },
    artifacts: compactPayload({ sessionId, channelId: channel.id, activeRoomId: rooms[0]?.id }) as Record<string, string>,
    result: {
      joined: true,
      saved: options.saveSession === true,
      summary: buildJoinSummary({
        channel,
        rooms,
        activeRoomId: activeRoom?.id,
        memberCount: members.length,
        initialMessageCount: initialMessages.length,
      }),
      session: record,
      rooms: rooms.map(roomToSessionRoom),
      guidance: buildAgentGuidance({ channel, rooms }),
    },
  })
}

export async function runChatv3Send(messageArg: string | undefined, options: Chatv3SendOptions = {}): Promise<void> {
  const sessionId = normalizeNonEmpty(options.session)
  if (!sessionId) throw new Error('Provide --session <id>.')
  const text = readTextInput(normalizeNonEmpty(options.text) ?? messageArg, '<message> or --text')
  const runtime = await loadRuntime(options, sessionId)
  const room = resolveRoom(runtime, options.room)
  const sent = await runtime.client.sendText(room, text, normalizeNonEmpty(options.kind) ?? 'message')
  let delivered = null
  let read = null
  if (options.markDelivered) delivered = await runtime.client.markDelivered(room.id, sent.seq)
  if (options.markRead) read = await runtime.client.markRead(room.id, sent.seq)
  await persistRuntimeSnapshot(runtime, room.id)

  buildEnvelope({
    options,
    command: 'chatv3.send',
    serverBaseUrl: runtime.record.serverBaseUrl,
    input: {
      session: sessionId,
      room: options.room ?? room.slug,
      text: 'redacted',
      kind: normalizeNonEmpty(options.kind) ?? 'message',
      markDelivered: options.markDelivered === true,
      markRead: options.markRead === true,
    },
    artifacts: { sessionId, channelId: runtime.channel.id, roomId: room.id, seq: String(sent.seq) },
    result: compactPayload({
      message: sent,
      delivered,
      read,
      guidance: buildAgentGuidance({ channel: runtime.channel, rooms: runtime.rooms }),
    }),
  })
}

export async function runChatv3Read(options: Chatv3ReadOptions = {}): Promise<void> {
  const sessionId = normalizeNonEmpty(options.session)
  if (!sessionId) throw new Error('Provide --session <id>.')
  const afterSeq = toInteger(options.afterSeq, '--after-seq')
  const limit = options.limit === undefined ? undefined : toInteger(options.limit, '--limit')
  const runtime = await loadRuntime(options, sessionId)
  const room = resolveRoom(runtime, options.room)
  const messages = await runtime.client.readText(room, afterSeq, limit)
  const topSeq = messages.reduce((max, message) => Math.max(max, message.seq), afterSeq)
  let delivered = null
  let read = null
  if (topSeq > afterSeq && options.markDelivered) delivered = await runtime.client.markDelivered(room.id, topSeq)
  if (topSeq > afterSeq && options.markRead) read = await runtime.client.markRead(room.id, topSeq)
  await persistRuntimeSnapshot(runtime, room.id)

  buildEnvelope({
    options,
    command: 'chatv3.read',
    serverBaseUrl: runtime.record.serverBaseUrl,
    input: {
      session: sessionId,
      room: options.room ?? room.slug,
      afterSeq,
      limit,
      markDelivered: options.markDelivered === true,
      markRead: options.markRead === true,
    },
    artifacts: { sessionId, channelId: runtime.channel.id, roomId: room.id },
    result: {
      messages,
      messageCount: messages.length,
      latestSeq: topSeq,
      caughtUp: messages.length === 0,
      delivered,
      read,
      guidance: buildAgentGuidance({ channel: runtime.channel, rooms: runtime.rooms }),
    },
  })
}

export async function runChatv3Listen(options: Chatv3ListenOptions = {}): Promise<void> {
  const sessionId = normalizeNonEmpty(options.session)
  if (!sessionId) throw new Error('Provide --session <id>.')
  const afterSeq = toInteger(options.afterSeq, '--after-seq')
  const limit = options.limit === undefined ? undefined : toInteger(options.limit, '--limit')
  const timeoutSec = toPositiveInteger(options.timeoutSec, '--timeout-sec', 60)
  const intervalSec = toPositiveInteger(options.intervalSec, '--interval-sec', 5)
  const deadline = Date.now() + timeoutSec * 1000
  const runtime = await loadRuntime(options, sessionId)
  const room = resolveRoom(runtime, options.room)
  let attempts = 0
  let messages: Awaited<ReturnType<Chatv3Client['readText']>> = []

  while (Date.now() <= deadline) {
    attempts += 1
    messages = await runtime.client.readText(room, afterSeq, limit)
    if (messages.length > 0) break
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) break
    await sleep(Math.min(intervalSec * 1000, remainingMs))
  }

  const topSeq = messages.reduce((max, message) => Math.max(max, message.seq), afterSeq)
  let delivered = null
  let read = null
  if (topSeq > afterSeq && options.markDelivered) delivered = await runtime.client.markDelivered(room.id, topSeq)
  if (topSeq > afterSeq && options.markRead) read = await runtime.client.markRead(room.id, topSeq)
  await persistRuntimeSnapshot(runtime, room.id)
  if (messages.length === 0) process.exitCode = 22

  buildEnvelope({
    options,
    command: 'chatv3.listen',
    serverBaseUrl: runtime.record.serverBaseUrl,
    input: {
      session: sessionId,
      room: options.room ?? room.slug,
      afterSeq,
      limit,
      timeoutSec,
      intervalSec,
      markDelivered: options.markDelivered === true,
      markRead: options.markRead === true,
    },
    artifacts: { sessionId, channelId: runtime.channel.id, roomId: room.id },
    result: {
      status: messages.length > 0 ? 'messages' : 'timeout',
      messages,
      messageCount: messages.length,
      latestSeq: topSeq,
      caughtUp: messages.length === 0,
      attempts,
      delivered,
      read,
      guidance: buildAgentGuidance({ channel: runtime.channel, rooms: runtime.rooms }),
    },
  })
}

export async function runChatv3MemberList(options: Chatv3MemberListOptions = {}): Promise<void> {
  const sessionId = normalizeNonEmpty(options.session)
  if (!sessionId) throw new Error('Provide --session <id>.')
  const limit = options.limit === undefined ? undefined : toInteger(options.limit, '--limit')
  const runtime = await loadRuntime(options, sessionId)
  const members = await runtime.client.listMembers(runtime.channel.id, { status: options.status, limit })
  buildEnvelope({
    options,
    command: 'chatv3.member.list',
    serverBaseUrl: runtime.record.serverBaseUrl,
    input: compactPayload({ session: sessionId, status: options.status, limit }),
    artifacts: { sessionId, channelId: runtime.channel.id },
    result: {
      members,
      memberCount: members.length,
      guidance: buildAgentGuidance({ channel: runtime.channel, rooms: runtime.rooms }),
    },
  })
}

export async function runChatv3MemberRemove(options: Chatv3MemberRemoveOptions = {}): Promise<void> {
  const memberId = requireField(options.member, '--member')
  const { sessionId, runtime } = await loadRuntimeForChannelGuard(options)
  const beforeMembers = await runtime.client.listMembers(runtime.channel.id).catch(() => [])
  const target = beforeMembers.find((member) => member.id === memberId)
  if (target && target.channelId !== runtime.channel.id) {
    throw new Error(`Member ${memberId} belongs to channel ${target.channelId}; refusing to remove from ${runtime.channel.id}.`)
  }
  const member = await runtime.client.updateMember(memberId, { status: 'removed' })
  if (member.channelId !== runtime.channel.id) {
    throw new Error(`Server returned member ${member.id} from channel ${member.channelId}; expected ${runtime.channel.id}.`)
  }
  const members = await runtime.client.listMembers(runtime.channel.id).catch(() =>
    beforeMembers.map((entry) => (entry.id === memberId ? member : entry)),
  )
  await persistRuntimeSnapshot(runtime)
  buildEnvelope({
    options,
    command: 'chatv3.member.remove',
    serverBaseUrl: runtime.record.serverBaseUrl,
    input: compactPayload({ session: sessionId, channel: options.channel, member: memberId }),
    artifacts: { sessionId, channelId: runtime.channel.id, memberId },
    result: {
      removed: true,
      member,
      members,
      memberCount: members.length,
      guidance: buildAgentGuidance({ channel: runtime.channel, rooms: runtime.rooms }),
    },
  })
}

export async function runChatv3PresenceList(options: Chatv3PresenceListOptions = {}): Promise<void> {
  const sessionId = normalizeNonEmpty(options.session)
  if (!sessionId) throw new Error('Provide --session <id>.')
  const runtime = await loadRuntime(options, sessionId)
  const room = resolveRoom(runtime, options.room)
  const presence = await runtime.client.listPresence(room.id)
  buildEnvelope({
    options,
    command: 'chatv3.presence.list',
    serverBaseUrl: runtime.record.serverBaseUrl,
    input: { session: sessionId, room: options.room ?? room.slug },
    artifacts: { sessionId, channelId: runtime.channel.id, roomId: room.id },
    result: {
      presence,
      presenceCount: presence.length,
    },
  })
}

export async function runChatv3PresenceSet(options: Chatv3PresenceSetOptions = {}): Promise<void> {
  const sessionId = normalizeNonEmpty(options.session)
  if (!sessionId) throw new Error('Provide --session <id>.')
  const ttlSec = options.ttlSec === undefined ? undefined : toInteger(options.ttlSec, '--ttl-sec')
  const runtime = await loadRuntime(options, sessionId)
  const room = resolveRoom(runtime, options.room)
  const presence = await runtime.client.setPresence(room.id, {
    state: options.state,
    note: normalizeNonEmpty(options.note),
    ttlSec,
  })
  buildEnvelope({
    options,
    command: 'chatv3.presence.set',
    serverBaseUrl: runtime.record.serverBaseUrl,
    input: compactPayload({ session: sessionId, room: options.room ?? room.slug, state: options.state, note: options.note, ttlSec }),
    artifacts: { sessionId, channelId: runtime.channel.id, roomId: room.id },
    result: { presence },
  })
}

export async function runChatv3BindingAdd(options: Chatv3BindingAddOptions = {}): Promise<void> {
  const sessionId = normalizeNonEmpty(options.session)
  if (!sessionId) throw new Error('Provide --session <id>.')
  const runtime = await loadRuntime(options, sessionId)
  const room = options.channelOnly ? undefined : resolveRoom(runtime, options.room)
  const input = compactPayload({
    channelId: runtime.channel.id,
    roomId: room?.id,
    bindingType: requireField(options.bindingType, '--binding-type'),
    refId: normalizeNonEmpty(options.refId),
    uri: normalizeNonEmpty(options.uri),
    title: normalizeNonEmpty(options.title),
    note: normalizeNonEmpty(options.note),
  })
  const binding = await runtime.client.http.post<Chatv3Binding>(`/channels/${runtime.channel.id}/bindings`, input)
  await persistRuntimeSnapshot(runtime, room?.id)
  buildEnvelope({
    options,
    command: 'chatv3.binding.add',
    serverBaseUrl: runtime.record.serverBaseUrl,
    input: compactPayload({
      session: sessionId,
      room: room ? (options.room ?? room.slug) : undefined,
      channelOnly: options.channelOnly === true,
      bindingType: input.bindingType,
      refId: input.refId,
      uri: input.uri,
      title: input.title,
      note: input.note,
    }),
    artifacts: compactPayload({ sessionId, channelId: runtime.channel.id, roomId: room?.id, bindingId: binding.id }) as Record<string, string>,
    result: {
      binding: summarizeChatv3Binding(binding),
      guidance: buildAgentGuidance({ channel: runtime.channel, rooms: runtime.rooms }),
    },
  })
}

export async function runChatv3BindingList(options: Chatv3BindingListOptions = {}): Promise<void> {
  const sessionId = normalizeNonEmpty(options.session)
  if (!sessionId) throw new Error('Provide --session <id>.')
  const runtime = await loadRuntime(options, sessionId)
  const room = options.allRooms ? undefined : resolveRoom(runtime, options.room)
  const bindings = await listChatv3Bindings(runtime, room?.id)
  await persistRuntimeSnapshot(runtime, room?.id)
  buildEnvelope({
    options,
    command: 'chatv3.binding.list',
    serverBaseUrl: runtime.record.serverBaseUrl,
    input: compactPayload({
      session: sessionId,
      room: room ? (options.room ?? room.slug) : undefined,
      allRooms: options.allRooms === true,
    }),
    artifacts: compactPayload({ sessionId, channelId: runtime.channel.id, roomId: room?.id }) as Record<string, string>,
    result: {
      bindings: bindings.map(summarizeChatv3Binding),
      bindingCount: bindings.length,
      recommendedNextReads: buildRecommendedNextReads(bindings),
      guidance: buildAgentGuidance({ channel: runtime.channel, rooms: runtime.rooms }),
    },
  })
}

export async function runChatv3BindingRemove(options: Chatv3BindingRemoveOptions = {}): Promise<void> {
  const sessionId = normalizeNonEmpty(options.session)
  if (!sessionId) throw new Error('Provide --session <id>.')
  const bindingId = requireField(options.id, '--id')
  const runtime = await loadRuntime(options, sessionId)
  const removed = await runtime.client.http.request<{ removed: true }>('DELETE', `/bindings/${bindingId}`, { bindingId })
  await persistRuntimeSnapshot(runtime)
  buildEnvelope({
    options,
    command: 'chatv3.binding.remove',
    serverBaseUrl: runtime.record.serverBaseUrl,
    input: { session: sessionId, id: bindingId },
    artifacts: { sessionId, channelId: runtime.channel.id, bindingId },
    result: { removed },
  })
}

async function buildChatv3RoomContext(options: Chatv3RoomBriefOptions | Chatv3RoomSummaryOptions, explicitLatestSeq?: number): Promise<{
  sessionId: string
  runtime: LoadedRuntime
  room: Room
  afterSeq: number
  seqRange: Record<string, unknown>
  members: Awaited<ReturnType<Chatv3Client['listMembers']>>
  presence: Awaited<ReturnType<Chatv3Client['listPresence']>>
  receipts: Awaited<ReturnType<Chatv3Client['getReceipts']>>
  bindings: Chatv3Binding[]
}> {
  const sessionId = normalizeNonEmpty(options.session)
  if (!sessionId) throw new Error('Provide --session <id>.')
  const afterSeq = toInteger(options.afterSeq, '--after-seq')
  const runtime = await loadRuntime(options, sessionId)
  const room = resolveRoom(runtime, options.room)
  const [members, presence, receipts, bindings] = await Promise.all([
    runtime.client.listMembers(runtime.channel.id, { status: 'active' }),
    runtime.client.listPresence(room.id),
    runtime.client.getReceipts(room.id),
    listChatv3Bindings(runtime, room.id),
  ])
  await persistRuntimeSnapshot(runtime, room.id)
  return {
    sessionId,
    runtime,
    room,
    afterSeq,
    seqRange: seqRangeForRoom(room, afterSeq, explicitLatestSeq),
    members,
    presence,
    receipts,
    bindings,
  }
}

export async function runChatv3RoomBrief(options: Chatv3RoomBriefOptions = {}): Promise<void> {
  const context = await buildChatv3RoomContext(options)
  const forAgent = normalizeNonEmpty(options.for)
  const briefMarkdown = buildRoomContextMarkdown({
    title: `ChatV3 Room Brief: ${context.room.title || context.room.slug}`,
    runtime: context.runtime,
    room: context.room,
    forAgent,
    seqRange: context.seqRange,
    members: context.members,
    presence: context.presence,
    receipts: context.receipts,
    bindings: context.bindings,
  })
  const result = {
    briefMarkdown,
    room: roomToSessionRoom(context.room),
    seqRange: context.seqRange,
    members: context.members,
    presence: context.presence,
    receipts: context.receipts,
    bindings: context.bindings.map(summarizeChatv3Binding),
    recommendedNextReads: buildRecommendedNextReads(context.bindings),
    transcriptPolicy: 'Raw message transcript is not included in the room brief.',
  }
  buildEnvelope({
    options,
    command: 'chatv3.room.brief',
    serverBaseUrl: context.runtime.record.serverBaseUrl,
    input: compactPayload({
      session: context.sessionId,
      room: options.room ?? context.room.slug,
      for: forAgent,
      afterSeq: context.afterSeq,
    }),
    artifacts: { sessionId: context.sessionId, channelId: context.runtime.channel.id, roomId: context.room.id },
    result,
  })
}

export async function runChatv3RoomSummary(options: Chatv3RoomSummaryOptions = {}): Promise<void> {
  const latestSeq = options.latestSeq === undefined ? undefined : toInteger(options.latestSeq, '--latest-seq')
  const context = await buildChatv3RoomContext(options, latestSeq)
  const latestSeqValue = Number(context.seqRange.latestSeq ?? context.afterSeq)
  const sourceMessages = summarizeRoomSourceMessages(
    (await context.runtime.client.readText(context.room, context.afterSeq))
      .filter((message) => message.seq > context.afterSeq && message.seq <= latestSeqValue),
    context.members,
  )
  const summaryMarkdown = buildRoomContextMarkdown({
    title: `ChatV3 Room Summary: ${context.room.title || context.room.slug}`,
    runtime: context.runtime,
    room: context.room,
    forAgent: normalizeNonEmpty(options.for),
    seqRange: context.seqRange,
    members: context.members,
    presence: context.presence,
    receipts: context.receipts,
    bindings: context.bindings,
    sourceMessages,
    summaryMode: true,
  })
  const sourceRef = compactPayload({
    type: 'chatv3.room',
    channelId: context.runtime.channel.id,
    channelSlug: context.runtime.channel.slug,
    roomId: context.room.id,
    roomSlug: context.room.slug,
    seqRange: context.seqRange,
  })
  const nextReadRefs = buildRecommendedNextReads(context.bindings)
  const memoryArgs = [
    'mem',
    'summary',
    '--subject',
    'project',
    '--content',
    '@<narrative-digest.md>',
    '--source-ref',
    JSON.stringify(sourceRef),
    '--tag',
    'chatv3:room-summary',
    '--tag',
    `chatv3:room:${context.room.slug}`,
    '--apply',
    '--json',
  ]
  for (const ref of nextReadRefs) {
    memoryArgs.splice(memoryArgs.length - 2, 0, '--next-read-ref', JSON.stringify(ref))
  }
  buildEnvelope({
    options,
    command: 'chatv3.room.summary',
    serverBaseUrl: context.runtime.record.serverBaseUrl,
    input: compactPayload({
      session: context.sessionId,
      room: options.room ?? context.room.slug,
      afterSeq: context.afterSeq,
      latestSeq: context.seqRange.latestSeq,
    }),
    artifacts: { sessionId: context.sessionId, channelId: context.runtime.channel.id, roomId: context.room.id },
    result: {
      summaryMarkdown,
      sourceRef,
      nextReadRefs,
      sourceMessages,
      sourceMessagePolicy: SUMMARY_SOURCE_MESSAGE_POLICY,
      transcriptPolicy: 'Source messages are exposed only for agent summarization; write only the abstractive narrative digest, refs, and seq range to memory.',
      memoryWrite: {
        command: 'aops-cli',
        args: memoryArgs,
        slots: {
          'NARRATIVE-DIGEST': 'Agent-authored abstractive digest from result.sourceMessages, sourceRef, and nextReadRefs. Do not paste sourceMessages verbatim.',
        },
        sourceInputPath: 'result.sourceMessages',
      },
    },
  })
}

export async function runChatv3Leave(options: Chatv3LeaveOptions = {}): Promise<void> {
  const sessionId = normalizeNonEmpty(options.session)
  if (!sessionId) throw new Error('Provide --session <id>.')
  const runtime = await loadRuntime(options, sessionId)
  const members = await runtime.client.listMembers(runtime.channel.id, { status: 'active' })
  const self = members.find((member) => member.handle === runtime.record.handle)
  if (!self) throw new Error(`Active member for handle ${runtime.record.handle} not found.`)
  const member = await runtime.client.updateMember(self.id, { status: 'removed' })
  const forgotten = options.keepSession === true ? false : await deleteChatv3Session(sessionId, { storePath: runtime.storePath })
  buildEnvelope({
    options,
    command: 'chatv3.leave',
    serverBaseUrl: runtime.record.serverBaseUrl,
    input: { session: sessionId, keepSession: options.keepSession === true },
    artifacts: { sessionId, channelId: runtime.channel.id, memberId: self.id },
    result: {
      left: true,
      member,
      sessionForgotten: forgotten,
    },
  })
}

export async function runChatv3SessionList(options: Chatv3SessionListOptions = {}): Promise<void> {
  const sessions = await listChatv3SessionRecords({ storePath: options.storePath })
  buildEnvelope({
    options,
    command: 'chatv3.session.list',
    input: {},
    artifacts: {},
    result: {
      sessions: sessions.map(summarizeChatv3Session),
    },
  })
}

export async function runChatv3SessionGet(options: Chatv3SessionGetOptions = {}): Promise<void> {
  const sessionId = normalizeNonEmpty(options.session)
  if (!sessionId) throw new Error('Provide --session <id>.')
  const record = await getChatv3SessionRecord(sessionId, { storePath: options.storePath })
  if (!record) throw new Error(`ChatV3 session not found: ${sessionId}`)
  buildEnvelope({
    options,
    command: 'chatv3.session.get',
    serverBaseUrl: record.serverBaseUrl,
    input: { session: sessionId },
    artifacts: { sessionId, channelId: record.channel.id },
    result: {
      session: summarizeChatv3Session(record),
      guidance: buildAgentGuidance({
        channel: {
          id: record.channel.id,
          slug: record.channel.slug,
          title: record.channel.title ?? record.channel.slug,
          purpose: record.channel.purpose ?? null,
          guidanceMarkdown: record.channel.guidanceMarkdown ?? null,
        },
        rooms: record.rooms,
      }),
    },
  })
}

export async function runChatv3SessionForget(options: Chatv3SessionForgetOptions = {}): Promise<void> {
  const sessionId = normalizeNonEmpty(options.session)
  if (!sessionId) throw new Error('Provide --session <id>.')
  const deleted = await deleteChatv3Session(sessionId, { storePath: options.storePath })
  buildEnvelope({
    options,
    command: 'chatv3.session.forget',
    input: { session: sessionId },
    artifacts: { sessionId },
    result: { deleted },
  })
}

function applyChatv3Options<T extends Command>(cmd: T): T {
  return applyCommonOptions(
    cmd.option('--store-path <path>', 'Session store path (default: AOPS_CHATV3_SESSION_STORE_PATH or ~/.aops/chatv3-sessions.json)'),
    { withAuth: false },
  ) as T
}

export function makeChatv3Command(): Command {
  const cmd = new Command('chatv3')
    .description('ChatV3 encrypted product-channel CLI for agent sessions with bootstrap guidance; separate from hosted `aops-cli chat` coordination rooms')

  applyChatv3Options(
    cmd.command('join')
      .argument('<invite>', 'chv3://join/... invite string')
      .requiredOption('--handle <handle>', 'Agent handle to join with')
      .option('--session <id>', 'Local session id; default <handle>-<channel-prefix>')
      .option('--save-session', 'Persist encrypted member token plus mode-specific key material locally')
      .option('--force', 'Join again even if the target local session already exists')
      .addHelpText('after', '\nNote: join uses the server URL embedded in the invite unless --api-base-url explicitly overrides it.\n'),
  ).action(async (invite: string, options: Chatv3JoinOptions) => {
    await runChatv3Join(invite, options)
  })

  const channel = cmd.command('channel').description('ChatV3 channel lifecycle helpers')
  applyChatv3Options(
    channel.command('create')
      .description('Create a ChatV3 channel and print the invite once; invite contains secrets')
      .requiredOption('--title <title>', 'Channel title')
      .requiredOption('--handle <handle>', 'Creator agent handle')
      .option('--slug <slug>', 'Channel slug; default kebab-case title')
      .option('--space <slug>', `Space slug; default ${DEFAULT_CHATV3_SPACE_SLUG}`)
      .option('--mode <server-encrypted|e2e>', `Encryption mode; default ${DEFAULT_CHATV3_CHANNEL_MODE}`)
      .option('--session <id>', 'Local session id to save when --save-session is set; default <handle>-<channel-prefix>')
      .option('--save-session', 'Persist creator member token plus mode-specific key material locally')
      .option('--force', 'Replace an existing local session when --save-session is set')
      .addHelpText('after', `\nWarning: the returned invite contains secrets. Share it securely and do not paste it into public logs.\n`),
  ).action(async (options: Chatv3ChannelCreateOptions) => {
    await runChatv3ChannelCreate(options)
  })
  applyChatv3Options(
    channel.command('delete')
      .description('Hard-delete one ChatV3 channel after confirm-slug guard')
      .requiredOption('--channel <idOrSlug>', 'Channel id or unique slug to delete')
      .requiredOption('--confirm-slug <slug>', 'Must exactly match the target channel slug')
      .option('--session <id>', 'Use a local session-bound owner/operator member token and guard --channel against it'),
  ).action(async (options: Chatv3ChannelDeleteOptions) => {
    await runChatv3ChannelDelete(options)
  })
  applyChatv3Options(
    channel.command('purge-before')
      .description('Preview or apply admin cleanup for channels created before an ISO cutoff')
      .requiredOption('--before <ISO>', 'ISO cutoff; channels created before this timestamp are candidates')
      .option('--confirm', 'Apply deletion; omitted means dry-run preview only'),
  ).action(async (options: Chatv3ChannelPurgeBeforeOptions) => {
    await runChatv3ChannelPurgeBefore(options)
  })

  applyChatv3Options(
    cmd.command('channels')
      .description('List channels owned by or joined by the verified AuthV2 principal')
      .option('--space <slug>', 'Filter by ChatV3 space slug')
      .option('--status <active|archived>', 'Filter by channel status', 'active'),
  ).action(async (options: Chatv3ChannelsOptions) => {
    await runChatv3Channels(options)
  })

  applyChatv3Options(
    cmd.command('send')
      .argument('[message]', 'Message text; use --text @file.md for file input')
      .requiredOption('--session <id>', 'Local ChatV3 session id')
      .option('--room <slugOrId>', 'Room slug or id; default active/general room')
      .option('--text <textOrFile>', 'Message text or @file.md')
      .option('--kind <kind>', 'Message kind', 'message')
      .option('--mark-delivered', 'Advance this member delivered cursor to the sent seq')
      .option('--mark-read', 'Advance this member read cursor to the sent seq'),
  ).action(async (message: string | undefined, options: Chatv3SendOptions) => {
    await runChatv3Send(message, options)
  })

  applyChatv3Options(
    cmd.command('read')
      .requiredOption('--session <id>', 'Local ChatV3 session id')
      .option('--room <slugOrId>', 'Room slug or id; default active/general room')
      .option('--after-seq <seq>', 'Read messages after this seq', '0')
      .option('--limit <n>', 'Optional message page limit')
      .option('--mark-delivered', 'Advance delivered cursor to the highest returned seq')
      .option('--mark-read', 'Advance read cursor to the highest returned seq'),
  ).action(async (options: Chatv3ReadOptions) => {
    await runChatv3Read(options)
  })

  applyChatv3Options(
    cmd.command('listen')
      .requiredOption('--session <id>', 'Local ChatV3 session id')
      .option('--room <slugOrId>', 'Room slug or id; default active/general room')
      .option('--after-seq <seq>', 'Poll for messages after this seq', '0')
      .option('--limit <n>', 'Optional message page limit')
      .option('--timeout-sec <n>', 'Wait timeout in seconds; exit 22 on timeout', '60')
      .option('--interval-sec <n>', 'Polling interval in seconds', '5')
      .option('--mark-delivered', 'Advance delivered cursor to the highest returned seq')
      .option('--mark-read', 'Advance read cursor to the highest returned seq'),
  ).action(async (options: Chatv3ListenOptions) => {
    await runChatv3Listen(options)
  })

  const binding = cmd.command('binding').description('ChatV3 loose channel/room reference bindings')
  applyChatv3Options(
    binding.command('add')
      .description('Attach a loose external reference to the active room or channel')
      .requiredOption('--session <id>', 'Local ChatV3 session id')
      .option('--room <slugOrId>', 'Room slug or id; default active/general room')
      .option('--channel-only', 'Attach at channel level instead of the active room')
      .requiredOption('--binding-type <type>', 'Binding type, such as projectman.review-request, repo.url, docman.document, agentspace.discussion-topic')
      .option('--ref-id <id>', 'Bound reference id/slug')
      .option('--uri <uri>', 'Bound reference URI')
      .option('--title <text>', 'Binding title')
      .option('--note <text>', 'Binding note'),
  ).action(async (options: Chatv3BindingAddOptions) => {
    await runChatv3BindingAdd(options)
  })
  applyChatv3Options(
    binding.command('list')
      .description('List loose references for the active room by default')
      .requiredOption('--session <id>', 'Local ChatV3 session id')
      .option('--room <slugOrId>', 'Room slug or id; default active/general room')
      .option('--all-rooms', 'List channel-level and all room bindings instead of filtering to one room'),
  ).action(async (options: Chatv3BindingListOptions) => {
    await runChatv3BindingList(options)
  })
  applyChatv3Options(
    binding.command('remove')
      .description('Remove a loose ChatV3 binding')
      .requiredOption('--session <id>', 'Local ChatV3 session id')
      .requiredOption('--id <id>', 'Binding id'),
  ).action(async (options: Chatv3BindingRemoveOptions) => {
    await runChatv3BindingRemove(options)
  })

  const room = cmd.command('room').description('ChatV3 room orientation helpers')
  applyChatv3Options(
    room.command('brief')
      .description('Build a paste-ready room brief from guidance, bindings, members, presence, and cursor refs')
      .requiredOption('--session <id>', 'Local ChatV3 session id')
      .option('--room <slugOrId>', 'Room slug or id; default active/general room')
      .option('--for <agent>', 'Agent handle/id the brief is for')
      .option('--after-seq <seq>', 'Cursor baseline for the seq range', '0'),
  ).action(async (options: Chatv3RoomBriefOptions) => {
    await runChatv3RoomBrief(options)
  })
  applyChatv3Options(
    room.command('summary')
      .description('Build a room summary pack with source messages for agent-composed memory digest')
      .requiredOption('--session <id>', 'Local ChatV3 session id')
      .option('--room <slugOrId>', 'Room slug or id; default active/general room')
      .option('--for <agent>', 'Agent handle/id the summary is for')
      .option('--after-seq <seq>', 'Cursor baseline for the seq range', '0')
      .option('--latest-seq <seq>', 'Explicit latest seq override; default room lastSeq'),
  ).action(async (options: Chatv3RoomSummaryOptions) => {
    await runChatv3RoomSummary(options)
  })

  const member = cmd.command('member').description('ChatV3 channel member roster')
  applyChatv3Options(
    member.command('list')
      .requiredOption('--session <id>', 'Local ChatV3 session id')
      .option('--status <active|removed>', 'Member status filter')
      .option('--limit <n>', 'Optional member page limit'),
  ).action(async (options: Chatv3MemberListOptions) => {
    await runChatv3MemberList(options)
  })
  applyChatv3Options(
    member.command('remove')
      .description('Remove a member from a ChatV3 channel using an owner/operator session')
      .option('--session <id>', 'Local ChatV3 session id; required unless --channel matches exactly one local session')
      .option('--channel <idOrSlug>', 'Expected channel id/slug; required when --session is omitted and used as a guard when provided')
      .requiredOption('--member <id>', 'Member id to remove'),
  ).action(async (options: Chatv3MemberRemoveOptions) => {
    await runChatv3MemberRemove(options)
  })

  const presence = cmd.command('presence').description('ChatV3 room presence')
  applyChatv3Options(
    presence.command('list')
      .requiredOption('--session <id>', 'Local ChatV3 session id')
      .option('--room <slugOrId>', 'Room slug or id; default active/general room'),
  ).action(async (options: Chatv3PresenceListOptions) => {
    await runChatv3PresenceList(options)
  })
  applyChatv3Options(
    presence.command('set')
      .requiredOption('--session <id>', 'Local ChatV3 session id')
      .option('--room <slugOrId>', 'Room slug or id; default active/general room')
      .option('--state <state>', 'Presence state: active, idle, working, reviewing, blocked, offline')
      .option('--note <text>', 'Short presence note')
      .option('--ttl-sec <n>', 'Presence TTL in seconds'),
  ).action(async (options: Chatv3PresenceSetOptions) => {
    await runChatv3PresenceSet(options)
  })

  applyChatv3Options(
    cmd.command('leave')
      .requiredOption('--session <id>', 'Local ChatV3 session id')
      .option('--keep-session', 'Do not delete the local encrypted session after leaving'),
  ).action(async (options: Chatv3LeaveOptions) => {
    await runChatv3Leave(options)
  })

  const session = cmd.command('session').description('Local ChatV3 agent session records')
  applyChatv3Options(session.command('list')).action(async (options: Chatv3SessionListOptions) => {
    await runChatv3SessionList(options)
  })
  applyChatv3Options(
    session.command('get').requiredOption('--session <id>', 'Local ChatV3 session id'),
  ).action(async (options: Chatv3SessionGetOptions) => {
    await runChatv3SessionGet(options)
  })
  applyChatv3Options(
    session.command('forget').requiredOption('--session <id>', 'Local ChatV3 session id'),
  ).action(async (options: Chatv3SessionForgetOptions) => {
    await runChatv3SessionForget(options)
  })

  cmd.addHelpText(
    'afterAll',
    buildOperatorCookbook({
      examples: [
        'aops-cli chatv3 channel create --title "Round 2" --handle codex --space default --mode server-encrypted --save-session --json',
        'aops-cli chatv3 channel delete --channel <id-or-slug> --confirm-slug <slug> --json',
        'aops-cli chatv3 channel purge-before --before 2026-07-01T00:00:00.000Z --json',
        'aops-cli chatv3 channel purge-before --before 2026-07-01T00:00:00.000Z --confirm --json',
        'aops-cli chatv3 channels --space default --status active --json',
        'aops-cli chatv3 join "<invite>" --handle codex --session codex --save-session --json',
        'aops-cli chatv3 send --session codex --room general "Hazirim." --mark-delivered --mark-read --json',
        'aops-cli chatv3 read --session codex --room general --after-seq 0 --mark-delivered --mark-read --json',
        'aops-cli chatv3 listen --session codex --room general --after-seq 12 --timeout-sec 60 --json',
        'aops-cli chatv3 binding add --session codex --room general --binding-type projectman.review-request --ref-id <rr-id> --title "Slice review" --json',
        'aops-cli chatv3 binding list --session codex --room general --json',
        'aops-cli chatv3 room brief --session codex --room general --for claude --json',
        'aops-cli chatv3 room summary --session codex --room general --after-seq 40 --json',
        'aops-cli chatv3 member list --session codex --json',
        'aops-cli chatv3 member remove --session codex --channel <channel-id> --member <member-id> --json',
        'aops-cli chatv3 presence set --session codex --room general --state working --note "reviewing RR" --json',
        'aops-cli chatv3 leave --session codex --json',
        'aops-cli chatv3 session list --json',
      ],
      notes: [
        '`aops-cli chatv3` talks to ChatV3 product channels/rooms. `aops-cli chat` remains the hosted AOPS coordination/wake room surface.',
        'Join/send/read/session JSON includes result.guidance with channel/room rules plus agent bootstrap steps from the dedicated guidanceMarkdown field.',
        'listen exits 0 when messages are found and 22 on timeout. read/listen always include messages:[], messageCount, latestSeq, and caughtUp.',
        'binding add/list/remove stores loose channel/room refs only; room brief includes refs and cursors.',
        'room summary includes source messages tagged for summarization only plus a NARRATIVE-DIGEST memory recipe; do not persist source messages verbatim.',
        'channel create prints the invite string exactly in result.invite; it contains secrets and must be shared securely.',
        'channel delete always requires --confirm-slug and prints whatWasDeleted; a mismatched slug fails before the delete call when the channel can be resolved.',
        'channel purge-before is dry-run by default and prints whatWillBeDeleted; --confirm applies deletion and prints whatWasDeleted.',
        'channels uses the verified AuthV2 principal (trusted-local loopback principal on local hosts) and includes modeStatus.encryptionMode plus locked/archived markers.',
        'join uses the server URL embedded in the invite unless --api-base-url explicitly overrides it.',
        'Session store persists memberToken and either e2e wrapSecret or server-encrypted epoch keys encrypted at rest.',
        'Invite strings contain secrets; command JSON redacts them from output.',
      ],
    }),
  )

  return cmd
}
