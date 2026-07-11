import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Chatv3Client,
  importEpochKey,
  parseInvite,
  type Channel,
  type ChatBinding,
  type ChannelEncryptionMode,
  type ChannelMember,
  type ChannelMineRow,
  type DecryptedMessage,
  type MemberRecoveryResult,
  type MemberRecoveryState,
  type PresenceEntry,
  type Receipt,
  type Room,
  type ServerEpochKeyRow,
  type Space,
} from '@aopslab/domain-product-client-chatv3'
import {
  CockpitChatKeyStore,
  CockpitChatSessionStore,
  type CockpitChatSessionSnapshot,
} from './chat-keystore'
import {
  ensureLocalUserKey,
  hasLocalChannelCrypto,
  hydrateLocalChannelCrypto,
  publishSelfKeyPackage,
  restoreRecoveredChannelCrypto,
  storedChannelCrypto,
  type ChatRecoverySecret,
} from './chat-recovery'

export type ChatRoomRef = {
  id: string
  slug: string
  title: string
  currentEpoch: number
  purpose?: string | null
  guidanceMarkdown?: string | null
}
export type ChatSpaceRef = {
  id?: string
  tenantId?: string
  slug: string
  title: string
  status?: string
  source?: 'local' | 'server'
}
export type ChatChannelRef = {
  id: string
  tenantId: string
  spaceId: string
  spaceSlug: string
  slug: string
  title: string
  status?: string
  archivedAt?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  purpose?: string | null
  guidanceMarkdown?: string | null
  encryptionMode: ChannelEncryptionMode
  invite: string | null
  memberToken: string | null
  membershipStatus?: string | null
  isOwner?: boolean
  canDelete?: boolean
  recoveryState?: MemberRecoveryState | null
  recoveryError?: string | null
  localCryptoAvailable?: boolean
  rooms: ChatRoomRef[]
}
export type ChatStatus = 'idle' | 'connecting' | 'connected' | 'error'

const normalizeRecoveryState = (state: MemberRecoveryResult['recoveryState'] | string): MemberRecoveryState => {
  const normalized = String(state).trim().toLowerCase().replace(/_/g, '-')
  if (
    normalized === 'recoverable' ||
    normalized === 'locked-needs-pin' ||
    normalized === 'locked-needs-invite' ||
    normalized === 'stale-needs-current-device'
  ) {
    return normalized
  }
  return state as MemberRecoveryState
}

const normalizeMemberRecoveryResult = (recovery: MemberRecoveryResult): MemberRecoveryResult => ({
  ...recovery,
  recoveryState: normalizeRecoveryState(recovery.recoveryState),
})

const mergeRecoveryPayload = (
  minted: MemberRecoveryResult,
  inspected: MemberRecoveryResult,
): MemberRecoveryResult => ({
  ...minted,
  recoveryState: normalizeRecoveryState(minted.recoveryState),
  channel: minted.channel ?? inspected.channel,
  member: minted.member ?? inspected.member,
  userKey: minted.userKey ?? inspected.userKey,
  keyPackage: minted.keyPackage ?? inspected.keyPackage,
})

/** Acknowledgement rollup for the most recent directive in the active room. */
export type DirectiveAck = {
  /** seq of the latest directive-kind message. */
  seq: number
  /** members whose ack cursor has reached the latest directive. */
  acked: number
  /** total members counted toward the rollup. */
  total: number
  /** whether the current member has acknowledged the latest directive. */
  mine: boolean
}

export type ChatState = {
  status: ChatStatus
  error: string | null
  channelId: string | null
  channelTitle: string | null
  handle: string | null
  invite: string | null
  spaces: ChatSpaceRef[]
  activeSpaceSlug: string
  channels: ChatChannelRef[]
  rooms: ChatRoomRef[]
  activeRoomId: string | null
  messages: DecryptedMessage[]
  members: ChannelMember[]
  presence: PresenceEntry[]
  receipts: Receipt[]
  bindings: ChatBinding[]
  spaceAdminStatus: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
  spaceAdminError: string | null
}

const EMPTY: ChatState = {
  status: 'idle',
  error: null,
  channelId: null,
  channelTitle: null,
  handle: null,
  invite: null,
  spaces: [],
  activeSpaceSlug: 'default',
  channels: [],
  rooms: [],
  activeRoomId: null,
  messages: [],
  members: [],
  presence: [],
  receipts: [],
  bindings: [],
  spaceAdminStatus: 'idle',
  spaceAdminError: null,
}

const CHAT_SPACES_KEY = 'aops.cockpit.chatv3.spaces.v1'
const DEFAULT_SPACE: ChatSpaceRef = { slug: 'default', title: 'Default Space' }
const chatKeyStore = new CockpitChatKeyStore()
const chatSessionStore = new CockpitChatSessionStore()
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const isServerMemberAuthErrorText = (message: string) => /(member token mismatch|unauthorized|401)/i.test(message)
const isServerMemberAuthError = (error: unknown) => isServerMemberAuthErrorText(errText(error))
const recoveryIssueMessage = (stage: string, error: unknown): string =>
  `ChatV3 auto-recovery failed at ${stage}: ${errText(error)}`
const reportRecoveryIssue = (stage: string, error: unknown): string => {
  const message = recoveryIssueMessage(stage, error)
  console.error('[chatv3 recovery]', stage, error)
  return message
}
const recoveryStageForChannel = (channel: Pick<ChatChannelRef, 'slug' | 'title' | 'id'>, stage: string) =>
  `${stage} (${channel.title || channel.slug || channel.id})`

const RECOVERY_EAGER_CHANNEL_LIMIT = 8

type RecoveryHydrationOptions = {
  preferredChannelId?: string | null
  activeSpaceSlug?: string | null
  lazy?: boolean
  eagerLimit?: number
  stopAfterFirstRestored?: boolean
}

type RecoverChannelOptions = {
  forceServerRecovery?: boolean
}

const channelRecencyMs = (channel: Pick<ChatChannelRef, 'updatedAt' | 'createdAt'>): number => {
  const raw = channel.updatedAt ?? channel.createdAt
  if (!raw) return 0
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

const orderChannelsForRecovery = (
  channels: ChatChannelRef[],
  options: RecoveryHydrationOptions = {},
): ChatChannelRef[] =>
  channels
    .map((channel, index) => ({
      channel,
      index,
      preferred: options.preferredChannelId === channel.id,
      hasLocalAccess: Boolean(channel.memberToken || channel.localCryptoAvailable),
      activeSpace: Boolean(options.activeSpaceSlug && channel.spaceSlug === options.activeSpaceSlug),
      recency: channelRecencyMs(channel),
    }))
    .sort((a, b) => {
      if (a.preferred !== b.preferred) return a.preferred ? -1 : 1
      if (a.activeSpace !== b.activeSpace) return a.activeSpace ? -1 : 1
      if (a.recency !== b.recency) return b.recency - a.recency
      if (a.hasLocalAccess !== b.hasLocalAccess) return a.hasLocalAccess ? -1 : 1
      return a.index - b.index
    })
    .map((item) => item.channel)
export const slugifyName = (v: string) =>
  v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'oda'

const rememberStoredChannelInvite = async (
  client: Chatv3Client,
  channel: Pick<ChatChannelRef, 'id'> & Partial<Pick<ChatChannelRef, 'invite'>>,
) => {
  if (!channel.invite) return
  const parsed = parseInvite(channel.invite)
  if (parsed.channelId !== channel.id) return
  await chatSessionStore.setChannelKeyId(channel.id, parsed.keyId).catch(() => undefined)
  await client.rememberChannelInvite(parsed)
}

const resolveChannelMemberToken = async (
  channel: Pick<ChatChannelRef, 'id'> & Partial<Pick<ChatChannelRef, 'memberToken'>>,
): Promise<string | null> =>
  channel.memberToken ?? chatSessionStore.getChannelMemberToken(channel.id).catch(() => null)

const activateChannelMemberToken = async (
  client: Chatv3Client,
  channel: Pick<ChatChannelRef, 'id'> & Partial<Pick<ChatChannelRef, 'memberToken'>>,
): Promise<string | null> => {
  const memberToken = await resolveChannelMemberToken(channel)
  if (memberToken) client.http.memberToken = memberToken
  return memberToken
}

const hydrateStoredChannelCrypto = async (
  client: Chatv3Client,
  channel: Pick<ChatChannelRef, 'id' | 'tenantId' | 'spaceId'> &
    Partial<Pick<ChatChannelRef, 'encryptionMode' | 'invite' | 'memberToken' | 'rooms'>>,
  rooms: Array<Pick<Room, 'id' | 'currentEpoch'>> = channel.rooms ?? [],
) => {
  await rememberStoredChannelInvite(client, channel)
  const memberToken = await activateChannelMemberToken(client, channel)
  if (!memberToken) return
  if (channel.encryptionMode === 'server-encrypted') {
    const result = await client.epochKeys(channel.id, { tenantId: channel.tenantId || 'default' })
    await importServerEpochKeys(result.keys)
    return
  }
  await hydrateLocalChannelCrypto({ client, channel, rooms }).catch(() => undefined)
}

const normalizeSpace = (space: { id?: string; tenantId?: string; slug: string; title?: string | null; status?: string | null; source?: 'local' | 'server' }): ChatSpaceRef => {
  const slug = slugifyName(space.slug || space.title || DEFAULT_SPACE.slug)
  return {
    ...(space.id ? { id: space.id } : {}),
    ...(space.tenantId ? { tenantId: space.tenantId } : {}),
    slug,
    title: (space.title ?? slug).trim() || slug,
    ...(space.status ? { status: space.status } : {}),
    source: space.source ?? (space.id ? 'server' : 'local'),
  }
}

const normalizeSpaces = (spaces: ChatSpaceRef[]): ChatSpaceRef[] => {
  const map = new Map<string, ChatSpaceRef>()
  for (const space of [DEFAULT_SPACE, ...spaces]) {
    const normalized = normalizeSpace(space)
    map.set(normalized.slug, { ...map.get(normalized.slug), ...normalized })
  }
  return [...map.values()].slice(0, 20)
}

const mergeSpace = (spaces: ChatSpaceRef[], next: ChatSpaceRef): ChatSpaceRef[] =>
  normalizeSpaces([...spaces.filter((space) => space.slug !== next.slug), next])

const toSpaceRef = (space: Pick<Space, 'id' | 'tenantId' | 'slug' | 'title' | 'status'>): ChatSpaceRef =>
  normalizeSpace({
    id: space.id,
    tenantId: space.tenantId,
    slug: space.slug,
    title: space.title,
    status: space.status,
    source: 'server',
  })

const loadStoredSpaces = (): ChatSpaceRef[] => {
  if (typeof window === 'undefined') return [DEFAULT_SPACE]
  try {
    const raw = window.localStorage.getItem(CHAT_SPACES_KEY)
    if (!raw) return [DEFAULT_SPACE]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [DEFAULT_SPACE]
    return normalizeSpaces(
      parsed
        .filter(
          (
            item,
          ): item is {
            id?: string
            tenantId?: string
            slug: string
            title?: string
            status?: string
            source?: 'local' | 'server'
          } => !!item && typeof item.slug === 'string',
        )
        .map((item) => normalizeSpace(item)),
    )
  } catch {
    return [DEFAULT_SPACE]
  }
}

const persistSpaces = (spaces: ChatSpaceRef[]) => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CHAT_SPACES_KEY, JSON.stringify(normalizeSpaces(spaces)))
}

const emptyWithSpaces = (spaces: ChatSpaceRef[], activeSpaceSlug: string): ChatState => ({
  ...EMPTY,
  spaces,
  activeSpaceSlug,
})

const initialChatState = (): ChatState => {
  const spaces = loadStoredSpaces()
  return emptyWithSpaces(spaces, spaces[0]?.slug ?? DEFAULT_SPACE.slug)
}

const toRoomRef = (
  room: Pick<Room, 'id' | 'slug' | 'title' | 'currentEpoch'> & {
    purpose?: string | null
    guidanceMarkdown?: string | null
  },
): ChatRoomRef => ({
  id: room.id,
  slug: room.slug,
  title: room.title,
  currentEpoch: room.currentEpoch,
  purpose: 'purpose' in room ? room.purpose : null,
  guidanceMarkdown: normalizePurpose('guidanceMarkdown' in room ? room.guidanceMarkdown : null),
})

const normalizePurpose = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const defaultChannelRules = (title: string) =>
  [
    `Channel: ${title.trim() || 'chatv3-channel'}`,
    'Purpose: coordinate work in this channel; use rooms for separate conversation streams.',
    'Agent bootstrap: join from invite, save a local session, read the active/general room, send a short ACK, then follow PM/task/review refs instead of treating chat as the truth ledger.',
    'Rules: chat is coordination; PM stores execution and review truth; discuss stores material decisions; do not paste secrets into messages.',
  ].join('\n')

const defaultRoomRules = (title: string) =>
  [
    `Room: ${title.trim() || 'general'}`,
    'Purpose: keep this room focused on its named topic.',
    'Agent bootstrap: read recent messages, mark delivered/read, ACK direct instructions, and resolve PM/RR/doc refs before acting.',
  ].join('\n')

const isSummaryOnlyRoom = (room: ChatRoomRef): boolean =>
  room.slug === 'general' && room.title === 'General' && room.currentEpoch === 0

const mergeChannelRooms = (current: ChatRoomRef[], next: ChatRoomRef[]): ChatRoomRef[] => {
  if (!next.length) return current
  if (!current.length) return next
  if (next.length === 1 && isSummaryOnlyRoom(next[0]) && current.some((room) => room.id === next[0].id)) {
    return current
  }
  return next.map((room) => {
    const existing = current.find((item) => item.id === room.id)
    return existing ? { ...existing, ...room } : room
  })
}

const mergeChannel = (channels: ChatChannelRef[], next: ChatChannelRef): ChatChannelRef[] => {
  const found = channels.some((c) => c.id === next.id)
  return found
    ? channels.map((c) =>
        c.id === next.id
          ? { ...c, ...next, invite: next.invite ?? c.invite, rooms: mergeChannelRooms(c.rooms, next.rooms) }
          : c,
      )
    : [...channels, next]
}

const mergeChannels = (channels: ChatChannelRef[], nextChannels: ChatChannelRef[]): ChatChannelRef[] =>
  nextChannels.reduce((all, next) => mergeChannel(all, next), channels)

const chooseActiveRoomId = (rooms: ChatRoomRef[], preferredRoomId?: string | null): string | null =>
  (preferredRoomId && rooms.some((room) => room.id === preferredRoomId) ? preferredRoomId : null) ??
  rooms[0]?.id ??
  null

const archivedChannelMessage = (channel: Pick<ChatChannelRef, 'slug'>) =>
  `Channel ${channel.slug} is archived on the server. It is shown for orientation, but it cannot be loaded or joined until an owner/operator restores or recreates an active channel.`

const missingMemberTokenMessage = (channel: Pick<ChatChannelRef, 'slug' | 'recoveryState'>) => {
  switch (channel.recoveryState) {
    case 'locked-needs-pin':
      return `Channel ${channel.slug} is tied to your account. Enter your Chat PIN to unlock the local key.`
    case 'stale-needs-current-device':
      return `Channel ${channel.slug} has a stale recovery package. Open it from a current unlocked device to publish a fresh package.`
    case 'recoverable':
      return `Channel ${channel.slug} is recoverable from your account key, but this browser has not finished unlocking it.`
    default:
      return `Channel ${channel.slug} is tied to your account, but this browser does not have the local ChatV3 key yet. Paste an invite once to unlock it.`
  }
}

const persistChannelMemberTokens = (channels: ChatChannelRef[]) => {
  for (const channel of channels) {
    if (channel.memberToken) {
      void chatSessionStore.setChannelMemberToken(channel.id, channel.memberToken).catch(() => undefined)
    }
  }
}

const channelEncryptionMode = (
  channel: Partial<Pick<ChatChannelRef, 'encryptionMode'>> & { encryptionMode?: ChannelEncryptionMode | null },
): ChannelEncryptionMode => (channel.encryptionMode === 'server-encrypted' ? 'server-encrypted' : 'e2e')

const importServerEpochKeys = async (keys: ServerEpochKeyRow[]) => {
  for (const key of keys) {
    await chatKeyStore.setEpochKey(key.roomId, key.epoch, await importEpochKey(key.rawEpochKey))
  }
}

const forgetChannelMemberToken = (channelId: string) => {
  void chatSessionStore.deleteChannelMemberToken(channelId).catch(() => undefined)
  void chatSessionStore.deleteChannelKeyId(channelId).catch(() => undefined)
}

const normalizeStoredChannel = (
  channel: ChatChannelRef | null | undefined,
  memberToken = channel?.memberToken ?? null,
): ChatChannelRef | null => {
  if (!channel?.id || !channel.slug || !memberToken) return null
  const rooms = Array.isArray(channel.rooms)
    ? channel.rooms.filter((room): room is ChatRoomRef => !!room?.id && !!room.slug)
    : []
  return {
    id: channel.id,
    tenantId: channel.tenantId || 'default',
    spaceId: channel.spaceId || 'default',
    spaceSlug: slugifyName(channel.spaceSlug || DEFAULT_SPACE.slug),
    slug: channel.slug,
    title: channel.title || channel.slug,
    ...(channel.status ? { status: channel.status } : {}),
    ...(channel.archivedAt !== undefined ? { archivedAt: channel.archivedAt } : {}),
    ...(channel.createdAt !== undefined ? { createdAt: channel.createdAt } : {}),
    ...(channel.updatedAt !== undefined ? { updatedAt: channel.updatedAt } : {}),
    purpose: normalizePurpose(channel.purpose),
    guidanceMarkdown: normalizePurpose(channel.guidanceMarkdown),
    encryptionMode: channelEncryptionMode(channel),
    invite: channel.invite ?? null,
    memberToken,
    ...(channel.membershipStatus !== undefined ? { membershipStatus: channel.membershipStatus } : {}),
    ...(channel.isOwner !== undefined ? { isOwner: channel.isOwner } : {}),
    ...(channel.canDelete !== undefined ? { canDelete: channel.canDelete } : {}),
    ...(channel.recoveryState !== undefined ? { recoveryState: channel.recoveryState } : {}),
    ...(channel.recoveryError !== undefined ? { recoveryError: channel.recoveryError } : {}),
    ...(channel.localCryptoAvailable !== undefined ? { localCryptoAvailable: channel.localCryptoAvailable } : {}),
    rooms,
  }
}

const normalizeStoredChannels = (channels: ChatChannelRef[] | undefined): ChatChannelRef[] => {
  const map = new Map<string, ChatChannelRef>()
  for (const channel of channels ?? []) {
    const normalized = normalizeStoredChannel(channel)
    if (normalized) map.set(normalized.id, normalized)
  }
  return [...map.values()]
}

const hydrateStoredChannels = async (channels: ChatChannelRef[] | undefined): Promise<ChatChannelRef[]> => {
  const map = new Map<string, ChatChannelRef>()
  for (const channel of channels ?? []) {
    const memberToken =
      channel.memberToken ??
      (channel.id ? await chatSessionStore.getChannelMemberToken(channel.id).catch(() => null) : null)
    const normalized = normalizeStoredChannel(channel, memberToken)
    if (normalized) map.set(normalized.id, normalized)
  }
  return [...map.values()]
}

const toServerChannelRef = (
  channel: Channel,
  space: ChatSpaceRef,
  memberToken: string | null,
  existing?: ChatChannelRef,
): ChatChannelRef => {
  const metadata = channel as Channel & {
    generalRoomId?: string | null
    status?: string | null
    archivedAt?: string | null
    createdAt?: string | null
    updatedAt?: string | null
  }
  const rooms =
    existing?.rooms?.length || !metadata.generalRoomId
      ? existing?.rooms ?? []
      : [
          {
            id: metadata.generalRoomId,
            slug: 'general',
            title: 'General',
            currentEpoch: 0,
            purpose: null,
            guidanceMarkdown: defaultRoomRules('general'),
          },
        ]
  return {
    id: channel.id,
    tenantId: channel.tenantId,
    spaceId: channel.spaceId,
    spaceSlug: space.slug,
    slug: channel.slug,
    title: channel.title || channel.slug,
    ...(metadata.status ? { status: metadata.status } : {}),
    ...(metadata.archivedAt !== undefined ? { archivedAt: metadata.archivedAt } : {}),
    ...(metadata.createdAt !== undefined ? { createdAt: metadata.createdAt } : {}),
    ...(metadata.updatedAt !== undefined ? { updatedAt: metadata.updatedAt } : {}),
    purpose: normalizePurpose(channel.purpose),
    guidanceMarkdown: normalizePurpose(channel.guidanceMarkdown),
    encryptionMode: channel.encryptionMode ?? existing?.encryptionMode ?? 'e2e',
    invite: existing?.invite ?? null,
    memberToken,
    ...(existing?.membershipStatus !== undefined ? { membershipStatus: existing.membershipStatus } : {}),
    ...(existing?.isOwner !== undefined ? { isOwner: existing.isOwner } : {}),
    ...(existing?.canDelete !== undefined ? { canDelete: existing.canDelete } : {}),
    ...(existing?.recoveryState !== undefined ? { recoveryState: existing.recoveryState } : {}),
    ...(existing?.recoveryError !== undefined ? { recoveryError: existing.recoveryError } : {}),
    ...(existing?.localCryptoAvailable !== undefined ? { localCryptoAvailable: existing.localCryptoAvailable } : {}),
    rooms,
  }
}

const toMineChannelRef = (
  row: ChannelMineRow,
  space: ChatSpaceRef,
  memberToken: string | null,
  existing?: ChatChannelRef,
): ChatChannelRef => ({
  ...toServerChannelRef(row.channel, space, memberToken, existing),
  membershipStatus: row.membership?.status ?? null,
  isOwner: row.isOwner,
  canDelete: row.canDelete,
  recoveryState: existing?.recoveryState ?? null,
  recoveryError: existing?.recoveryError ?? null,
  encryptionMode: row.modeStatus?.encryptionMode ?? row.channel.encryptionMode ?? existing?.encryptionMode ?? 'e2e',
  localCryptoAvailable:
    (row.modeStatus?.encryptionMode ?? row.channel.encryptionMode) === 'server-encrypted'
      ? Boolean(memberToken || existing?.localCryptoAvailable)
      : existing?.localCryptoAvailable ?? false,
})

const hydrateLoadableChannelsForSpace = async (
  client: Chatv3Client,
  space: ChatSpaceRef,
  spaces: ChatSpaceRef[],
  existingChannels: ChatChannelRef[],
): Promise<ChatChannelRef[]> => {
  const myChannels = await client
    .listMyChannels({
      tenantId: space.tenantId ?? 'default',
      ...(space.id ? { spaceId: space.id } : {}),
      status: 'active',
      limit: 500,
    })
    .catch(() => null)
  if (myChannels) {
    const hydrated: ChatChannelRef[] = []
    for (const row of myChannels) {
      const existing = existingChannels.find((item) => item.id === row.channel.id)
      const memberToken =
        existing?.memberToken ??
        (await chatSessionStore.getChannelMemberToken(row.channel.id).catch(() => null))
      const localCryptoAvailable =
        (row.modeStatus?.encryptionMode ?? row.channel.encryptionMode) === 'server-encrypted'
          ? Boolean(memberToken || existing?.localCryptoAvailable)
          : await hasLocalChannelCrypto(row.channel.id).catch(() => false)
      const channelSpace = spaces.find((item) => item.id === row.channel.spaceId) ?? space
      const existingWithCrypto = existing ? { ...existing, localCryptoAvailable } : undefined
      hydrated.push(toMineChannelRef(row, channelSpace, memberToken, existingWithCrypto))
    }
    return hydrated
  }

  const live = await client
    .listChannels({
      tenantId: space.tenantId ?? 'default',
      ...(space.id ? { spaceId: space.id } : {}),
      limit: 500,
    })
    .catch(() => [])
  const hydrated: ChatChannelRef[] = []
  for (const channel of live) {
    const existing = existingChannels.find((item) => item.id === channel.id)
    const memberToken =
      existing?.memberToken ?? (await chatSessionStore.getChannelMemberToken(channel.id).catch(() => null))
    const localCryptoAvailable =
      channelEncryptionMode(channel) === 'server-encrypted'
        ? Boolean(memberToken || existing?.localCryptoAvailable)
        : await hasLocalChannelCrypto(channel.id).catch(() => false)
    const channelSpace = spaces.find((item) => item.id === channel.spaceId) ?? space
    const existingWithCrypto = existing ? { ...existing, localCryptoAvailable } : undefined
    hydrated.push(toServerChannelRef(channel, channelSpace, memberToken, existingWithCrypto))
  }
  return hydrated
}

const hydrateLoadableChannelsForSpaces = async (
  client: Chatv3Client,
  spaces: ChatSpaceRef[],
  existingChannels: ChatChannelRef[],
  activeSpaceSlug?: string,
): Promise<ChatChannelRef[]> => {
  const bySlug = new Map(spaces.map((space) => [space.slug, space]))
  const selectedSpaces = new Map<string, ChatSpaceRef>()
  const active = activeSpaceSlug ? bySlug.get(activeSpaceSlug) : null
  if (active) selectedSpaces.set(active.slug, active)
  for (const space of spaces) {
    if (space.id) selectedSpaces.set(space.slug, space)
  }
  const batches = await Promise.all(
    [...selectedSpaces.values()].map((space) =>
      hydrateLoadableChannelsForSpace(client, space, spaces, existingChannels),
    ),
  )
  return mergeChannels([], batches.flat())
}

const selectLockedChannelState = (
  state: ChatState,
  channel: ChatChannelRef,
  channels = state.channels,
): ChatState => ({
  ...state,
  status: 'connected',
  error: null,
  activeSpaceSlug: channel.spaceSlug,
  channelId: channel.id,
  channelTitle: channel.title,
  invite: channel.invite,
  channels: mergeChannel(channels, channel),
  rooms: channel.rooms,
  activeRoomId: null,
  messages: [],
  members: [],
  presence: [],
  receipts: [],
  bindings: [],
})

const sessionSnapshotFromState = (state: ChatState): CockpitChatSessionSnapshot => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  handle: state.handle,
  activeSpaceSlug: state.activeSpaceSlug,
  activeChannelId: state.channelId,
  activeRoomId: state.activeRoomId,
  spaces: normalizeSpaces(state.spaces),
  channels: normalizeStoredChannels(state.channels),
})

const persistChatSession = (state: ChatState) => {
  const snapshot = sessionSnapshotFromState(state)
  persistChannelMemberTokens(snapshot.channels)
  if (!snapshot.channels.length) {
    void chatSessionStore.clear().catch(() => undefined)
    return
  }
  void chatSessionStore.set(snapshot).catch(() => undefined)
}

const clearChatSession = () => {
  void chatSessionStore.clear().catch(() => undefined)
}

/**
 * Read the FULL room timeline by paging forward on `afterSeq`. A single
 * `client.readText(room)` only returns the server's first page (~100 messages),
 * so without paging the cockpit silently hides everything past the ~100th
 * message (the 20:38 cutoff bug). Loop until a page comes back empty; advance
 * the cursor by the highest seq seen so unordered pages can't stall it. The
 * 1000-iteration guard caps a misbehaving server at ~100k messages.
 */
const readFullTimeline = async (
  client: Chatv3Client,
  room: ChatRoomRef,
): Promise<DecryptedMessage[]> => {
  const all: DecryptedMessage[] = []
  let afterSeq = 0
  for (let guard = 0; guard < 1000; guard += 1) {
    const page = await client.readText(room, afterSeq)
    if (!page.length) break
    all.push(...page)
    const maxSeq = page.reduce((m, x) => (x.seq > m ? x.seq : m), afterSeq)
    if (maxSeq <= afterSeq) break // no forward progress — stop to avoid a loop
    afterSeq = maxSeq
  }
  return all
}

function normalizeCredentialHeaderName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isCredentialHeaderName(name: string): boolean {
  const normalized = normalizeCredentialHeaderName(name)
  return normalized.includes('authorization') ||
    normalized.includes('cookie') ||
    normalized.includes('session') ||
    normalized.endsWith('token') ||
    normalized.includes('accesstoken') ||
    normalized.includes('apikey') ||
    normalized.includes('password') ||
    normalized.includes('secret')
}

function isLoopbackFetchHostname(value: string): boolean {
  const hostname = value.toLowerCase()
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname)
  if (!match) return false
  const octets = match.slice(1).map(Number)
  return octets[0] === 127 && octets.every((octet) => octet >= 0 && octet <= 255)
}

function normalizeCredentialQueryKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isCredentialQueryKey(name: string): boolean {
  const normalized = normalizeCredentialQueryKey(name)
  return normalized.includes('authorization') ||
    normalized.includes('cookie') ||
    normalized.includes('session') ||
    normalized.endsWith('token') ||
    normalized.includes('apikey') ||
    normalized.includes('password') ||
    normalized.includes('secret') ||
    normalized.includes('credential') ||
    normalized.includes('bearer') ||
    normalized.includes('csrf') ||
    normalized.includes('xsrf') ||
    normalized === 'jwt' ||
    normalized.endsWith('jwt')
}

function normalizeTrustedServerBaseUrl(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('community_cockpit_trusted_server_base_rejected')
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    !isLoopbackFetchHostname(parsed.hostname)
  ) {
    throw new Error('community_cockpit_trusted_server_base_rejected')
  }
  return parsed
}

function assertTrustedFetchTarget(
  input: RequestInfo | URL,
  trustedServerBaseUrl: URL,
  allowedPathPrefix: string
): void {
  const raw = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('community_cockpit_trusted_fetch_target_rejected')
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username ||
    parsed.password ||
    parsed.origin !== trustedServerBaseUrl.origin ||
    parsed.hash ||
    (parsed.pathname !== allowedPathPrefix.slice(0, -1) && !parsed.pathname.startsWith(allowedPathPrefix))
  ) {
    throw new Error('community_cockpit_trusted_fetch_target_rejected')
  }
  for (const name of parsed.searchParams.keys()) {
    if (isCredentialQueryKey(name)) {
      throw new Error('community_cockpit_credential_query_rejected')
    }
  }
}

function mergeTrustedFetchHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  for (const [name, value] of new Headers(init?.headers)) headers.set(name, value)
  return headers
}

function normalizeChatv3MemberHeader(value: string): string | null {
  const trimmed = value.trim()
  const raw = /^Bearer\s+/i.test(trimmed) ? trimmed.replace(/^Bearer\s+/i, '') : trimmed
  return /^cv3m_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_[A-Za-z0-9_-]{16,}$/.test(raw)
    ? 'Bearer ' + raw
    : null
}

function chatv3TrustedFetch(serverBaseUrl: string): typeof fetch {
  const trustedServerBaseUrl = normalizeTrustedServerBaseUrl(serverBaseUrl)
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    assertTrustedFetchTarget(input, trustedServerBaseUrl, '/api/chatv3/v1/')
    const headers = mergeTrustedFetchHeaders(input, init)
    const authorization = headers.get('authorization')
    const memberHeader = 'x-chatv3-member-token'
    const dedicatedMember = headers.get(memberHeader)
    const normalizedDedicated = dedicatedMember === null ? null : normalizeChatv3MemberHeader(dedicatedMember)
    if (dedicatedMember !== null && normalizedDedicated === null) {
      throw new Error('community_cockpit_invalid_chatv3_member_token')
    }
    const normalizedAuthorization = authorization === null ? null : normalizeChatv3MemberHeader(authorization)
    const memberCredential = normalizedDedicated ?? normalizedAuthorization
    for (const name of [...headers.keys()]) {
      if (isCredentialHeaderName(name)) headers.delete(name)
    }
    if (memberCredential) headers.set(memberHeader, memberCredential)
    const request = new Request(input, {
      ...init,
      headers,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
    return fetch(request, {
      headers,
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    })
  }
}
/**
 * Cockpit chat session: wraps one Chatv3Client over the SDK's create/join +
 * F2a read/lifecycle methods. Server-blind crypto is the SDK's; this hook only
 * orchestrates connect → load members (cache for sender identity) → per-room
 * timeline/presence/receipts with SSE-driven refresh + a presence-TTL poll.
 */
export function useChatSession(
  serverBaseUrl: string,
  opts: {
    adminEnabled?: boolean
    principalUserId?: string | null
    tenantId?: string | null
    recoverySecret?: ChatRecoverySecret | null
    onRecoverySecretConsumed?: () => void
  } = {},
) {
  const clientRef = useRef<Chatv3Client | null>(null)
  // Highest delivered/read cursor already POSTed per room, so the SSE + 5s poll
  // refresh loop does not re-send idempotent cursor writes when nothing advanced
  // (RR b4a386fb non-blocking note).
  const cursorSentRef = useRef<Record<string, number>>({})
  const [state, setState] = useState<ChatState>(() => initialChatState())
  const stateRef = useRef<ChatState>(state)
  const recoverySecretRef = useRef<ChatRecoverySecret | null>(opts.recoverySecret ?? null)
  const autoServerRecoveryRef = useRef<Record<string, boolean>>({})

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    recoverySecretRef.current = opts.recoverySecret ?? null
  }, [opts.recoverySecret])

  const ensureClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new Chatv3Client({
        serverBaseUrl,
        fetchImpl: chatv3TrustedFetch(serverBaseUrl),
        keyStore: chatKeyStore,
      })
    }
    return clientRef.current
  }, [serverBaseUrl])

  const recoverChannelIfPossible = useCallback(
    async (
      channel: ChatChannelRef,
      secret: ChatRecoverySecret | null = recoverySecretRef.current,
      options: RecoverChannelOptions = {},
    ): Promise<ChatChannelRef> => {
      if (channel.status === 'archived') return channel
      const client = ensureClient()
      const tenantId = channel.tenantId || opts.tenantId || 'default'
      const [storedMemberToken, e2eLocalCryptoAvailable] = await Promise.all([
        chatSessionStore.getChannelMemberToken(channel.id).catch(() => null),
        hasLocalChannelCrypto(channel.id).catch(() => false),
      ])
      const currentChannelToken =
        stateRef.current.channelId === channel.id && client.http.memberToken ? client.http.memberToken : null
      const localMemberToken = channel.memberToken ?? storedMemberToken ?? currentChannelToken
      if (channel.encryptionMode === 'server-encrypted') {
        const previousMemberToken = client.http.memberToken
        const restorePreviousAfterSuccess = Boolean(
          previousMemberToken &&
            stateRef.current.channelId &&
            stateRef.current.channelId !== channel.id,
        )
        try {
          if (options.forceServerRecovery) client.http.memberToken = undefined
          const memberToken = options.forceServerRecovery
            ? (await client.remintMemberToken(channel.id, { tenantId })).memberToken
            : localMemberToken ?? (await client.remintMemberToken(channel.id, { tenantId })).memberToken
          client.http.memberToken = memberToken
          await chatSessionStore.setChannelMemberToken(channel.id, memberToken).catch(() => undefined)
          const result = await client.epochKeys(channel.id, { tenantId })
          await importServerEpochKeys(result.keys)
          if (restorePreviousAfterSuccess) client.http.memberToken = previousMemberToken
          return {
            ...channel,
            memberToken,
            recoveryState: null,
            recoveryError: null,
            localCryptoAvailable: true,
          }
        } catch (error) {
          client.http.memberToken = previousMemberToken ?? undefined
          return {
            ...channel,
            recoveryState: 'locked-needs-invite',
            recoveryError: reportRecoveryIssue(recoveryStageForChannel(channel, 'server-encrypted.auto-access'), error),
            localCryptoAvailable: false,
          }
        }
      }
      const localCryptoAvailable = e2eLocalCryptoAvailable
      if (!opts.principalUserId) return channel
      if (localCryptoAvailable && localMemberToken) {
        await chatSessionStore.setChannelMemberToken(channel.id, localMemberToken).catch(() => undefined)
        if (stateRef.current.channelId === channel.id) {
          client.http.memberToken = localMemberToken
          await hydrateLocalChannelCrypto({ client, channel }).catch(() => undefined)
        }
        return { ...channel, memberToken: localMemberToken, recoveryState: null, recoveryError: null, localCryptoAvailable: true }
      }
      if (channel.memberToken) {
        return { ...channel, recoveryError: null, localCryptoAvailable }
      }
      let recovery: MemberRecoveryResult | null = null
      try {
        recovery = normalizeMemberRecoveryResult(
          await client.getMemberRecovery({ tenantId, channelId: channel.id, mintToken: false }),
        )
      } catch (error) {
        return {
          ...channel,
          recoveryState: channel.recoveryState ?? null,
          recoveryError: reportRecoveryIssue(recoveryStageForChannel(channel, 'recovery.inspect'), error),
          localCryptoAvailable,
        }
      }
      if (localCryptoAvailable && !options.forceServerRecovery) {
        return { ...channel, recoveryState: null, recoveryError: null, localCryptoAvailable: true }
      }
      if (recovery.recoveryState !== 'recoverable') {
        const recoveryError =
          recovery.recoveryState === 'locked-needs-invite' && recovery.userKey
            ? recoveryIssueMessage(
                recoveryStageForChannel(channel, 'recovery.inspect'),
                new Error('no member key-package was available for this account key'),
              )
            : null
        return { ...channel, recoveryState: recovery.recoveryState, recoveryError }
      }

      const localUserKey = await ensureLocalUserKey({
        client,
        tenantId,
        principalUserId: opts.principalUserId,
        secret: null,
      }).catch(() => null)
      if (!localUserKey?.localKey && recovery.userKey?.kekSource === 'chat-pin' && !secret) {
        return { ...channel, recoveryState: 'locked-needs-pin', recoveryError: null }
      }
      if (!localUserKey?.localKey && !secret) {
        const recoveryError =
          recovery.userKey?.kekSource === 'password-kdf'
            ? reportRecoveryIssue(
                recoveryStageForChannel(channel, 'account-key.unlock'),
                new Error('login password is no longer available for password-kdf recovery'),
              )
            : null
        return { ...channel, recoveryState: 'recoverable', recoveryError }
      }

      try {
        const minted = mergeRecoveryPayload(
          normalizeMemberRecoveryResult(
            await client.getMemberRecovery({ tenantId, channelId: channel.id, mintToken: true }),
          ),
          recovery,
        )
        const restored = await restoreRecoveredChannelCrypto({
          client,
          tenantId,
          principalUserId: opts.principalUserId,
          channel,
          recovery: minted,
          secret,
        })
        if (!restored) {
          return {
            ...channel,
            recoveryState: minted.recoveryState,
            recoveryError: reportRecoveryIssue(
              recoveryStageForChannel(channel, 'recovery.restore'),
              new Error('recoverable recovery did not include a usable member token and key-package'),
            ),
          }
        }
        return {
          ...channel,
          memberToken: restored.memberToken,
          recoveryState: null,
          recoveryError: null,
          localCryptoAvailable: true,
        }
      } catch (error) {
        return {
          ...channel,
          recoveryState: recovery.recoveryState,
          recoveryError: reportRecoveryIssue(recoveryStageForChannel(channel, 'recovery.restore'), error),
        }
      }
    },
    [ensureClient, opts.principalUserId, opts.tenantId],
  )

  const hydrateRecoveryForChannels = useCallback(
    async (channels: ChatChannelRef[], options: RecoveryHydrationOptions = {}): Promise<ChatChannelRef[]> => {
      const nextById = new Map(channels.map((channel) => [channel.id, channel]))
      const orderedChannels = orderChannelsForRecovery(channels, options)
      const secret = recoverySecretRef.current
      let restoredWithLoginSecret = false
      let attempted = 0
      const eagerLimit = Math.max(0, options.eagerLimit ?? RECOVERY_EAGER_CHANNEL_LIMIT)
      for (const channel of orderedChannels) {
        const isPreferred = options.preferredChannelId === channel.id
        const hasLocalAccess = Boolean(channel.memberToken || channel.localCryptoAvailable)
        const shouldAttempt =
          channel.encryptionMode === 'server-encrypted'
            ? !options.lazy || isPreferred || hasLocalAccess
            : !options.lazy || isPreferred || hasLocalAccess || attempted < eagerLimit
        if (!shouldAttempt) continue
        const beforeHadToken = Boolean(channel.memberToken)
        const recovered = await recoverChannelIfPossible(channel, secret)
        if (!hasLocalAccess) attempted += 1
        nextById.set(channel.id, recovered)
        if (secret?.source === 'password' && !beforeHadToken && Boolean(recovered.memberToken)) {
          restoredWithLoginSecret = true
        }
        if (options.stopAfterFirstRestored && !beforeHadToken && Boolean(recovered.memberToken)) break
      }
      if (restoredWithLoginSecret) opts.onRecoverySecretConsumed?.()
      return channels.map((channel) => nextById.get(channel.id) ?? channel)
    },
    [opts.onRecoverySecretConsumed, recoverChannelIfPossible],
  )

  const publishAndVerifySelfKeyPackage = useCallback(
    async (params: {
      client: Chatv3Client
      channel: Pick<Channel, 'id' | 'tenantId' | 'spaceId'>
      member: (ChannelMember & { userId?: string | null }) | null | undefined
      keyId: string | null
      wrapSecret: string | null
      sourceEpoch: number
      required: boolean
    }): Promise<boolean> => {
      const fail = (stage: string, error: unknown): false => {
        const message = reportRecoveryIssue(stage, error)
        if (params.required) throw new Error(message)
        return false
      }
      if (!opts.principalUserId) {
        return params.required
          ? fail('self-key-package.principal', new Error('auth principal is required before self key-package publish'))
          : false
      }
      if (!params.member?.id) {
        return params.required
          ? fail('self-key-package.member', new Error('current channel member is required before self key-package publish'))
          : false
      }
      if (!params.keyId || !params.wrapSecret) {
        return params.required
          ? fail('self-key-package.crypto', new Error('channel key id and wrap secret are required before self key-package publish'))
          : false
      }

      let userKeyReady = false
      try {
        const ensured = await ensureLocalUserKey({
          client: params.client,
          tenantId: params.channel.tenantId,
          principalUserId: opts.principalUserId,
          secret: recoverySecretRef.current,
        })
        userKeyReady = Boolean(ensured.userKey)
      } catch (error) {
        return fail('self-key-package.account-key.register', error)
      }
      if (!userKeyReady) {
        return params.required
          ? fail(
              'self-key-package.account-key.register',
              new Error('account user-key is not registered; login password or Chat PIN is required before publishing self key-package'),
            )
          : false
      }

      let published = false
      try {
        published = await publishSelfKeyPackage({
          client: params.client,
          tenantId: params.channel.tenantId,
          principalUserId: opts.principalUserId,
          secret: recoverySecretRef.current,
          channel: params.channel,
          member: params.member,
          keyId: params.keyId,
          wrapSecret: params.wrapSecret,
          sourceEpoch: params.sourceEpoch,
        })
      } catch (error) {
        return fail('self-key-package.publish', error)
      }
      if (!published) {
        return fail('self-key-package.publish', new Error('no self key-package was published for the current member'))
      }

      try {
        const recovery = normalizeMemberRecoveryResult(
          await params.client.getMemberRecovery({
            tenantId: params.channel.tenantId,
            channelId: params.channel.id,
            mintToken: false,
          }),
        )
        if (recovery.recoveryState !== 'recoverable' || !recovery.keyPackage) {
          return fail(
            'self-key-package.verify',
            new Error(`self key-package verification returned ${recovery.recoveryState}`),
          )
        }
      } catch (error) {
        return fail('self-key-package.verify', error)
      }

      return true
    },
    [opts.principalUserId],
  )

  const refreshRoom = useCallback(async (roomId: string) => {
    const client = clientRef.current
    if (!client) return
    const room = state.rooms.find((r) => r.id === roomId)
    const channelId = state.channelId
    const channel = state.channels.find((c) => c.id === channelId)
    if (!room || !channelId) return
    const readSnapshot = async (activeChannel: ChatChannelRef | undefined) => {
      if (activeChannel) {
        await activateChannelMemberToken(client, activeChannel)
        await hydrateLocalChannelCrypto({ client, channel: activeChannel, rooms: [room] }).catch(() => undefined)
      }
      // Refresh members alongside the timeline so a sender who joined AFTER this
      // client connected still resolves to handle/actorKind instead of a member-id
      // fallback (RR 052a6ec9 two-member finding). listMembers also refreshes the
      // SDK's resolve cache; keep prior members if the call fails.
      const [messages, presence, receipts, members, bindings] = await Promise.all([
        readFullTimeline(client, room),
        client.listPresence(roomId),
        client.getReceipts(roomId),
        client.listMembers(channelId).catch(() => null),
        client
          .listBindings(channelId)
          .then((rows) => rows.filter((binding) => !binding.roomId || binding.roomId === roomId))
          .catch(() => []),
      ])
      return { messages, presence, receipts, members, bindings }
    }
    const commitSnapshot = async (
      snapshot: Awaited<ReturnType<typeof readSnapshot>>,
      recoveredChannel?: ChatChannelRef,
    ) => {
      setState((s) =>
        s.activeRoomId === roomId
          ? {
              ...s,
              channels: recoveredChannel ? mergeChannel(s.channels, recoveredChannel) : s.channels,
              messages: snapshot.messages,
              presence: snapshot.presence,
              receipts: snapshot.receipts,
              bindings: snapshot.bindings,
              ...(snapshot.members ? { members: snapshot.members } : {}),
              error: null,
            }
          : s,
      )
      const top = snapshot.messages.length ? snapshot.messages[snapshot.messages.length - 1].seq : 0
      if (top > 0 && top > (cursorSentRef.current[roomId] ?? 0)) {
        // Only when the cursor actually advances: mark delivered before read
        // (delivered <= read) so receipts expose a full delivered/read pair for
        // the timeline + inspector, without re-POSTing on every idle refresh.
        cursorSentRef.current[roomId] = top
        await client.markDelivered(roomId, top).catch(() => undefined)
        await client.markRead(roomId, top).catch(() => undefined)
      }
    }
    try {
      await commitSnapshot(await readSnapshot(channel))
    } catch (e) {
      if (channel?.encryptionMode === 'server-encrypted' && isServerMemberAuthError(e)) {
        const recovered = await recoverChannelIfPossible(channel, recoverySecretRef.current, { forceServerRecovery: true })
        if (recovered.memberToken) {
          await commitSnapshot(await readSnapshot(recovered), recovered)
          return
        }
      }
      setState((s) => (s.activeRoomId === roomId ? { ...s, error: errText(e) } : s))
    }
  }, [state.rooms, state.channelId, state.channels, recoverChannelIfPossible])

  const loadChannel = useCallback(
    async (channel: ChatChannelRef, preferredRoomId?: string | null) => {
      const client = ensureClient()
      if (channel.status === 'archived') throw new Error(archivedChannelMessage(channel))
      if (!channel.memberToken) throw new Error(missingMemberTokenMessage(channel))
      await rememberStoredChannelInvite(client, channel).catch(() => undefined)
      await activateChannelMemberToken(client, channel)
      const [liveRooms, members] = await Promise.all([
        client.listRooms(channel.id, { status: 'active' }).catch((error) => {
          if (channel.encryptionMode === 'server-encrypted' && isServerMemberAuthError(error)) throw error
          return channel.rooms
        }),
        client.listMembers(channel.id).catch((error) => {
          if (channel.encryptionMode === 'server-encrypted' && isServerMemberAuthError(error)) throw error
          return []
        }),
      ])
      const rooms = liveRooms.map(toRoomRef)
      await hydrateStoredChannelCrypto(client, { ...channel, rooms }, rooms)
      const activeRoomId = chooseActiveRoomId(rooms, preferredRoomId)
      const selfMember = members.find((member) => {
        const withUser = member as ChannelMember & { userId?: string | null }
        return (opts.principalUserId && withUser.userId === opts.principalUserId) || member.handle === stateRef.current.handle
      }) as (ChannelMember & { userId?: string | null }) | undefined
      if (selfMember && channel.encryptionMode !== 'server-encrypted') {
        try {
          const crypto = await storedChannelCrypto(channel.id)
          await publishAndVerifySelfKeyPackage({
            client,
            channel,
            member: selfMember,
            keyId: crypto.keyId,
            wrapSecret: crypto.wrapSecret,
            sourceEpoch: rooms.reduce((max, room) => Math.max(max, room.currentEpoch), 1),
            required: false,
          })
        } catch (error) {
          reportRecoveryIssue('self-key-package.load', error)
        }
      }
      const liveChannel = await client.getChannel(channel.id).catch(() => null)
      return { rooms, members, activeRoomId, channel: liveChannel }
    },
    [ensureClient, opts.principalUserId, publishAndVerifySelfKeyPackage],
  )

  const selectedRecoveryChannel = state.channelId
    ? state.channels.find((item) => item.id === state.channelId) ?? null
    : null

  useEffect(() => {
    const channel = selectedRecoveryChannel
    if (
      !channel ||
      channel.memberToken ||
      channel.encryptionMode !== 'server-encrypted' ||
      channel.status === 'archived' ||
      autoServerRecoveryRef.current[channel.id]
    ) {
      return
    }
    autoServerRecoveryRef.current[channel.id] = true
    let cancelled = false
    void (async () => {
      const recovered = await recoverChannelIfPossible(channel, recoverySecretRef.current, { forceServerRecovery: true })
      if (cancelled) return
      if (!recovered.memberToken) {
        setState((s) =>
          s.channelId === channel.id ? selectLockedChannelState(s, recovered, mergeChannel(s.channels, recovered)) : s,
        )
        return
      }
      const loaded = await loadChannel(recovered)
      if (cancelled) return
      setState((s) => {
        if (s.channelId !== channel.id) return s
        const nextChannel = { ...recovered, rooms: loaded.rooms }
        const next: ChatState = {
          ...s,
          status: 'connected',
          error: null,
          channelId: recovered.id,
          channelTitle: recovered.title,
          invite: recovered.invite,
          activeSpaceSlug: recovered.spaceSlug,
          channels: mergeChannel(s.channels, nextChannel),
          rooms: loaded.rooms,
          activeRoomId: loaded.activeRoomId,
          messages: [],
          members: loaded.members,
          presence: [],
          receipts: [],
          bindings: [],
        }
        persistChatSession(next)
        return next
      })
    })().catch((error) => {
      if (cancelled) return
      const recoveryError = errText(error)
      setState((s) =>
        s.channelId === channel.id
          ? selectLockedChannelState(
              s,
              { ...channel, recoveryError },
              mergeChannel(s.channels, { ...channel, recoveryError }),
            )
          : s,
      )
    })
    return () => {
      cancelled = true
    }
  }, [
    state.channelId,
    selectedRecoveryChannel?.id,
    selectedRecoveryChannel?.encryptionMode,
    selectedRecoveryChannel?.status,
    recoverChannelIfPossible,
    loadChannel,
  ])

  useEffect(() => {
    let alive = true
    void (async () => {
      const snapshot = await chatSessionStore.get().catch(() => null)
      if (!alive || (snapshot && snapshot.version !== 1)) return
      const client = ensureClient()
      const spaces = normalizeSpaces([...(snapshot?.spaces ?? []), ...loadStoredSpaces()])
      const storedChannels = await hydrateStoredChannels(snapshot?.channels)
      const snapshotActiveSpaceSlug = snapshot?.activeSpaceSlug ?? spaces[0]?.slug ?? DEFAULT_SPACE.slug
      const activeSpaceSlug =
        spaces.some((space) => space.slug === snapshotActiveSpaceSlug)
          ? snapshotActiveSpaceSlug
          : storedChannels[0]?.spaceSlug ?? DEFAULT_SPACE.slug
      const serverChannels = await hydrateLoadableChannelsForSpaces(client, spaces, storedChannels, activeSpaceSlug)
      const preferredChannelId = snapshot?.activeChannelId ?? null
      const channels = await hydrateRecoveryForChannels(mergeChannels(storedChannels, serverChannels), {
        preferredChannelId,
        activeSpaceSlug,
        lazy: true,
        stopAfterFirstRestored: true,
      })
      if (!channels.length) return
      const orderedChannels = orderChannelsForRecovery(channels, { preferredChannelId, activeSpaceSlug })
      const loadableChannels = orderedChannels.filter((item) => item.memberToken)
      const channel =
        loadableChannels.find((item) => item.id === snapshot?.activeChannelId) ??
        loadableChannels.find((item) => item.spaceSlug === activeSpaceSlug) ??
        loadableChannels[0] ??
        orderedChannels[0] ??
        channels[0]
      if (!channel) return

      setState((s) => ({
        ...s,
        status: 'connecting',
        error: null,
        spaces,
        activeSpaceSlug,
        channels,
      }))
      if (!channel.memberToken) {
        setState((s) => selectLockedChannelState({ ...s, spaces, activeSpaceSlug }, channel, channels))
        return
      }
      try {
        const loaded = await loadChannel(channel, snapshot?.activeRoomId)
        if (!alive) return
        const nextChannel = {
          ...channel,
          ...(loaded.channel
            ? {
                title: loaded.channel.title,
                purpose: loaded.channel.purpose,
                guidanceMarkdown: normalizePurpose(loaded.channel.guidanceMarkdown),
              }
            : {}),
          rooms: loaded.rooms,
        }
        setState((s) => {
          const next: ChatState = {
            ...s,
            status: 'connected',
            error: null,
            channelId: nextChannel.id,
            channelTitle: nextChannel.title,
            handle: snapshot?.handle ?? null,
            invite: nextChannel.invite,
            spaces,
            activeSpaceSlug: nextChannel.spaceSlug,
            channels: mergeChannel(channels, nextChannel),
            rooms: loaded.rooms,
            activeRoomId: loaded.activeRoomId,
            messages: [],
            members: loaded.members,
            presence: [],
            receipts: [],
            bindings: [],
          }
          persistChatSession(next)
          return next
        })
      } catch (e) {
        if (!alive) return
        setState((s) => ({
          ...s,
          status: 'error',
          error: `Session restore failed: ${errText(e)}`,
          spaces,
          activeSpaceSlug,
          channels,
        }))
      }
    })()
    return () => {
      alive = false
    }
  }, [ensureClient, hydrateRecoveryForChannels, loadChannel])

  const afterConnect = useCallback(
    async (
      channel: Pick<Channel, 'id' | 'tenantId' | 'spaceId' | 'slug'> & {
        title?: string
        purpose?: string | null
        guidanceMarkdown?: string | null
        encryptionMode?: ChannelEncryptionMode
      },
      handle: string,
      rooms: ChatRoomRef[],
      invite: string | null,
      spaceHint: ChatSpaceRef,
      memberTokenHint?: string | null,
    ) => {
      const client = ensureClient()
      const connectedMemberToken =
        memberTokenHint ??
        client.http.memberToken ??
        (await chatSessionStore.getChannelMemberToken(channel.id).catch(() => null))
      if (connectedMemberToken) {
        client.http.memberToken = connectedMemberToken
        await chatSessionStore.setChannelMemberToken(channel.id, connectedMemberToken).catch(() => undefined)
      }
      let members: ChannelMember[] = []
      try {
        if (connectedMemberToken) client.http.memberToken = connectedMemberToken
        members = await client.listMembers(channel.id)
      } catch {
        members = []
      }
      // Prefer the server's authoritative active-room roster (S3.3) so the
      // sidebar reflects real lifecycle (archived rooms drop, currentEpoch is
      // server-fresh). Fall back to the create/join rooms if the call fails or
      // returns nothing, so connect never lands room-less.
      let roster = rooms
      try {
        if (connectedMemberToken) client.http.memberToken = connectedMemberToken
        const live = await client.listRooms(channel.id, { status: 'active' })
        if (live.length) {
          roster = live.map(toRoomRef)
        }
      } catch {
        /* keep create/join roster */
      }
      const mineRow = await client
        .listMyChannels({
          tenantId: channel.tenantId,
          spaceId: channel.spaceId,
          status: 'active',
          limit: 500,
        })
        .then((rows) => rows.find((row) => row.channel.id === channel.id) ?? null)
        .catch(() => null)
      const inviteCrypto = invite
        ? (() => {
            try {
              return parseInvite(invite)
            } catch {
              return null
            }
          })()
        : null
      if (inviteCrypto) {
        await chatSessionStore.setChannelKeyId(channel.id, inviteCrypto.keyId).catch(() => undefined)
      }
      const encryptionMode = channel.encryptionMode ?? inviteCrypto?.mode ?? 'e2e'
      const storedCrypto =
        encryptionMode === 'e2e'
          ? inviteCrypto && inviteCrypto.mode === 'e2e'
            ? { keyId: inviteCrypto.keyId, wrapSecret: inviteCrypto.wrapSecret }
            : await storedChannelCrypto(channel.id)
          : { keyId: inviteCrypto?.keyId ?? null, wrapSecret: null }
      if (connectedMemberToken) client.http.memberToken = connectedMemberToken
      await hydrateStoredChannelCrypto(
        client,
        {
          ...channel,
          encryptionMode,
          invite,
          memberToken: connectedMemberToken,
          rooms: roster,
        },
        roster,
      ).catch(() => undefined)
      if (connectedMemberToken) client.http.memberToken = connectedMemberToken
      const selfMember =
        (mineRow?.membership as (ChannelMember & { userId?: string | null }) | null | undefined) ??
        (members.find((member) => member.handle === handle) as (ChannelMember & { userId?: string | null }) | undefined)
      const sourceEpoch = roster.reduce((max, room) => Math.max(max, room.currentEpoch), 1)
      const selfPackageTask =
        encryptionMode === 'e2e' && opts.principalUserId && connectedMemberToken && storedCrypto.wrapSecret
          ? {
              memberToken: connectedMemberToken,
              member: selfMember,
              keyId: storedCrypto.keyId,
              wrapSecret: storedCrypto.wrapSecret,
              sourceEpoch,
            }
          : null
      const firstRoom = roster[0] ?? null
      if (connectedMemberToken) {
        client.http.memberToken = connectedMemberToken
        await chatSessionStore.setChannelMemberToken(channel.id, connectedMemberToken).catch(() => undefined)
      }
      const sessionChannel: ChatChannelRef = {
        id: channel.id,
        tenantId: channel.tenantId,
        spaceId: channel.spaceId,
        spaceSlug: spaceHint.slug,
        slug: channel.slug,
        title: channel.title ?? channel.slug,
        purpose: normalizePurpose('purpose' in channel ? channel.purpose : null),
        guidanceMarkdown: normalizePurpose('guidanceMarkdown' in channel ? channel.guidanceMarkdown : null),
        encryptionMode,
        invite,
        memberToken: connectedMemberToken ?? null,
        ...(mineRow?.membership?.status !== undefined ? { membershipStatus: mineRow.membership.status } : {}),
        ...(mineRow ? { isOwner: mineRow.isOwner, canDelete: mineRow.canDelete } : {}),
        localCryptoAvailable:
          encryptionMode === 'server-encrypted'
            ? Boolean(connectedMemberToken)
            : Boolean(storedCrypto.keyId && storedCrypto.wrapSecret),
        rooms: roster,
      }
      setState((s) => {
        const next: ChatState = {
          ...s,
          status: 'connected',
          error: null,
          channelId: channel.id,
          channelTitle: sessionChannel.title,
          handle,
          invite,
          spaces: mergeSpace(s.spaces, spaceHint),
          activeSpaceSlug: spaceHint.slug,
          channels: mergeChannel(s.channels, sessionChannel),
          rooms: roster,
          activeRoomId: firstRoom?.id ?? null,
          messages: [],
          members,
          presence: [],
          receipts: [],
          bindings: [],
        }
        persistSpaces(next.spaces)
        persistChatSession(next)
        return next
      })
      if (selfPackageTask) {
        globalThis.setTimeout(() => {
          void (async () => {
            const previousMemberToken = client.http.memberToken
            client.http.memberToken = selfPackageTask.memberToken
            const stage = recoveryStageForChannel(sessionChannel, 'self-key-package.background')
            const surfaceBackgroundIssue = (message: string) => {
              setState((s) => {
                if (s.channelId !== sessionChannel.id) return s
                return {
                  ...s,
                  error: message,
                  channels: mergeChannel(s.channels, { ...sessionChannel, recoveryError: message }),
                }
              })
            }
            try {
              const published = await publishAndVerifySelfKeyPackage({
                client,
                channel,
                member: selfPackageTask.member,
                keyId: selfPackageTask.keyId,
                wrapSecret: selfPackageTask.wrapSecret,
                sourceEpoch: selfPackageTask.sourceEpoch,
                required: false,
              })
              if (!published) {
                surfaceBackgroundIssue(
                  recoveryIssueMessage(stage, new Error('account recovery escrow did not publish for this channel')),
                )
              }
            } catch (error) {
              surfaceBackgroundIssue(reportRecoveryIssue(stage, error))
            } finally {
              if (stateRef.current.channelId === sessionChannel.id) {
                client.http.memberToken = selfPackageTask.memberToken
              } else {
                client.http.memberToken = previousMemberToken
              }
            }
          })()
        }, 0)
      }
    },
    [ensureClient, opts.principalUserId, publishAndVerifySelfKeyPackage],
  )

  const refreshAdminSpaces = useCallback(async () => {
    if (!opts.adminEnabled) return
    const client = ensureClient()
    setState((s) => ({ ...s, spaceAdminStatus: 'loading', spaceAdminError: null }))
    try {
      const live = await client.listSpaces({ status: 'active', limit: 100 })
      const adminSpaces = live.map(toSpaceRef)
      const current = stateRef.current
      const previewSpaces = normalizeSpaces([...current.spaces, ...adminSpaces])
      const hydratedChannels = await hydrateLoadableChannelsForSpaces(
        client,
        previewSpaces,
        current.channels,
        current.activeSpaceSlug,
      )
      setState((s) => {
        const spaces = normalizeSpaces([...s.spaces, ...adminSpaces])
        const channels = mergeChannels(s.channels, hydratedChannels)
        const activeChannel = s.channelId ? channels.find((channel) => channel.id === s.channelId) : null
        const rooms = activeChannel ? activeChannel.rooms : s.rooms
        const activeRoomId = activeChannel?.memberToken ? chooseActiveRoomId(rooms, s.activeRoomId) : s.activeRoomId
        const activeSpaceSlug = spaces.some((space) => space.slug === s.activeSpaceSlug)
          ? s.activeSpaceSlug
          : spaces[0]?.slug ?? DEFAULT_SPACE.slug
        const next: ChatState = {
          ...s,
          channels,
          rooms,
          activeRoomId,
          spaces,
          activeSpaceSlug,
          spaceAdminStatus: 'ready',
          spaceAdminError: null,
        }
        persistSpaces(spaces)
        if (next.channels.length) persistChatSession(next)
        return next
      })
    } catch (e) {
      setState((s) => ({
        ...s,
        spaceAdminStatus: 'error',
        spaceAdminError: errText(e),
      }))
    }
  }, [ensureClient, opts.adminEnabled])

  useEffect(() => {
    if (!opts.adminEnabled) {
      setState((s) =>
        s.spaceAdminStatus === 'idle' && !s.spaceAdminError
          ? s
          : { ...s, spaceAdminStatus: 'idle', spaceAdminError: null },
      )
      return
    }
    void refreshAdminSpaces()
  }, [opts.adminEnabled, refreshAdminSpaces])

  const createSpace = useCallback(
    async ({ slug, title }: { slug: string; title: string }) => {
      const client = ensureClient()
      const requested = normalizeSpace({ slug, title })
      try {
        const live = await client.ensureSpace(requested.slug, requested.title)
        const next = normalizeSpace({
          id: live.id,
          tenantId: live.tenantId,
          slug: live.slug ?? requested.slug,
          title: requested.title,
          status: 'active',
          source: opts.adminEnabled ? 'server' : 'local',
        })
        setState((s) => {
          const spaces = mergeSpace(s.spaces, next)
          persistSpaces(spaces)
          const nextState: ChatState = { ...s, error: null, spaces, activeSpaceSlug: next.slug }
          if (nextState.channels.length) persistChatSession(nextState)
          return nextState
        })
        return next
      } catch (e) {
        setState((s) => ({ ...s, error: errText(e) }))
        throw e
      }
    },
    [ensureClient, opts.adminEnabled],
  )

  const forgetSpace = useCallback((slug: string) => {
    if (slug === DEFAULT_SPACE.slug) return
    setState((s) => {
      const spaces = normalizeSpaces(s.spaces.filter((space) => space.slug !== slug))
      const activeSpaceSlug = s.activeSpaceSlug === slug ? DEFAULT_SPACE.slug : s.activeSpaceSlug
      const channels = s.channels.filter((channel) => channel.spaceSlug !== slug)
      persistSpaces(spaces)
      if (s.activeSpaceSlug !== slug) {
        const nextState: ChatState = { ...s, spaces, channels }
        persistChatSession(nextState)
        return nextState
      }
      const nextState: ChatState = {
        ...emptyWithSpaces(spaces, activeSpaceSlug),
        error: null,
        channels,
      }
      persistChatSession(nextState)
      return nextState
    })
  }, [])

  const archiveSpace = useCallback(
    async (slug: string) => {
      const client = ensureClient()
      if (slug === DEFAULT_SPACE.slug) {
        setState((s) => ({ ...s, error: 'default space cannot be archived' }))
        return
      }
      const target = state.spaces.find((space) => space.slug === slug)
      if (!target?.id) {
        setState((s) => ({ ...s, error: 'space metadata id missing; refresh admin space list first' }))
        return
      }
      try {
        await client.archiveSpace(target.id, { updatedBy: state.handle ?? 'operator' })
        setState((s) => {
          const spaces = normalizeSpaces(s.spaces.filter((space) => space.slug !== slug))
          const activeSpaceSlug = s.activeSpaceSlug === slug ? spaces[0]?.slug ?? DEFAULT_SPACE.slug : s.activeSpaceSlug
          const channels = s.channels.filter((channel) => channel.spaceSlug !== slug)
          const nextState =
            s.activeSpaceSlug === slug
              ? {
                  ...emptyWithSpaces(spaces, activeSpaceSlug),
                  error: null,
                  channels,
                  spaceAdminStatus: s.spaceAdminStatus,
                  spaceAdminError: s.spaceAdminError,
                }
              : { ...s, error: null, spaces, channels }
          persistSpaces(spaces)
          persistChatSession(nextState)
          return nextState
        })
        void refreshAdminSpaces()
      } catch (e) {
        setState((s) => ({ ...s, error: errText(e) }))
        throw e
      }
    },
    [ensureClient, refreshAdminSpaces, state.handle, state.spaces],
  )

  const selectSpace = useCallback(
    async (slug: string) => {
      const client = ensureClient()
      const next = state.spaces.find((space) => space.slug === slug) ?? normalizeSpace({ slug })
      const spaces = mergeSpace(state.spaces, next)
      persistSpaces(spaces)
      const hydratedChannels = await hydrateLoadableChannelsForSpaces(client, spaces, state.channels, next.slug)
      const preferredChannelId =
        state.channels.find((channel) => channel.id === state.channelId && channel.spaceSlug === next.slug)?.id ?? null
      const channels = await hydrateRecoveryForChannels(mergeChannels(state.channels, hydratedChannels), {
        preferredChannelId,
        activeSpaceSlug: next.slug,
        lazy: true,
        stopAfterFirstRestored: true,
      })
      const orderedChannels = orderChannelsForRecovery(channels, { preferredChannelId, activeSpaceSlug: next.slug })
      const existing =
        orderedChannels.find((channel) => channel.spaceSlug === next.slug && channel.memberToken) ??
        orderedChannels.find((channel) => channel.spaceSlug === next.slug)
      if (!existing) {
        setState(() => {
          const nextState: ChatState = {
            ...emptyWithSpaces(spaces, next.slug),
            channels,
            error: null,
          }
          if (channels.length) persistChatSession(nextState)
          return nextState
        })
        return
      }
      if (!existing.memberToken) {
        setState((s) => {
          const nextState = selectLockedChannelState({ ...s, spaces, activeSpaceSlug: next.slug }, existing, channels)
          if (channels.some((channel) => channel.memberToken)) persistChatSession(nextState)
          return nextState
        })
        return
      }
      try {
        const loaded = await loadChannel(existing)
        setState((s) => {
          const nextState: ChatState = {
            ...s,
            status: 'connected',
            error: null,
            spaces,
            activeSpaceSlug: next.slug,
            channelId: existing.id,
            channelTitle: existing.title,
            invite: existing.invite,
            channels: mergeChannel(channels, { ...existing, rooms: loaded.rooms }),
            rooms: loaded.rooms,
            activeRoomId: loaded.activeRoomId,
            messages: [],
            members: loaded.members,
            presence: [],
            receipts: [],
            bindings: [],
          }
          persistChatSession(nextState)
          return nextState
        })
      } catch (e) {
        setState((s) => ({
          ...s,
          status: 'error',
          spaces,
          channels,
          activeSpaceSlug: next.slug,
          channelId: null,
          channelTitle: null,
          rooms: [],
          activeRoomId: null,
          messages: [],
          members: [],
          presence: [],
          receipts: [],
          bindings: [],
          error: errText(e),
        }))
      }
    },
    [ensureClient, state.spaces, state.channels, hydrateRecoveryForChannels, loadChannel],
  )

  const createChannel = useCallback(
    async ({
      handle,
      title,
      guidanceMarkdown,
      encryptionMode = 'server-encrypted',
    }: {
      handle: string
      title: string
      guidanceMarkdown?: string
      encryptionMode?: ChannelEncryptionMode
    }) => {
      setState((s) => ({ ...s, status: 'connecting', error: null }))
      try {
        const client = ensureClient()
        const channelRules = normalizePurpose(guidanceMarkdown) ?? defaultChannelRules(title)
        const generalRoomRules = defaultRoomRules('general')
        const selectedSpace =
          state.spaces.find((space) => space.slug === state.activeSpaceSlug) ?? DEFAULT_SPACE
        const space = await client.ensureSpace(selectedSpace.slug, selectedSpace.title)
        const { channel, generalRoom, invite } = await client.createChannel({
          space,
          slug: slugifyName(title || 'cockpit-oda'),
          title: title || 'Cockpit Oda',
          handle,
          encryptionMode,
          guidanceMarkdown: channelRules,
          generalRoomGuidanceMarkdown: generalRoomRules,
        })
        const connectedMemberToken = client.http.memberToken ?? null
        await afterConnect(
          { ...channel, title: title || channel.slug, guidanceMarkdown: channelRules },
          handle,
          [toRoomRef(generalRoom)],
          invite,
          selectedSpace,
          connectedMemberToken,
        )
      } catch (e) {
        setState((s) => ({ ...s, status: 'error', error: errText(e) }))
      }
    },
    [ensureClient, afterConnect, state.activeSpaceSlug, state.spaces],
  )

  const joinChannel = useCallback(
    async ({ handle, invite }: { handle: string; invite: string }) => {
      setState((s) => ({ ...s, status: 'connecting', error: null }))
      try {
        const client = ensureClient()
        // Parse first so we know the channelId (for member-cache load) up front.
        const parsed = parseInvite(invite.trim())
        const { rooms } = await client.joinFromInvite(parsed, handle)
        const connectedMemberToken = client.http.memberToken ?? null
        let channel: (Pick<Channel, 'id' | 'tenantId' | 'spaceId' | 'slug' | 'title' | 'purpose' | 'guidanceMarkdown'>) | null = null
        try {
          channel = await client.getChannel(parsed.channelId)
        } catch {
          channel = null
        }
        await afterConnect(
          channel ?? {
            id: parsed.channelId,
            tenantId: rooms[0]?.tenantId ?? 'default',
            spaceId: 'default',
            slug: 'katilinan-kanal',
            title: 'katılınan kanal',
          },
          handle,
          rooms.map(toRoomRef),
          invite,
          state.spaces.find((space) => space.slug === state.activeSpaceSlug) ?? DEFAULT_SPACE,
          connectedMemberToken,
        )
      } catch (e) {
        setState((s) => ({ ...s, status: 'error', error: errText(e) }))
      }
    },
    [ensureClient, afterConnect, state.activeSpaceSlug, state.spaces],
  )

  const selectChannel = useCallback(
    async (channelId: string, preferredRoomId?: string | null) => {
      const channel = stateRef.current.channels.find((c) => c.id === channelId) ?? state.channels.find((c) => c.id === channelId)
      if (!channel) return
      if (!channel.memberToken) {
        const recovered = await recoverChannelIfPossible(channel, recoverySecretRef.current, { forceServerRecovery: true })
        if (!recovered.memberToken) {
          setState((s) => selectLockedChannelState(s, recovered, mergeChannel(s.channels, recovered)))
          return
        }
        const loaded = await loadChannel(recovered, preferredRoomId)
        setState((s) => {
          const nextChannel = { ...recovered, rooms: loaded.rooms }
          const next: ChatState = {
            ...s,
            status: 'connected',
            error: null,
            channelId: recovered.id,
            channelTitle: recovered.title,
            invite: recovered.invite,
            activeSpaceSlug: recovered.spaceSlug,
            channels: mergeChannel(s.channels, nextChannel),
            rooms: loaded.rooms,
            activeRoomId: loaded.activeRoomId,
            messages: [],
            members: loaded.members,
            presence: [],
            receipts: [],
            bindings: [],
          }
          persistChatSession(next)
          return next
        })
        return
      }
      try {
        const loaded = await loadChannel(channel, preferredRoomId)
        const nextChannel = { ...channel, rooms: loaded.rooms }
        setState((s) => {
          const next: ChatState = {
            ...s,
            status: 'connected',
            error: null,
            channelId: channel.id,
            channelTitle: channel.title,
            invite: channel.invite,
            activeSpaceSlug: channel.spaceSlug,
            channels: mergeChannel(s.channels, nextChannel),
            rooms: loaded.rooms,
            activeRoomId: loaded.activeRoomId,
            messages: [],
            members: loaded.members,
            presence: [],
            receipts: [],
            bindings: [],
          }
          persistChatSession(next)
          return next
        })
      } catch (e) {
        if (channel.status === 'archived') {
          setState((s) => ({
            ...s,
            status: 'connected',
            error: errText(e),
            activeSpaceSlug: channel.spaceSlug,
            channelId: channel.id,
            channelTitle: channel.title,
            invite: channel.invite,
            channels: mergeChannel(s.channels, channel),
            rooms: channel.rooms,
            activeRoomId: null,
            messages: [],
            members: [],
            presence: [],
            receipts: [],
            bindings: [],
          }))
          return
        }
        if (channel.encryptionMode === 'server-encrypted' && isServerMemberAuthError(e)) {
          const recovered = await recoverChannelIfPossible(channel, recoverySecretRef.current, { forceServerRecovery: true })
          if (recovered.memberToken) {
            const loaded = await loadChannel(recovered, preferredRoomId)
            const nextChannel = { ...recovered, rooms: loaded.rooms }
            setState((s) => {
              const next: ChatState = {
                ...s,
                status: 'connected',
                error: null,
                channelId: recovered.id,
                channelTitle: recovered.title,
                invite: recovered.invite,
                activeSpaceSlug: recovered.spaceSlug,
                channels: mergeChannel(s.channels, nextChannel),
                rooms: loaded.rooms,
                activeRoomId: loaded.activeRoomId,
                messages: [],
                members: loaded.members,
                presence: [],
                receipts: [],
                bindings: [],
              }
              persistChatSession(next)
              return next
            })
            return
          }
          setState((s) => selectLockedChannelState({ ...s, status: 'connected' }, recovered, mergeChannel(s.channels, recovered)))
          return
        }
        setState((s) => ({
          ...s,
          status: 'error',
          error: errText(e),
          activeSpaceSlug: channel.spaceSlug,
          channelId: null,
          channelTitle: null,
          rooms: [],
          activeRoomId: null,
          messages: [],
          members: [],
          presence: [],
          receipts: [],
          bindings: [],
        }))
      }
    },
    [state.channels, recoverChannelIfPossible, loadChannel],
  )

  const selectRoom = useCallback(
    (roomId: string, channelId = state.channelId) => {
      if (channelId && channelId !== state.channelId) {
        void selectChannel(channelId, roomId)
        return
      }
      setState((s) => {
        const next: ChatState = { ...s, activeRoomId: roomId, messages: [], presence: [], receipts: [], bindings: [] }
        persistChatSession(next)
        return next
      })
    },
    [state.channelId, selectChannel],
  )

  const unlockChannelWithPin = useCallback(
    async (channelId: string, pin: string) => {
      const channel = stateRef.current.channels.find((c) => c.id === channelId) ?? state.channels.find((c) => c.id === channelId)
      if (!channel) return
      setState((s) => ({ ...s, status: 'connecting', error: null }))
      try {
        const recovered = await recoverChannelIfPossible(channel, { source: 'pin', value: pin }, { forceServerRecovery: true })
        if (!recovered.memberToken) {
          setState((s) => selectLockedChannelState({ ...s, status: 'connected' }, recovered, mergeChannel(s.channels, recovered)))
          return
        }
        const loaded = await loadChannel(recovered)
        setState((s) => {
          const nextChannel = { ...recovered, rooms: loaded.rooms }
          const next: ChatState = {
            ...s,
            status: 'connected',
            error: null,
            channelId: recovered.id,
            channelTitle: recovered.title,
            invite: recovered.invite,
            activeSpaceSlug: recovered.spaceSlug,
            channels: mergeChannel(s.channels, nextChannel),
            rooms: loaded.rooms,
            activeRoomId: loaded.activeRoomId,
            messages: [],
            members: loaded.members,
            presence: [],
            receipts: [],
            bindings: [],
          }
          persistChatSession(next)
          return next
        })
      } catch (e) {
        setState((s) => ({ ...s, status: 'error', error: errText(e) }))
      }
    },
    [state.channels, recoverChannelIfPossible, loadChannel],
  )

  const send = useCallback(
    async (text: string, kind: string) => {
      const client = clientRef.current
      const room = state.rooms.find((r) => r.id === state.activeRoomId)
      const channel = state.channels.find((c) => c.id === state.channelId)
      if (!client || !room) return
      try {
        if (channel) {
          await activateChannelMemberToken(client, channel)
          await hydrateLocalChannelCrypto({ client, channel, rooms: [room] }).catch(() => undefined)
        }
        await client.sendText(room, text, kind)
        await refreshRoom(room.id)
      } catch (e) {
        setState((s) => ({ ...s, error: errText(e) }))
      }
    },
    [state.rooms, state.activeRoomId, state.channels, state.channelId, refreshRoom],
  )

  const createRoom = useCallback(
    async ({ slug, title, guidanceMarkdown }: { slug: string; title: string; guidanceMarkdown?: string }) => {
      const client = clientRef.current
      const channel = state.channels.find((c) => c.id === state.channelId)
      if (!client || !channel) return
      try {
        await hydrateStoredChannelCrypto(client, channel)
        await activateChannelMemberToken(client, channel)
        const rules = normalizePurpose(guidanceMarkdown) ?? defaultRoomRules(title || slug)
        const room = await client.createRoom({
          channel,
          slug: slugifyName(slug || title),
          title: title || slug,
          guidanceMarkdown: rules,
        })
        const nextRoom = toRoomRef(room)
        await hydrateLocalChannelCrypto({ client, channel, rooms: [nextRoom] }).catch(() => undefined)
        setState((s) => {
          const current = s.channels.find((c) => c.id === channel.id) ?? channel
          const rooms = [...current.rooms.filter((r) => r.id !== nextRoom.id), nextRoom]
          const next: ChatState = {
            ...s,
            error: null,
            channels: mergeChannel(s.channels, { ...current, rooms }),
            rooms,
            activeRoomId: nextRoom.id,
            messages: [],
            presence: [],
            receipts: [],
            bindings: [],
          }
          persistChatSession(next)
          return next
        })
      } catch (e) {
        setState((s) => ({ ...s, error: errText(e) }))
        throw e
      }
    },
    [state.channels, state.channelId],
  )

  const archiveRoom = useCallback(async (roomId: string) => {
    const client = clientRef.current
    const channelId = state.channelId
    if (!client || !channelId) return
    try {
      await client.archiveRoom(roomId)
      setState((s) => {
        const rooms = s.rooms.filter((r) => r.id !== roomId)
        const channel = s.channels.find((c) => c.id === channelId)
        const channels = channel ? mergeChannel(s.channels, { ...channel, rooms }) : s.channels
        const next: ChatState = {
          ...s,
          error: null,
          channels,
          rooms,
          activeRoomId: s.activeRoomId === roomId ? rooms[0]?.id ?? null : s.activeRoomId,
          messages: s.activeRoomId === roomId ? [] : s.messages,
          presence: s.activeRoomId === roomId ? [] : s.presence,
          receipts: s.activeRoomId === roomId ? [] : s.receipts,
          bindings: s.activeRoomId === roomId ? [] : s.bindings,
        }
        persistChatSession(next)
        return next
      })
    } catch (e) {
      setState((s) => ({ ...s, error: errText(e) }))
    }
  }, [state.channelId])

  const deleteRoom = useCallback(async (roomId: string, confirmSlug: string) => {
    const client = clientRef.current
    const channelId = state.channelId
    if (!client || !channelId) return
    try {
      await client.deleteRoom(roomId, { confirmSlug })
      setState((s) => {
        const rooms = s.rooms.filter((r) => r.id !== roomId)
        const channel = s.channels.find((c) => c.id === channelId)
        const channels = channel ? mergeChannel(s.channels, { ...channel, rooms }) : s.channels
        const next: ChatState = {
          ...s,
          error: null,
          channels,
          rooms,
          activeRoomId: s.activeRoomId === roomId ? rooms[0]?.id ?? null : s.activeRoomId,
          messages: s.activeRoomId === roomId ? [] : s.messages,
          presence: s.activeRoomId === roomId ? [] : s.presence,
          receipts: s.activeRoomId === roomId ? [] : s.receipts,
          bindings: s.activeRoomId === roomId ? [] : s.bindings,
        }
        persistChatSession(next)
        return next
      })
    } catch (e) {
      setState((s) => ({ ...s, error: errText(e) }))
      throw e
    }
  }, [state.channelId])

  const archiveChannel = useCallback(async (channelId: string) => {
    const client = clientRef.current
    const channel = state.channels.find((c) => c.id === channelId)
    if (!client || !channel) return
    try {
      await activateChannelMemberToken(client, channel)
      const archived = await client.archiveChannel(channelId, { updatedBy: state.handle ?? 'operator' })
      const nextChannel: ChatChannelRef = {
        ...channel,
        title: archived.title || channel.title,
        purpose: normalizePurpose(archived.purpose),
        guidanceMarkdown: normalizePurpose(archived.guidanceMarkdown),
        status: 'archived',
        archivedAt: archived.archivedAt ? String(archived.archivedAt) : new Date().toISOString(),
      }
      setState((s) => {
        const nextState: ChatState = {
          ...s,
          status: 'connected',
          error: archivedChannelMessage(nextChannel),
          channelId,
          channelTitle: nextChannel.title,
          invite: nextChannel.invite,
          activeSpaceSlug: nextChannel.spaceSlug,
          channels: mergeChannel(s.channels, nextChannel),
          rooms: nextChannel.rooms,
          activeRoomId: null,
          messages: [],
          members: [],
          presence: [],
          receipts: [],
          bindings: [],
        }
        persistChatSession(nextState)
        return nextState
      })
    } catch (e) {
      setState((s) => ({ ...s, error: errText(e) }))
    }
  }, [state.channels, state.handle])

  const unarchiveChannel = useCallback(async (channelId: string) => {
    const client = clientRef.current
    const channel = state.channels.find((c) => c.id === channelId)
    if (!client || !channel) return
    try {
      await activateChannelMemberToken(client, channel)
      const restored = await client.unarchiveChannel(channelId, { updatedBy: state.handle ?? 'operator' })
      const nextChannel: ChatChannelRef = {
        ...channel,
        title: restored.title || channel.title,
        purpose: normalizePurpose(restored.purpose),
        guidanceMarkdown: normalizePurpose(restored.guidanceMarkdown),
        status: 'active',
        archivedAt: null,
      }
      const loaded = await loadChannel(nextChannel)
      setState((s) => {
        const nextState: ChatState = {
          ...s,
          status: 'connected',
          error: null,
          channelId: nextChannel.id,
          channelTitle: nextChannel.title,
          invite: nextChannel.invite,
          activeSpaceSlug: nextChannel.spaceSlug,
          channels: mergeChannel(s.channels, { ...nextChannel, rooms: loaded.rooms }),
          rooms: loaded.rooms,
          activeRoomId: loaded.activeRoomId,
          messages: [],
          members: loaded.members,
          presence: [],
          receipts: [],
          bindings: [],
        }
        persistChatSession(nextState)
        return nextState
      })
    } catch (e) {
      setState((s) => ({ ...s, status: 'error', error: errText(e) }))
    }
  }, [state.channels, state.handle, loadChannel])

  const deleteChannel = useCallback(async (channelId: string, confirmSlug: string) => {
    const client = clientRef.current
    const channel = state.channels.find((c) => c.id === channelId)
    if (!client || !channel) return
    try {
      await activateChannelMemberToken(client, channel)
      await client.deleteChannel(channelId, { confirmSlug })
      forgetChannelMemberToken(channelId)
      const remaining = state.channels.filter((c) => c.id !== channelId)
      if (!remaining.length) {
        setState((s) => {
          const next = emptyWithSpaces(s.spaces, s.activeSpaceSlug)
          clearChatSession()
          return next
        })
        return
      }
      const next = remaining.find((c) => c.memberToken) ?? remaining[0]
      if (!next.memberToken) {
        setState((s) => selectLockedChannelState(s, next, remaining))
        return
      }
      const loaded = await loadChannel(next)
      setState((s) => {
        const nextState: ChatState = {
          ...s,
          status: 'connected',
          error: null,
          channelId: next.id,
          channelTitle: next.title,
          invite: next.invite,
          activeSpaceSlug: next.spaceSlug,
          channels: mergeChannel(remaining, { ...next, rooms: loaded.rooms }),
          rooms: loaded.rooms,
          activeRoomId: loaded.activeRoomId,
          messages: [],
          members: loaded.members,
          presence: [],
          receipts: [],
          bindings: [],
        }
        persistChatSession(nextState)
        return nextState
      })
    } catch (e) {
      setState((s) => ({ ...s, error: errText(e) }))
      throw e
    }
  }, [state.channels, loadChannel])

  const removeMember = useCallback(
    async (memberId: string) => {
      const client = clientRef.current
      const channelId = state.channelId
      const channel = state.channels.find((c) => c.id === channelId)
      if (!client || !channelId || !channel) return
      const target = state.members.find((member) => member.id === memberId)
      if (!target) throw new Error(`member ${memberId} is not in the active channel roster`)
      if (target.channelId !== channelId) {
        throw new Error(`member ${memberId} belongs to channel ${target.channelId}, not active channel ${channelId}`)
      }
      try {
        await activateChannelMemberToken(client, channel)
        const updated = await client.updateMember(memberId, { status: 'removed' })
        if (updated.channelId !== channelId) {
          throw new Error(`server returned member ${updated.id} from channel ${updated.channelId}, not active channel ${channelId}`)
        }
        const members = await client.listMembers(channelId).catch(() =>
          state.members.map((member) => (member.id === memberId ? updated : member)),
        )
        setState((s) => {
          const next: ChatState = { ...s, error: null, members }
          persistChatSession(next)
          return next
        })
      } catch (e) {
        setState((s) => ({ ...s, error: errText(e) }))
        throw e
      }
    },
    [state.channelId, state.channels, state.members],
  )

  const leaveChannel = useCallback(async () => {
    const client = clientRef.current
    const channelId = state.channelId
    const channel = state.channels.find((c) => c.id === channelId)
    const self = state.members.find((member) => member.handle === state.handle && member.status !== 'removed')
    if (!client || !channelId || !channel || !self) return
    try {
      await activateChannelMemberToken(client, channel)
      await client.updateMember(self.id, { status: 'removed' })
      forgetChannelMemberToken(channelId)
      const remaining = state.channels.filter((c) => c.id !== channelId)
      if (!remaining.length) {
        setState((s) => {
          const next = emptyWithSpaces(s.spaces, s.activeSpaceSlug)
          clearChatSession()
          return next
        })
        return
      }
      const nextChannel = remaining[0]
      const loaded = await loadChannel(nextChannel)
      setState((s) => {
        const next: ChatState = {
          ...s,
          status: 'connected',
          error: null,
          channelId: nextChannel.id,
          channelTitle: nextChannel.title,
          invite: nextChannel.invite,
          activeSpaceSlug: nextChannel.spaceSlug,
          channels: mergeChannel(remaining, { ...nextChannel, rooms: loaded.rooms }),
          rooms: loaded.rooms,
          activeRoomId: loaded.activeRoomId,
          messages: [],
          members: loaded.members,
          presence: [],
          receipts: [],
          bindings: [],
        }
        persistChatSession(next)
        return next
      })
    } catch (e) {
      setState((s) => ({ ...s, error: errText(e) }))
      throw e
    }
  }, [state.channelId, state.channels, state.handle, state.members, loadChannel])

  // Acknowledge a directive up to `seq` (advances this member's ack cursor), then
  // refresh so the new ackSeq lands in receipts → the inspector ACK count updates.
  const ackDirective = useCallback(
    async (seq: number) => {
      const client = clientRef.current
      const roomId = state.activeRoomId
      if (!client || !roomId) return
      try {
        await client.ackDirective(roomId, seq)
        await refreshRoom(roomId)
      } catch (e) {
        setState((s) => ({ ...s, error: errText(e) }))
      }
    },
    [state.activeRoomId, refreshRoom],
  )

  // Presence and timeline refresh use bounded polling for the active room.
  useEffect(() => {
    const client = clientRef.current
    const roomId = state.activeRoomId
    if (!client || !roomId) return
    void refreshRoom(roomId)
    void client.setPresence(roomId, { state: 'active', note: 'aops-cockpit' }).catch(() => undefined)
    const poll = window.setInterval(() => void refreshRoom(roomId), 5000)
    return () => window.clearInterval(poll)
  }, [state.activeRoomId, refreshRoom])

  const resolveMember = useCallback(
    (memberId: string): ChannelMember | undefined =>
      clientRef.current?.resolveMember(state.channelId ?? '', memberId) ??
      state.members.find((m) => m.id === memberId),
    [state.channelId, state.members],
  )

  // Directive-ACK rollup for the latest directive (design: screens-chat.jsx room
  // pane "Directive ACK n/m"). Total counts known members, falling back to the
  // receipt roster so it is never 0 mid-session; a member has acked when their
  // ackSeq has reached the directive's seq.
  const directiveAck: DirectiveAck | null = (() => {
    let latest = 0
    for (const m of state.messages) if (m.kind === 'directive' && m.seq > latest) latest = m.seq
    if (!latest) return null
    const total = state.members.length || state.receipts.length
    const acked = state.receipts.filter((r) => r.ackSeq >= latest).length
    const mine = state.receipts.some((r) => r.handle === state.handle && r.ackSeq >= latest)
    return { seq: latest, acked, total, mine }
  })()

  return {
    ...state,
    directiveAck,
    createSpace,
    selectSpace,
    forgetSpace,
    archiveSpace,
    refreshAdminSpaces,
    createChannel,
    joinChannel,
    selectChannel,
    unlockChannelWithPin,
    selectRoom,
    createRoom,
    send,
    archiveRoom,
    deleteRoom,
    archiveChannel,
    unarchiveChannel,
    deleteChannel,
    removeMember,
    leaveChannel,
    ackDirective,
    resolveMember,
  }
}

/** The full reactive surface returned by {@link useChatSession}: ChatState
 *  fields + directiveAck + the action callbacks. Shared by the chat page and
 *  the chat navigator. */
export type ChatSession = ReturnType<typeof useChatSession>
