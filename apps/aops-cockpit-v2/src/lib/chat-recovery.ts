import { argon2id } from 'hash-wasm'
import {
  deriveKek,
  fromB64Url,
  toB64Url,
  unwrapEpochKey,
  type Channel,
  type ChannelMember,
  type Chatv3Client,
  type MemberKeyPackage,
  type MemberRecoveryResult,
  type Room,
  type UserKeyBackup,
  type UserKeyRegisterInput,
} from '@aopslab/domain-product-client-chatv3'
import { IndexedDbKeyValueStore } from '@aopslab/light-client-core/storage'
import { CockpitChatKeyStore, CockpitChatSessionStore } from './chat-keystore'

export type ChatRecoverySecret = {
  source: 'password' | 'pin'
  value: string
}

type StoredUserKey = {
  userId: string
  tenantId: string
  userKeyId: string
  keyVersion: number
  publicKey: string
  privateKey: CryptoKey
  updatedAt: string
}

type RoomEpochRow = {
  roomId: string
  epoch: number
  wrappedKeyBlob: string
}

type ChannelPackagePayload = {
  version: 1
  channelId: string
  keyId: string
  wrapSecret: string
  sourceEpoch: number
  issuedAt: string
}

const isRecoverableState = (state: MemberRecoveryResult['recoveryState'] | string): boolean =>
  String(state).trim().toLowerCase().replace(/_/g, '-') === 'recoverable'

class ChatRecoveryStepError extends Error {
  readonly stage: string

  constructor(stage: string, detail: string, completed: string[] = []) {
    const prefix = completed.length ? `${completed.join(', ')} OK; ` : ''
    super(`${prefix}${stage} failed: ${detail}`)
    this.name = 'ChatRecoveryStepError'
    this.stage = stage
  }
}

const recoveryErrorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

const restoreStepError = (stage: string, error: unknown, completed: string[] = []): ChatRecoveryStepError =>
  new ChatRecoveryStepError(stage, recoveryErrorText(error), completed)

const kv = new IndexedDbKeyValueStore({ dbName: 'aops-cockpit-v2-chat', storeName: 'keys' })
const keyStore = new CockpitChatKeyStore()
const sessionStore = new CockpitChatSessionStore()
const subtle = globalThis.crypto.subtle
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const ARGON2ID_VERSION = 1
const ARGON2ID_MEMORY_KIB = 65536
const ARGON2ID_ITERATIONS = 3
const ARGON2ID_PARALLELISM = 1
const AES_GCM_NONCE_BYTES = 12

const userKeyStorageKey = (userId: string, tenantId: string) => `user-key-private:${tenantId}:${userId}`

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length)
  globalThis.crypto.getRandomValues(out)
  return out
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export function encodeRecoveryAadForWire(aad: string): string {
  return toB64Url(encoder.encode(aad))
}

function decodeRecoveryAadFromWire(aad: string | null | undefined): Uint8Array {
  return aad ? fromB64Url(aad) : new Uint8Array()
}

function secretToKekSource(secret: ChatRecoverySecret): 'chat-pin' | 'password-kdf' {
  return secret.source === 'password' ? 'password-kdf' : 'chat-pin'
}

async function deriveBackupKek(params: {
  secret: string
  salt: string
  memoryKiB: number | null
  iterations: number
  parallelism: number
}): Promise<CryptoKey> {
  const derived = await argon2id({
    password: params.secret,
    salt: fromB64Url(params.salt),
    iterations: params.iterations,
    parallelism: params.parallelism,
    memorySize: params.memoryKiB ?? ARGON2ID_MEMORY_KIB,
    hashLength: 32,
    outputType: 'binary',
  })
  return subtle.importKey('raw', toArrayBuffer(derived as Uint8Array), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

async function encryptBytes(key: CryptoKey, bytes: Uint8Array, aad: string): Promise<{ nonce: string; ciphertext: string; aad: string }> {
  const iv = randomBytes(AES_GCM_NONCE_BYTES)
  const aadBytes = encoder.encode(aad)
  const encrypted = await subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aadBytes) },
    key,
    toArrayBuffer(bytes),
  )
  return { nonce: toB64Url(iv), ciphertext: toB64Url(new Uint8Array(encrypted)), aad: toB64Url(aadBytes) }
}

async function decryptBytes(key: CryptoKey, nonce: string, ciphertext: string, aad: string | null): Promise<Uint8Array> {
  const aadBytes = decodeRecoveryAadFromWire(aad)
  const decrypted = await subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(fromB64Url(nonce)), additionalData: toArrayBuffer(aadBytes) },
    key,
    toArrayBuffer(fromB64Url(ciphertext)),
  )
  return new Uint8Array(decrypted)
}

async function importPrivateUserKey(pkcs8: Uint8Array): Promise<CryptoKey> {
  return subtle.importKey('pkcs8', pkcs8 as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey'])
}

async function saveLocalUserKey(params: {
  userId: string
  tenantId: string
  userKey: UserKeyBackup
  privateKey: CryptoKey
}): Promise<StoredUserKey> {
  const row: StoredUserKey = {
    userId: params.userId,
    tenantId: params.tenantId,
    userKeyId: params.userKey.id,
    keyVersion: params.userKey.keyVersion,
    publicKey: params.userKey.publicKey,
    privateKey: params.privateKey,
    updatedAt: new Date().toISOString(),
  }
  await kv.put(userKeyStorageKey(params.userId, params.tenantId), row)
  return row
}

async function getLocalUserKey(userId: string | null | undefined, tenantId: string): Promise<StoredUserKey | null> {
  if (!userId) return null
  return kv.get<StoredUserKey>(userKeyStorageKey(userId, tenantId))
}

async function unlockStoredUserKey(params: {
  userId: string
  tenantId: string
  userKey: UserKeyBackup
  secret: ChatRecoverySecret
}): Promise<StoredUserKey> {
  const expectedSource = secretToKekSource(params.secret)
  if (params.userKey.kekSource !== expectedSource) {
    throw new Error(`recovery key expects ${params.userKey.kekSource}`)
  }
  const kek = await deriveBackupKek({
    secret: params.secret.value,
    salt: params.userKey.kdfSalt,
    memoryKiB: params.userKey.kdfMemoryKiB,
    iterations: params.userKey.kdfIterations,
    parallelism: params.userKey.kdfParallelism,
  })
  const pkcs8 = await decryptBytes(kek, params.userKey.nonce, params.userKey.ciphertext, params.userKey.aad)
  const privateKey = await importPrivateUserKey(pkcs8)
  return saveLocalUserKey({ userId: params.userId, tenantId: params.tenantId, userKey: params.userKey, privateKey })
}

async function createUserKeyBackup(params: {
  tenantId: string
  secret: ChatRecoverySecret
}): Promise<{ input: UserKeyRegisterInput; privateKey: CryptoKey }> {
  const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
  const publicKey = toB64Url(new Uint8Array(await subtle.exportKey('spki', pair.publicKey)))
  const pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', pair.privateKey))
  const privateKey = await importPrivateUserKey(pkcs8)
  const salt = toB64Url(randomBytes(16))
  const kek = await deriveBackupKek({
    secret: params.secret.value,
    salt,
    memoryKiB: ARGON2ID_MEMORY_KIB,
    iterations: ARGON2ID_ITERATIONS,
    parallelism: ARGON2ID_PARALLELISM,
  })
  const aad = `chatv3-user-key-backup:v1:${params.tenantId}:${secretToKekSource(params.secret)}`
  const encrypted = await encryptBytes(kek, pkcs8, aad)
  return {
    privateKey,
    input: {
      tenantId: params.tenantId,
      publicKey: {
        algorithm: 'p256-ecdh',
        format: 'spki',
        publicKey,
      },
      privateKeyBackup: {
        packageVersion: 1,
        kekSource: secretToKekSource(params.secret),
        kdf: {
          name: 'argon2id',
          version: ARGON2ID_VERSION,
          salt,
          memoryKiB: ARGON2ID_MEMORY_KIB,
          iterations: ARGON2ID_ITERATIONS,
          parallelism: ARGON2ID_PARALLELISM,
        },
        wrapAlg: 'aes-256-gcm',
        ...encrypted,
      },
    },
  }
}

export async function ensureLocalUserKey(params: {
  client: Chatv3Client
  tenantId: string
  principalUserId?: string | null
  secret?: ChatRecoverySecret | null
}): Promise<{ userKey: UserKeyBackup | null; localKey: StoredUserKey | null; created: boolean }> {
  const userKey = await params.client.getUserKey({ tenantId: params.tenantId })
  const local = await getLocalUserKey(params.principalUserId, params.tenantId)
  if (userKey && local?.userKeyId === userKey.id && local.keyVersion === userKey.keyVersion) {
    return { userKey, localKey: local, created: false }
  }
  if (userKey && params.principalUserId && params.secret) {
    const localKey = await unlockStoredUserKey({
      userId: params.principalUserId,
      tenantId: params.tenantId,
      userKey,
      secret: params.secret,
    })
    return { userKey, localKey, created: false }
  }
  if (!userKey && params.principalUserId && params.secret) {
    const backup = await createUserKeyBackup({ tenantId: params.tenantId, secret: params.secret })
    const registered = await params.client.registerUserKey(backup.input)
    const localKey = await saveLocalUserKey({
      userId: params.principalUserId,
      tenantId: params.tenantId,
      userKey: registered.userKey,
      privateKey: backup.privateKey,
    })
    return { userKey: registered.userKey, localKey, created: true }
  }
  return { userKey, localKey: null, created: false }
}

async function derivePackageKey(privateKey: CryptoKey, publicKey: CryptoKey, usages: KeyUsage[]): Promise<CryptoKey> {
  return subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  )
}

type MemberKeyPackageEnvelope = Parameters<Chatv3Client['putMemberKeyPackage']>[0]['envelope']

async function sealMemberPackage(params: {
  userKey: UserKeyBackup
  channelId: string
  memberId: string
  keyId: string
  wrapSecret: string
  sourceEpoch: number
}): Promise<MemberKeyPackageEnvelope> {
  const recipientPublic = await subtle.importKey(
    'spki',
    fromB64Url(params.userKey.publicKey) as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const ephemeral = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
  const packageKey = await derivePackageKey(ephemeral.privateKey, recipientPublic, ['encrypt'])
  const aad = `chatv3-member-key-package:v1:${params.channelId}:${params.memberId}:${params.userKey.keyVersion}`
  const payload: ChannelPackagePayload = {
    version: 1,
    channelId: params.channelId,
    keyId: params.keyId,
    wrapSecret: params.wrapSecret,
    sourceEpoch: params.sourceEpoch,
    issuedAt: new Date().toISOString(),
  }
  const encrypted = await encryptBytes(packageKey, encoder.encode(JSON.stringify(payload)), aad)
  const ephemeralPublicKey = toB64Url(new Uint8Array(await subtle.exportKey('spki', ephemeral.publicKey)))
  return {
    packageVersion: 1,
    packageAlg: 'p256-ecdh+a256gcm',
    ephemeralPublicKey: {
      algorithm: 'p256-ecdh',
      format: 'spki',
      publicKey: ephemeralPublicKey,
    },
    sourceEpoch: params.sourceEpoch,
    ...encrypted,
  }
}

async function openMemberPackage(privateKey: CryptoKey, keyPackage: MemberKeyPackage): Promise<ChannelPackagePayload> {
  const ephemeralPublic = await subtle.importKey(
    'spki',
    fromB64Url(keyPackage.ephemeralPublicKey) as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const packageKey = await derivePackageKey(privateKey, ephemeralPublic, ['decrypt'])
  const raw = await decryptBytes(packageKey, keyPackage.nonce, keyPackage.ciphertext, keyPackage.aad)
  const parsed = JSON.parse(decoder.decode(raw)) as ChannelPackagePayload
  if (parsed.version !== 1 || !parsed.keyId || !parsed.wrapSecret) {
    throw new Error('invalid member key-package payload')
  }
  return parsed
}

export async function publishSelfKeyPackage(params: {
  client: Chatv3Client
  tenantId: string
  principalUserId?: string | null
  secret?: ChatRecoverySecret | null
  channel: Pick<Channel, 'id' | 'tenantId' | 'spaceId'>
  member: (ChannelMember & { userId?: string | null }) | null | undefined
  keyId: string | null
  wrapSecret: string | null
  sourceEpoch: number
}): Promise<boolean> {
  if (!params.member?.id || !params.keyId || !params.wrapSecret) return false
  const { userKey } = await ensureLocalUserKey({
    client: params.client,
    tenantId: params.tenantId,
    principalUserId: params.principalUserId,
    secret: params.secret,
  })
  if (!userKey) return false
  const envelope = await sealMemberPackage({
    userKey,
    channelId: params.channel.id,
    memberId: params.member.id,
    keyId: params.keyId,
    wrapSecret: params.wrapSecret,
    sourceEpoch: params.sourceEpoch,
  })
  await params.client.putMemberKeyPackage({
    tenantId: params.tenantId,
    channelId: params.channel.id,
    memberId: params.member.id,
    recipientUserKeyId: userKey.id,
    recipientKeyVersion: userKey.keyVersion,
    envelope,
  })
  await sessionStore.setChannelKeyId(params.channel.id, params.keyId)
  return true
}

export async function restoreRecoveredChannelCrypto(params: {
  client: Chatv3Client
  tenantId: string
  principalUserId?: string | null
  channel: Pick<Channel, 'id' | 'tenantId' | 'spaceId'>
  rooms?: Array<Pick<Room, 'id' | 'currentEpoch'>>
  recovery: MemberRecoveryResult
  secret?: ChatRecoverySecret | null
}): Promise<{ memberToken: string; keyId: string; wrapSecret: string } | null> {
  if (!isRecoverableState(params.recovery.recoveryState) || !params.recovery.memberToken || !params.recovery.keyPackage) {
    throw new ChatRecoveryStepError(
      'recovery.restore.preflight',
      `state=${params.recovery.recoveryState}; memberToken=${Boolean(params.recovery.memberToken)}; keyPackage=${Boolean(params.recovery.keyPackage)}`,
    )
  }
  const completed: string[] = []
  let localKey: StoredUserKey | null = null
  try {
    const ensured = await ensureLocalUserKey({
      client: params.client,
      tenantId: params.tenantId,
      principalUserId: params.principalUserId,
      secret: params.secret,
    })
    localKey = ensured.localKey
    if (!localKey) throw new Error('local account key unavailable after unlock')
    completed.push('account-key.unlock')
  } catch (error) {
    throw restoreStepError('account-key.unlock', error, completed)
  }

  let payload: ChannelPackagePayload
  try {
    payload = await openMemberPackage(localKey.privateKey, params.recovery.keyPackage)
    completed.push('member-package.unseal')
  } catch (error) {
    throw restoreStepError('member-package.unseal', error, completed)
  }

  try {
    await keyStore.setWrapSecret(params.channel.id, payload.wrapSecret)
    await sessionStore.setChannelMemberToken(params.channel.id, params.recovery.memberToken)
    await sessionStore.setChannelKeyId(params.channel.id, payload.keyId)
    await params.client.rememberChannelInvite({
      serverBaseUrl: '',
      channelId: params.channel.id,
      keyId: payload.keyId,
      accessSecret: '',
      wrapSecret: payload.wrapSecret,
    })
    params.client.http.memberToken = params.recovery.memberToken
    completed.push('wrap-secret.store')
  } catch (error) {
    throw restoreStepError('wrap-secret.store', error, completed)
  }

  try {
    const rooms = params.rooms ?? (await params.client.listRooms(params.channel.id, { status: 'active' }))
    for (const room of rooms) {
      const epochs = await params.client.http.get<RoomEpochRow[]>(`/rooms/${room.id}/epochs`)
      for (const epoch of epochs) {
        const kek = await deriveKek(payload.wrapSecret, {
          tenantId: params.channel.tenantId,
          spaceId: params.channel.spaceId,
          keyId: payload.keyId,
          epoch: epoch.epoch,
        })
        const epochKey = await unwrapEpochKey(kek, epoch.wrappedKeyBlob)
        await keyStore.setEpochKey(epoch.roomId, epoch.epoch, epochKey)
      }
    }
    completed.push('epoch.hydrate')
  } catch (error) {
    throw restoreStepError('epoch.hydrate', error, completed)
  }
  return { memberToken: params.recovery.memberToken, keyId: payload.keyId, wrapSecret: payload.wrapSecret }
}

export async function hydrateLocalChannelCrypto(params: {
  client: Chatv3Client
  channel: Pick<Channel, 'id' | 'tenantId' | 'spaceId'>
  rooms?: Array<Pick<Room, 'id' | 'currentEpoch'>>
}): Promise<boolean> {
  const crypto = await storedChannelCrypto(params.channel.id)
  if (!crypto.keyId || !crypto.wrapSecret) return false
  await params.client.rememberChannelInvite({
    serverBaseUrl: '',
    channelId: params.channel.id,
    keyId: crypto.keyId,
    accessSecret: '',
    wrapSecret: crypto.wrapSecret,
  })
  const rooms = params.rooms ?? (await params.client.listRooms(params.channel.id, { status: 'active' }).catch(() => []))
  for (const room of rooms) {
    const existing = await keyStore.getEpochKey(room.id, room.currentEpoch).catch(() => null)
    if (existing) continue
    const epochs = await params.client.http.get<RoomEpochRow[]>(`/rooms/${room.id}/epochs`).catch(() => [])
    for (const epoch of epochs) {
      const kek = await deriveKek(crypto.wrapSecret, {
        tenantId: params.channel.tenantId,
        spaceId: params.channel.spaceId,
        keyId: crypto.keyId,
        epoch: epoch.epoch,
      })
      const epochKey = await unwrapEpochKey(kek, epoch.wrappedKeyBlob)
      await keyStore.setEpochKey(epoch.roomId, epoch.epoch, epochKey)
    }
  }
  return true
}

export async function storedChannelCrypto(channelId: string): Promise<{ keyId: string | null; wrapSecret: string | null }> {
  const [keyId, wrapSecret] = await Promise.all([
    sessionStore.getChannelKeyId(channelId).catch(() => null),
    keyStore.getWrapSecret(channelId).catch(() => null),
  ])
  return { keyId, wrapSecret }
}

export async function hasLocalChannelCrypto(channelId: string): Promise<boolean> {
  const crypto = await storedChannelCrypto(channelId)
  return Boolean(crypto.keyId && crypto.wrapSecret)
}
