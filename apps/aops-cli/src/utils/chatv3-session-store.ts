import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  decryptWithPassword,
  encryptWithPassword,
  type EncryptedPayload,
} from '@aopslab/xf-secure-store'

export type Chatv3SessionRoom = {
  id: string
  slug: string
  title: string
  currentEpoch: number
  purpose?: string | null
  guidanceMarkdown?: string | null
  status?: string
}

export type Chatv3SessionEncryptionMode = 'e2e' | 'server-encrypted'

export type Chatv3SessionEpochKey = {
  roomId: string
  epoch: number
  rawEpochKey: string
  cipherSuite?: string
  keyId?: string
}

export type Chatv3SessionEpochKeyRecord = Omit<Chatv3SessionEpochKey, 'rawEpochKey'> & {
  rawEpochKeyEnc: string
}

export type Chatv3SessionRecord = {
  version: 1
  id: string
  serverBaseUrl: string
  handle: string
  channel: {
    id: string
    tenantId: string
    spaceId: string
    slug: string
    title?: string
    purpose?: string | null
    guidanceMarkdown?: string | null
    encryptionMode?: Chatv3SessionEncryptionMode
  }
  keyId: string
  activeRoomId?: string
  rooms: Chatv3SessionRoom[]
  memberTokenEnc: string
  wrapSecretEnc?: string
  epochKeysEnc?: Chatv3SessionEpochKeyRecord[]
  createdAt: string
  updatedAt: string
}

export type Chatv3SessionSecrets = {
  memberToken: string
  wrapSecret?: string
  epochKeys?: Chatv3SessionEpochKey[]
}

export type Chatv3SessionPlainInput = Omit<Chatv3SessionRecord, 'version' | 'memberTokenEnc' | 'wrapSecretEnc' | 'epochKeysEnc' | 'createdAt' | 'updatedAt'> & {
  createdAt?: string
  updatedAt?: string
}

export type Chatv3LoadedSession = {
  record: Chatv3SessionRecord
  secrets: Chatv3SessionSecrets
}

type StoreFile = {
  version: 1
  sessions: Record<string, Chatv3SessionRecord>
}

const STORE_FILENAME = 'chatv3-sessions.json'
const SECRET_FILENAME = 'chatv3-session.key'

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function baseDirFromConfig(): string {
  const configPath =
    normalizeNonEmpty(process.env.AOPS_CLI_CONFIG_PATH) ??
    normalizeNonEmpty(process.env.AGENT_OPS_CONFIG_PATH)
  if (configPath) return path.dirname(configPath)
  return path.join(os.homedir(), '.aops')
}

export function resolveChatv3SessionStorePath(explicitPath?: string): string {
  return path.resolve(
    normalizeNonEmpty(explicitPath) ??
      normalizeNonEmpty(process.env.AOPS_CHATV3_SESSION_STORE_PATH) ??
      path.join(baseDirFromConfig(), STORE_FILENAME),
  )
}

function resolveChatv3SessionSecretPath(): string {
  return path.join(baseDirFromConfig(), SECRET_FILENAME)
}

async function ensureDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

async function enforceOwnerOnlyFileMode(filePath: string): Promise<void> {
  if (process.platform === 'win32') return
  await fs.chmod(filePath, 0o600)
}

async function readStore(storePath: string): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(storePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<StoreFile>
    return {
      version: 1,
      sessions: parsed && typeof parsed.sessions === 'object' && parsed.sessions ? parsed.sessions as Record<string, Chatv3SessionRecord> : {},
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: 1, sessions: {} }
    }
    throw error
  }
}

async function writeStore(storePath: string, store: StoreFile): Promise<void> {
  await ensureDir(storePath)
  await fs.writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await enforceOwnerOnlyFileMode(storePath)
}

async function resolveSessionSecret(): Promise<string> {
  const envSecret =
    normalizeNonEmpty(process.env.AOPS_CHATV3_SESSION_SECRET) ??
    normalizeNonEmpty(process.env.AOPS_MCP_TOKEN_SECRET) ??
    normalizeNonEmpty(process.env.AOPS_MCP_CONFIG_SECRET)
  if (envSecret) return envSecret

  const secretPath = resolveChatv3SessionSecretPath()
  try {
    const raw = await fs.readFile(secretPath, 'utf8')
    const secret = normalizeNonEmpty(raw)
    if (secret) {
      await enforceOwnerOnlyFileMode(secretPath)
      return secret
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const secret = crypto.randomBytes(32).toString('base64')
  await ensureDir(secretPath)
  await fs.writeFile(secretPath, `${secret}\n`, { encoding: 'utf8', mode: 0o600 })
  await enforceOwnerOnlyFileMode(secretPath)
  return secret
}

function encodeEncryptedPayload(payload: EncryptedPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}

function decodeEncryptedPayload(value: string): EncryptedPayload {
  return JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as EncryptedPayload
}

async function encryptSecret(value: string): Promise<string> {
  const { payload } = await encryptWithPassword(value, await resolveSessionSecret())
  return encodeEncryptedPayload(payload)
}

async function decryptSecret(value: string): Promise<string> {
  return decryptWithPassword(decodeEncryptedPayload(value), await resolveSessionSecret())
}

async function encryptEpochKeys(keys: Chatv3SessionEpochKey[] | undefined): Promise<Chatv3SessionEpochKeyRecord[] | undefined> {
  if (!keys || keys.length === 0) return undefined
  return Promise.all(keys.map(async ({ rawEpochKey, ...rest }) => ({
    ...rest,
    rawEpochKeyEnc: await encryptSecret(rawEpochKey),
  })))
}

async function decryptEpochKeys(keys: Chatv3SessionEpochKeyRecord[] | undefined): Promise<Chatv3SessionEpochKey[] | undefined> {
  if (!keys || keys.length === 0) return undefined
  return Promise.all(keys.map(async ({ rawEpochKeyEnc, ...rest }) => ({
    ...rest,
    rawEpochKey: await decryptSecret(rawEpochKeyEnc),
  })))
}

export async function saveChatv3Session(
  input: Chatv3SessionPlainInput,
  secrets: Chatv3SessionSecrets,
  options: { storePath?: string } = {},
): Promise<Chatv3SessionRecord> {
  const storePath = resolveChatv3SessionStorePath(options.storePath)
  const store = await readStore(storePath)
  const existing = store.sessions[input.id]
  const now = new Date().toISOString()
  const wrapSecretEnc = secrets.wrapSecret ? await encryptSecret(secrets.wrapSecret) : undefined
  const epochKeysEnc = await encryptEpochKeys(secrets.epochKeys)
  const record: Chatv3SessionRecord = {
    version: 1,
    ...input,
    rooms: input.rooms,
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    memberTokenEnc: await encryptSecret(secrets.memberToken),
    ...(wrapSecretEnc ? { wrapSecretEnc } : {}),
    ...(epochKeysEnc ? { epochKeysEnc } : {}),
  }
  store.sessions[input.id] = record
  await writeStore(storePath, store)
  return record
}

export async function loadChatv3Session(
  id: string,
  options: { storePath?: string } = {},
): Promise<Chatv3LoadedSession> {
  const store = await readStore(resolveChatv3SessionStorePath(options.storePath))
  const record = store.sessions[id]
  if (!record) throw new Error(`ChatV3 session not found: ${id}`)
  return {
    record,
    secrets: {
      memberToken: await decryptSecret(record.memberTokenEnc),
      wrapSecret: record.wrapSecretEnc ? await decryptSecret(record.wrapSecretEnc) : undefined,
      epochKeys: await decryptEpochKeys(record.epochKeysEnc),
    },
  }
}

export async function getChatv3SessionRecord(
  id: string,
  options: { storePath?: string } = {},
): Promise<Chatv3SessionRecord | null> {
  const store = await readStore(resolveChatv3SessionStorePath(options.storePath))
  return store.sessions[id] ?? null
}

export async function listChatv3SessionRecords(
  options: { storePath?: string } = {},
): Promise<Chatv3SessionRecord[]> {
  const store = await readStore(resolveChatv3SessionStorePath(options.storePath))
  return Object.values(store.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function deleteChatv3Session(
  id: string,
  options: { storePath?: string } = {},
): Promise<boolean> {
  const storePath = resolveChatv3SessionStorePath(options.storePath)
  const store = await readStore(storePath)
  const existed = Boolean(store.sessions[id])
  delete store.sessions[id]
  await writeStore(storePath, store)
  return existed
}

export function summarizeChatv3Session(record: Chatv3SessionRecord): Record<string, unknown> {
  return {
    id: record.id,
    serverBaseUrl: record.serverBaseUrl,
    handle: record.handle,
    channel: record.channel,
    keyId: record.keyId,
    activeRoomId: record.activeRoomId,
    rooms: record.rooms,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    encryptionMode: record.channel.encryptionMode ?? (record.wrapSecretEnc ? 'e2e' : 'server-encrypted'),
    epochKeyCount: record.epochKeysEnc?.length ?? 0,
    secretStorage: 'encrypted-at-rest',
  }
}

export async function readChatv3SessionStoreRaw(
  options: { storePath?: string } = {},
): Promise<string> {
  const storePath = resolveChatv3SessionStorePath(options.storePath)
  if (!fsSync.existsSync(storePath)) return ''
  return fs.readFile(storePath, 'utf8')
}
