import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type EncryptedPayload = {
  v: 1
  kdf: 'scrypt'
  salt: string
  iv: string
  tag: string
  data: string
}

type ConfigLockReceipt = {
  schemaVersion: 1
  pid: number
  createdAtMs: number
  nonce: string
}

export type AopsApiTargetAuthProvider = 'trusted-local' | 'authv2-jwt-session'
export type AopsApiTargetTlsPolicy = 'loopback-http' | 'system-ca'

export type AopsApiTargetCompatibilityObservation = {
  checkedAt: string
  status: 'compatible' | 'warning' | 'incompatible' | 'unavailable'
  serverVersion?: string
  serverCommandSchemaMin?: number
  serverCommandSchemaMax?: number
  reason?: string
}

export type AopsApiTarget = {
  schemaVersion: 1
  apiBaseUrl: string
  endpointSha256: string
  authProvider: AopsApiTargetAuthProvider
  tlsPolicy: AopsApiTargetTlsPolicy
  compatibility?: AopsApiTargetCompatibilityObservation
}

type StoredTargetCredentials = {
  schemaVersion: 1
  endpointSha256: string
  credentialRevision: string
  accessTokenEnc: string
  refreshTokenEnc: string
  userId?: string
}

type StoredAopsApiTarget = AopsApiTarget & {
  credentials?: StoredTargetCredentials
}

type AopsClientTargetConfig = {
  schemaVersion: 1
  activeTarget?: string
  targets: Record<string, StoredAopsApiTarget>
}

type AopsConfig = Record<string, unknown> & {
  clientTargets?: AopsClientTargetConfig
  apiServer?: string
  apiAccessToken?: string
  apiRefreshToken?: string
  apiAccessTokenEnc?: string
  apiRefreshTokenEnc?: string
  apiUserId?: string
}

export type CachedApiTokens = {
  targetName?: string
  apiBaseUrl?: string
  credentialRevision?: string
  accessToken?: string
  refreshToken?: string
  userId?: string
}

export type AopsApiTargetSummary = AopsApiTarget & {
  name: string
  active: boolean
  hasCredentials: boolean
  userId?: string
}

const CONFIG_FILENAME = 'aops.config.json'
const TOKEN_KEY_FILENAME = 'aops.mcp.key'
const TARGET_NAME = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const CREDENTIAL_REVISION = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONFIG_LOCK_STALE_MS = 30_000
const cachedTokensByTarget = new Map<string, CachedApiTokens>()
const loadedTargets = new Set<string>()

function tokenCacheKey(name: string): string {
  return `${getAopsCliConfigFilePath()}\0${name}`
}

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isWindowsDrivePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value)
}

export function getAopsCliConfigFilePath(): string {
  const envPath = process.env.AOPS_CLI_CONFIG_PATH?.trim() || process.env.AGENT_OPS_CONFIG_PATH?.trim()
  if (envPath && (process.platform === 'win32' || !isWindowsDrivePath(envPath))) {
    return path.extname(envPath).toLowerCase() === '.json'
      ? path.resolve(envPath)
      : path.resolve(envPath, CONFIG_FILENAME)
  }
  return path.join(os.homedir(), '.aops', CONFIG_FILENAME)
}

function assertSafeExistingPath(candidate: string, kind: 'file' | 'directory'): void {
  if (!fs.existsSync(candidate)) return
  const stat = fs.lstatSync(candidate)
  if (stat.isSymbolicLink()) throw new Error(`aops_cli_config_${kind}_symlink_refused`)
  if (kind === 'file' && !stat.isFile()) throw new Error('aops_cli_config_path_not_file')
  if (kind === 'directory' && !stat.isDirectory()) throw new Error('aops_cli_config_parent_not_directory')
}

function enforceOwnerOnlyMode(candidate: string, mode: 0o600 | 0o700, kind: 'file' | 'directory'): void {
  if (process.platform === 'win32') return
  try {
    fs.chmodSync(candidate, mode)
    if ((fs.statSync(candidate).mode & 0o077) !== 0) {
      throw new Error('mode_not_owner_only')
    }
  } catch (error) {
    throw new Error(`aops_cli_config_${kind}_permissions_enforcement_failed`, { cause: error })
  }
}

function ensureConfigDirectory(configPath: string): void {
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  assertSafeExistingPath(dir, 'directory')
  enforceOwnerOnlyMode(dir, 0o700, 'directory')
}

function readConfig(): AopsConfig {
  const configPath = getAopsCliConfigFilePath()
  if (!fs.existsSync(configPath)) return {}
  assertSafeExistingPath(configPath, 'file')
  enforceOwnerOnlyMode(configPath, 0o600, 'file')
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (error) {
    throw new Error(`aops_cli_config_invalid_json:${configPath}`, { cause: error })
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`aops_cli_config_invalid_root:${configPath}`)
  }
  return parsed as AopsConfig
}

function writeConfig(config: AopsConfig): void {
  const configPath = getAopsCliConfigFilePath()
  ensureConfigDirectory(configPath)
  assertSafeExistingPath(configPath, 'file')
  const temporary = path.join(
    path.dirname(configPath),
    `.${path.basename(configPath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  )
  let temporaryFd: number | undefined
  try {
    temporaryFd = fs.openSync(temporary, 'wx', 0o600)
    fs.writeFileSync(temporaryFd, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
    fs.fsyncSync(temporaryFd)
    fs.closeSync(temporaryFd)
    temporaryFd = undefined
    fs.renameSync(temporary, configPath)
    enforceOwnerOnlyMode(configPath, 0o600, 'file')
    if (process.platform !== 'win32') {
      let directoryFd: number | undefined
      try {
        directoryFd = fs.openSync(path.dirname(configPath), 'r')
        fs.fsyncSync(directoryFd)
      } finally {
        if (directoryFd !== undefined) fs.closeSync(directoryFd)
      }
    }
  } finally {
    if (temporaryFd !== undefined) {
      try { fs.closeSync(temporaryFd) } catch {}
    }
    fs.rmSync(temporary, { force: true })
  }
}

function serializeLockReceipt(receipt: ConfigLockReceipt): string {
  return `${JSON.stringify(receipt)}\n`
}

function parseLockReceipt(value: string): ConfigLockReceipt | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<ConfigLockReceipt>
    if (
      parsed.schemaVersion !== 1 || !Number.isSafeInteger(parsed.pid) || Number(parsed.pid) < 1 ||
      !Number.isSafeInteger(parsed.createdAtMs) || Number(parsed.createdAtMs) < 0 ||
      typeof parsed.nonce !== 'string' || !/^[a-f0-9-]{36}$/i.test(parsed.nonce)
    ) return undefined
    return parsed as ConfigLockReceipt
  } catch {
    return undefined
  }
}

function isProcessAlive(pid: number): boolean {
  if (pid === process.pid) return true
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH'
  }
}

function removeStaleConfigLock(lockPath: string): boolean {
  assertSafeExistingPath(lockPath, 'file')
  let observed: string
  try { observed = fs.readFileSync(lockPath, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
  const receipt = parseLockReceipt(observed)
  if (!receipt || Date.now() - receipt.createdAtMs <= CONFIG_LOCK_STALE_MS || isProcessAlive(receipt.pid)) {
    return false
  }
  let current: string
  try { current = fs.readFileSync(lockPath, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
  if (current !== observed) return false
  try { fs.rmSync(lockPath) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
  return true
}

function withConfigMutation<T>(mutation: (config: AopsConfig) => T): T {
  const configPath = getAopsCliConfigFilePath()
  ensureConfigDirectory(configPath)
  const lockPath = `${configPath}.lock`
  const lockReceipt: ConfigLockReceipt = {
    schemaVersion: 1,
    pid: process.pid,
    createdAtMs: Date.now(),
    nonce: crypto.randomUUID(),
  }
  const lockReceiptText = serializeLockReceipt(lockReceipt)
  let lockFd: number | undefined
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      lockFd = fs.openSync(lockPath, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (removeStaleConfigLock(lockPath)) continue
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
      continue
    }
    try {
      fs.writeFileSync(lockFd, lockReceiptText, 'utf8')
      fs.fsyncSync(lockFd)
      break
    } catch (error) {
      try { fs.closeSync(lockFd) } catch {}
      lockFd = undefined
      try { fs.rmSync(lockPath, { force: true }) } catch {}
      throw error
    }
  }
  if (lockFd === undefined) throw new Error('aops_cli_config_lock_busy')
  try {
    const config = readConfig()
    const result = mutation(config)
    writeConfig(config)
    return result
  } finally {
    try { fs.closeSync(lockFd) } catch {}
    try {
      if (fs.readFileSync(lockPath, 'utf8') === lockReceiptText) fs.rmSync(lockPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}

function getTokenKeyFilePath(): string {
  return path.join(path.dirname(getAopsCliConfigFilePath()), TOKEN_KEY_FILENAME)
}

function resolveTokenSecret(options?: { ensure?: boolean }): string | undefined {
  const envSecret = process.env.AOPS_MCP_TOKEN_SECRET?.trim() || process.env.AOPS_MCP_CONFIG_SECRET?.trim()
  if (envSecret) return envSecret
  const keyFilePath = getTokenKeyFilePath()
  if (fs.existsSync(keyFilePath)) {
    assertSafeExistingPath(keyFilePath, 'file')
    enforceOwnerOnlyMode(keyFilePath, 0o600, 'file')
    return normalizeNonEmpty(fs.readFileSync(keyFilePath, 'utf8'))
  }
  if (!options?.ensure) return undefined
  ensureConfigDirectory(keyFilePath)
  const secret = crypto.randomBytes(32).toString('base64')
  let keyFd: number | undefined
  let createdKeyFile = false
  try {
    keyFd = fs.openSync(keyFilePath, 'wx', 0o600)
    createdKeyFile = true
    fs.writeFileSync(keyFd, `${secret}\n`, 'utf8')
    fs.fsyncSync(keyFd)
    fs.closeSync(keyFd)
    keyFd = undefined
    enforceOwnerOnlyMode(keyFilePath, 0o600, 'file')
    return secret
  } catch (error) {
    if (keyFd !== undefined) {
      try { fs.closeSync(keyFd) } catch {}
    }
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      if (createdKeyFile) {
        try { fs.rmSync(keyFilePath, { force: true }) } catch {}
      }
      throw error
    }
    assertSafeExistingPath(keyFilePath, 'file')
    enforceOwnerOnlyMode(keyFilePath, 0o600, 'file')
    return normalizeNonEmpty(fs.readFileSync(keyFilePath, 'utf8'))
  }
}

function encodeEncryptedPayload(payload: EncryptedPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')
}

function decodeEncryptedPayload(value: string): EncryptedPayload {
  const payload = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as Partial<EncryptedPayload>
  if (
    payload.v !== 1 || payload.kdf !== 'scrypt' ||
    !normalizeNonEmpty(payload.salt) || !normalizeNonEmpty(payload.iv) ||
    !normalizeNonEmpty(payload.tag) || !normalizeNonEmpty(payload.data)
  ) {
    throw new Error('aops_cli_token_payload_invalid')
  }
  return payload as EncryptedPayload
}

async function deriveTokenKey(secret: string, salt: Buffer): Promise<Buffer> {
  return await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(secret, salt, 32, (error, key) => {
      if (error) reject(error)
      else resolve(key as Buffer)
    })
  })
}

async function encryptToken(value: string): Promise<string> {
  const secret = resolveTokenSecret({ ensure: true })
  if (!secret) throw new Error('aops_cli_token_secret_unavailable')
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = await deriveTokenKey(secret, salt)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return encodeEncryptedPayload({
    v: 1,
    kdf: 'scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  })
}

async function decryptToken(value: string): Promise<string | undefined> {
  const secret = resolveTokenSecret({ ensure: false })
  if (!secret) return undefined
  try {
    const payload = decodeEncryptedPayload(value)
    const salt = Buffer.from(payload.salt, 'base64')
    const key = await deriveTokenKey(secret, salt)
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return undefined
  }
}

export function normalizeApiTargetName(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!TARGET_NAME.test(normalized)) throw new Error('aops_target_name_invalid')
  return normalized
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (normalized === 'localhost' || normalized === '::1') return true
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized)
  return Boolean(ipv4 && Number(ipv4[1]) === 127 && ipv4.slice(1).every((part) => Number(part) <= 255))
}

export function normalizeApiTargetBaseUrl(value: string): string {
  let parsed: URL
  try { parsed = new URL(value.trim()) } catch { throw new Error('aops_target_url_invalid') }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('aops_target_url_protocol_invalid')
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('aops_target_url_credentials_or_suffix_refused')
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') throw new Error('aops_target_url_path_refused')
  parsed.pathname = ''
  return parsed.toString().replace(/\/$/, '')
}

export function apiTargetEndpointSha256(apiBaseUrl: string): string {
  return `sha256:${crypto.createHash('sha256').update(normalizeApiTargetBaseUrl(apiBaseUrl)).digest('hex')}`
}

export function validateApiTarget(input: {
  apiBaseUrl: string
  authProvider?: AopsApiTargetAuthProvider
  tlsPolicy?: AopsApiTargetTlsPolicy
}): AopsApiTarget {
  const apiBaseUrl = normalizeApiTargetBaseUrl(input.apiBaseUrl)
  const parsed = new URL(apiBaseUrl)
  const loopback = isLoopbackHostname(parsed.hostname)
  const authProvider = input.authProvider ?? (loopback ? 'trusted-local' : 'authv2-jwt-session')
  const tlsPolicy = input.tlsPolicy ?? (parsed.protocol === 'http:' ? 'loopback-http' : 'system-ca')
  if (!['trusted-local', 'authv2-jwt-session'].includes(authProvider)) throw new Error('aops_target_auth_provider_invalid')
  if (!['loopback-http', 'system-ca'].includes(tlsPolicy)) throw new Error('aops_target_tls_policy_invalid')
  if (parsed.protocol === 'http:' && (!loopback || tlsPolicy !== 'loopback-http')) {
    throw new Error('aops_target_plain_http_non_loopback_refused')
  }
  if (parsed.protocol === 'https:' && tlsPolicy !== 'system-ca') throw new Error('aops_target_https_tls_policy_invalid')
  if (authProvider === 'trusted-local' && !loopback) throw new Error('aops_target_trusted_local_non_loopback_refused')
  if (!loopback && (parsed.protocol !== 'https:' || authProvider !== 'authv2-jwt-session')) {
    throw new Error('aops_target_remote_requires_https_authv2')
  }
  return {
    schemaVersion: 1,
    apiBaseUrl,
    endpointSha256: apiTargetEndpointSha256(apiBaseUrl),
    authProvider,
    tlsPolicy,
  }
}

function isStoredCredentials(value: unknown, endpointSha256: string): value is StoredTargetCredentials {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const credentials = value as Partial<StoredTargetCredentials>
  return credentials.schemaVersion === 1 &&
    credentials.endpointSha256 === endpointSha256 &&
    typeof credentials.credentialRevision === 'string' && CREDENTIAL_REVISION.test(credentials.credentialRevision) &&
    Boolean(normalizeNonEmpty(credentials.accessTokenEnc)) &&
    Boolean(normalizeNonEmpty(credentials.refreshTokenEnc)) &&
    (credentials.userId === undefined || typeof credentials.userId === 'string')
}

function isStoredTarget(value: unknown): value is StoredAopsApiTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const target = value as Partial<StoredAopsApiTarget>
  try {
    const validated = validateApiTarget({
      apiBaseUrl: String(target.apiBaseUrl ?? ''),
      authProvider: target.authProvider,
      tlsPolicy: target.tlsPolicy,
    })
    return target.schemaVersion === 1 && target.endpointSha256 === validated.endpointSha256 &&
      (target.credentials === undefined || isStoredCredentials(target.credentials, validated.endpointSha256))
  } catch {
    return false
  }
}

function hasLegacyCredentialFields(config: AopsConfig): boolean {
  return Boolean(
    normalizeNonEmpty(config.apiAccessToken) || normalizeNonEmpty(config.apiRefreshToken) ||
    normalizeNonEmpty(config.apiAccessTokenEnc) || normalizeNonEmpty(config.apiRefreshTokenEnc),
  )
}

function legacyCredentialFingerprint(config: AopsConfig): string | undefined {
  if (!hasLegacyCredentialFields(config)) return undefined
  const snapshot = [
    normalizeNonEmpty(config.apiServer),
    normalizeNonEmpty(config.apiAccessToken),
    normalizeNonEmpty(config.apiRefreshToken),
    normalizeNonEmpty(config.apiAccessTokenEnc),
    normalizeNonEmpty(config.apiRefreshTokenEnc),
    normalizeNonEmpty(config.apiUserId),
  ]
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')}`
}

function resolveLegacyCredentialTargetName(
  config: AopsConfig,
  targetConfig: AopsClientTargetConfig,
): string | undefined {
  if (!hasLegacyCredentialFields(config)) return undefined
  const legacyTarget = validateApiTarget({
    apiBaseUrl: normalizeNonEmpty(config.apiServer) ?? 'http://localhost:5900',
  })
  const matches = Object.entries(targetConfig.targets)
    .filter(([, target]) => target.apiBaseUrl === legacyTarget.apiBaseUrl)
    .map(([name]) => name)
  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? 'aops_legacy_credentials_target_conflict'
      : 'aops_legacy_credentials_target_ambiguous')
  }
  return matches[0]
}

function readTargetConfig(config: AopsConfig): AopsClientTargetConfig {
  const raw = config.clientTargets
  const targets = Object.create(null) as Record<string, StoredAopsApiTarget>
  const endpointOwners = new Map<string, string>()
  if (raw?.schemaVersion === 1 && raw.targets && typeof raw.targets === 'object' && !Array.isArray(raw.targets)) {
    for (const [name, target] of Object.entries(raw.targets)) {
      if (normalizeApiTargetName(name) !== name || !isStoredTarget(target)) {
        throw new Error(`aops_target_config_invalid:${name}`)
      }
      const owner = endpointOwners.get(target.apiBaseUrl)
      if (owner) throw new Error(`aops_target_endpoint_duplicate:${owner}:${name}`)
      endpointOwners.set(target.apiBaseUrl, name)
      targets[name] = structuredClone(target)
    }
  } else if (raw !== undefined) {
    throw new Error('aops_target_config_schema_invalid')
  }

  let activeTarget = normalizeNonEmpty(raw?.activeTarget)
  if (activeTarget && !Object.hasOwn(targets, activeTarget)) throw new Error('aops_target_active_missing')

  const legacyUrl = normalizeNonEmpty(config.apiServer)
  const hasLegacyCredentials = hasLegacyCredentialFields(config)
  if ((legacyUrl || hasLegacyCredentials) && Object.keys(targets).length === 0) {
    const target = validateApiTarget({ apiBaseUrl: legacyUrl ?? 'http://localhost:5900' }) as StoredAopsApiTarget
    targets.default = target
    activeTarget = 'default'
  }
  const targetConfig = { schemaVersion: 1 as const, activeTarget, targets }
  resolveLegacyCredentialTargetName(config, targetConfig)
  return targetConfig
}

function publicSummary(name: string, target: StoredAopsApiTarget, activeTarget?: string): AopsApiTargetSummary {
  const { credentials, ...safe } = target
  return {
    ...structuredClone(safe),
    name,
    active: name === activeTarget,
    hasCredentials: Boolean(credentials),
    userId: credentials?.userId,
  }
}

export function listApiTargets(): AopsApiTargetSummary[] {
  const targetConfig = readTargetConfig(readConfig())
  return Object.entries(targetConfig.targets)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, target]) => publicSummary(name, target, targetConfig.activeTarget))
}

export function getApiTarget(name: string): AopsApiTargetSummary | undefined {
  const targetConfig = readTargetConfig(readConfig())
  const normalized = normalizeApiTargetName(name)
  const target = targetConfig.targets[normalized]
  return target ? publicSummary(normalized, target, targetConfig.activeTarget) : undefined
}

export function getActiveApiTarget(): AopsApiTargetSummary | undefined {
  const targetConfig = readTargetConfig(readConfig())
  const name = targetConfig.activeTarget
  const target = name ? targetConfig.targets[name] : undefined
  return name && target ? publicSummary(name, target, name) : undefined
}

export function findApiTargetByBaseUrl(apiBaseUrl: string): AopsApiTargetSummary | undefined {
  const normalizedUrl = normalizeApiTargetBaseUrl(apiBaseUrl)
  return listApiTargets().find((target) => target.apiBaseUrl === normalizedUrl)
}

export function setApiTarget(input: {
  name: string
  apiBaseUrl: string
  authProvider?: AopsApiTargetAuthProvider
  tlsPolicy?: AopsApiTargetTlsPolicy
  activate?: boolean
}): AopsApiTargetSummary {
  const name = normalizeApiTargetName(input.name)
  const nextTarget = validateApiTarget(input)
  return withConfigMutation((config) => {
    const targetConfig = readTargetConfig(config)
    const existing = targetConfig.targets[name]
    const legacyTargetName = resolveLegacyCredentialTargetName(config, targetConfig)
    if (
      (existing?.credentials || legacyTargetName === name) &&
      existing?.endpointSha256 !== nextTarget.endpointSha256
    ) {
      throw new Error('aops_target_endpoint_change_requires_remove')
    }
    const duplicate = Object.entries(targetConfig.targets)
      .find(([candidateName, target]) => candidateName !== name && target.apiBaseUrl === nextTarget.apiBaseUrl)
    if (duplicate) throw new Error(`aops_target_endpoint_already_bound:${duplicate[0]}`)
    targetConfig.targets[name] = { ...nextTarget, credentials: existing?.credentials }
    targetConfig.activeTarget = input.activate || !targetConfig.activeTarget ? name : targetConfig.activeTarget
    config.clientTargets = targetConfig
    return publicSummary(name, targetConfig.targets[name], targetConfig.activeTarget)
  })
}

export function useApiTarget(name: string): AopsApiTargetSummary {
  const normalized = normalizeApiTargetName(name)
  return withConfigMutation((config) => {
    const targetConfig = readTargetConfig(config)
    const target = targetConfig.targets[normalized]
    if (!Object.hasOwn(targetConfig.targets, normalized) || !target) throw new Error(`aops_target_not_found:${normalized}`)
    targetConfig.activeTarget = normalized
    config.clientTargets = targetConfig
    return publicSummary(normalized, target, normalized)
  })
}

export function removeApiTarget(name: string): void {
  const normalized = normalizeApiTargetName(name)
  withConfigMutation((config) => {
    const targetConfig = readTargetConfig(config)
    if (!Object.hasOwn(targetConfig.targets, normalized)) throw new Error(`aops_target_not_found:${normalized}`)
    const legacyTargetName = resolveLegacyCredentialTargetName(config, targetConfig)
    delete targetConfig.targets[normalized]
    if (targetConfig.activeTarget === normalized) targetConfig.activeTarget = undefined
    config.clientTargets = targetConfig
    if (legacyTargetName === normalized) stripLegacyTokenFields(config)
  })
  cachedTokensByTarget.delete(tokenCacheKey(normalized))
  loadedTargets.delete(tokenCacheKey(normalized))
}

export function recordApiTargetCompatibility(
  name: string,
  observation: AopsApiTargetCompatibilityObservation,
): AopsApiTargetSummary {
  const normalized = normalizeApiTargetName(name)
  return withConfigMutation((config) => {
    const targetConfig = readTargetConfig(config)
    const target = targetConfig.targets[normalized]
    if (!Object.hasOwn(targetConfig.targets, normalized) || !target) throw new Error(`aops_target_not_found:${normalized}`)
    target.compatibility = structuredClone(observation)
    config.clientTargets = targetConfig
    return publicSummary(normalized, target, targetConfig.activeTarget)
  })
}

export function getConfigApiServer(): string | undefined {
  return getActiveApiTarget()?.apiBaseUrl
}

function resolveTokenTarget(input: { targetName?: string; apiServer?: string }): {
  name: string
  target: StoredAopsApiTarget
  existed: boolean
  credentialRevision?: string
} {
  const targetConfig = readTargetConfig(readConfig())
  const explicitName = input.targetName ? normalizeApiTargetName(input.targetName) : undefined
  if (explicitName) {
    const target = targetConfig.targets[explicitName]
    if (!Object.hasOwn(targetConfig.targets, explicitName) || !target) throw new Error(`aops_target_not_found:${explicitName}`)
    if (input.apiServer && normalizeApiTargetBaseUrl(input.apiServer) !== target.apiBaseUrl) {
      throw new Error('aops_target_api_base_url_mismatch')
    }
    return { name: explicitName, target, existed: true, credentialRevision: target.credentials?.credentialRevision }
  }
  if (input.apiServer) {
    const normalizedUrl = normalizeApiTargetBaseUrl(input.apiServer)
    const match = Object.entries(targetConfig.targets).find(([, target]) => target.apiBaseUrl === normalizedUrl)
    if (match) return {
      name: match[0],
      target: match[1],
      existed: true,
      credentialRevision: match[1].credentials?.credentialRevision,
    }
    if (Object.keys(targetConfig.targets).length === 0) {
      const target = validateApiTarget({ apiBaseUrl: normalizedUrl }) as StoredAopsApiTarget
      return { name: 'default', target, existed: false }
    }
    throw new Error('aops_target_not_found_for_api_base_url:run_aops-cli_target_add')
  }
  const activeName = targetConfig.activeTarget
  const active = activeName ? targetConfig.targets[activeName] : undefined
  if (!activeName || !active) throw new Error('aops_target_active_missing:run_aops-cli_target_use')
  return { name: activeName, target: active, existed: true, credentialRevision: active.credentials?.credentialRevision }
}

function stripLegacyTokenFields(config: AopsConfig): void {
  delete config.apiServer
  delete config.apiAccessToken
  delete config.apiRefreshToken
  delete config.apiAccessTokenEnc
  delete config.apiRefreshTokenEnc
  delete config.apiUserId
}

export async function setApiTokensInConfig(tokens: {
  accessToken: string
  refreshToken: string
  userId?: string
  apiServer?: string
  targetName?: string
  expectedCredentialRevision?: string | null
  expectedLegacyCredentialFingerprint?: string
}): Promise<string> {
  const accessToken = normalizeNonEmpty(tokens.accessToken)
  const refreshToken = normalizeNonEmpty(tokens.refreshToken)
  if (!accessToken || !refreshToken) throw new Error('aops_target_token_pair_required')
  const resolved = resolveTokenTarget(tokens)
  const [accessTokenEnc, refreshTokenEnc] = await Promise.all([
    encryptToken(accessToken),
    encryptToken(refreshToken),
  ])
  const [verifiedAccessToken, verifiedRefreshToken] = await Promise.all([
    decryptToken(accessTokenEnc),
    decryptToken(refreshTokenEnc),
  ])
  if (verifiedAccessToken !== accessToken || verifiedRefreshToken !== refreshToken) {
    throw new Error('aops_target_token_encryption_verification_failed')
  }
  const credentialRevision = crypto.randomUUID()
  const target = withConfigMutation((config) => {
    const targetConfig = readTargetConfig(config)
    if (
      tokens.expectedLegacyCredentialFingerprint !== undefined &&
      legacyCredentialFingerprint(config) !== tokens.expectedLegacyCredentialFingerprint
    ) {
      throw new Error('aops_legacy_credentials_changed_during_migration')
    }
    const legacyTargetName = resolveLegacyCredentialTargetName(config, targetConfig)
    let currentTarget = targetConfig.targets[resolved.name]
    if (!currentTarget && resolved.existed) throw new Error('aops_target_removed_during_token_write')
    currentTarget ??= resolved.target
    if (currentTarget.endpointSha256 !== resolved.target.endpointSha256) throw new Error('aops_target_endpoint_changed_during_token_write')
    const duplicate = Object.entries(targetConfig.targets)
      .find(([candidateName, candidate]) => candidateName !== resolved.name && candidate.apiBaseUrl === currentTarget.apiBaseUrl)
    if (duplicate) throw new Error(`aops_target_endpoint_already_bound:${duplicate[0]}`)
    if (
      tokens.expectedCredentialRevision !== undefined &&
      (currentTarget.credentials?.credentialRevision ?? null) !== tokens.expectedCredentialRevision
    ) {
      throw new Error('aops_target_credentials_changed_during_token_write')
    }
    currentTarget.credentials = {
      schemaVersion: 1,
      endpointSha256: currentTarget.endpointSha256,
      credentialRevision,
      accessTokenEnc,
      refreshTokenEnc,
      userId: normalizeNonEmpty(tokens.userId),
    }
    targetConfig.targets[resolved.name] = currentTarget
    targetConfig.activeTarget ??= resolved.name
    config.clientTargets = targetConfig
    if (legacyTargetName === resolved.name) stripLegacyTokenFields(config)
    return currentTarget
  })
  cachedTokensByTarget.set(tokenCacheKey(resolved.name), {
    targetName: resolved.name,
    apiBaseUrl: target.apiBaseUrl,
    credentialRevision,
    accessToken,
    refreshToken,
    userId: normalizeNonEmpty(tokens.userId),
  })
  loadedTargets.add(tokenCacheKey(resolved.name))
  return credentialRevision
}

export function clearApiTokensInConfig(targetName?: string): boolean {
  const result = withConfigMutation((config) => {
    const targetConfig = readTargetConfig(config)
    const selected = targetName ? normalizeApiTargetName(targetName) : targetConfig.activeTarget
    if (!selected) throw new Error('aops_target_active_missing:run_aops-cli_target_use')
    const target = targetConfig.targets[selected]
    if (!Object.hasOwn(targetConfig.targets, selected) || !target) throw new Error(`aops_target_not_found:${selected}`)
    const legacyTargetName = resolveLegacyCredentialTargetName(config, targetConfig)
    const cleared = Boolean(target.credentials) || legacyTargetName === selected
    delete target.credentials
    config.clientTargets = targetConfig
    if (legacyTargetName === selected) stripLegacyTokenFields(config)
    return { selected, cleared }
  })
  cachedTokensByTarget.delete(tokenCacheKey(result.selected))
  loadedTargets.add(tokenCacheKey(result.selected))
  return result.cleared
}

async function readStoredTargetTokens(name: string, target: StoredAopsApiTarget): Promise<CachedApiTokens> {
  const credentials = target.credentials
  if (!credentials || credentials.endpointSha256 !== target.endpointSha256) return {}
  const [accessToken, refreshToken] = await Promise.all([
    decryptToken(credentials.accessTokenEnc),
    decryptToken(credentials.refreshTokenEnc),
  ])
  if (!accessToken || !refreshToken) return {}
  return {
    targetName: name,
    apiBaseUrl: target.apiBaseUrl,
    credentialRevision: credentials.credentialRevision,
    accessToken,
    refreshToken,
    userId: credentials.userId,
  }
}

export async function loadApiTokensFromConfig(targetName?: string): Promise<void> {
  let config = readConfig()
  let targetConfig = readTargetConfig(config)
  const legacyTargetName = resolveLegacyCredentialTargetName(config, targetConfig)
  if (legacyTargetName) {
    const expectedLegacyCredentialFingerprint = legacyCredentialFingerprint(config)
    if (!expectedLegacyCredentialFingerprint) throw new Error('aops_legacy_credentials_snapshot_missing')
    if (targetConfig.targets[legacyTargetName]?.credentials) {
      throw new Error('aops_legacy_credentials_target_already_has_credentials')
    }
    const accessTokenEnc = normalizeNonEmpty(config.apiAccessTokenEnc)
    const refreshTokenEnc = normalizeNonEmpty(config.apiRefreshTokenEnc)
    const plaintextAccessToken = normalizeNonEmpty(config.apiAccessToken)
    const plaintextRefreshToken = normalizeNonEmpty(config.apiRefreshToken)
    let accessToken: string | undefined
    let refreshToken: string | undefined
    if (accessTokenEnc && refreshTokenEnc) {
      ;[accessToken, refreshToken] = await Promise.all([
        decryptToken(accessTokenEnc),
        decryptToken(refreshTokenEnc),
      ])
    }
    if ((!accessToken || !refreshToken) && plaintextAccessToken && plaintextRefreshToken) {
      accessToken = plaintextAccessToken
      refreshToken = plaintextRefreshToken
    }
    if (!accessToken || !refreshToken) {
      throw new Error('aops_legacy_credentials_incomplete_or_unreadable')
    }
    await setApiTokensInConfig({
      targetName: legacyTargetName,
      accessToken,
      refreshToken,
      userId: normalizeNonEmpty(config.apiUserId),
      expectedCredentialRevision: null,
      expectedLegacyCredentialFingerprint,
    })
    config = readConfig()
    targetConfig = readTargetConfig(config)
  }
  const name = targetName ? normalizeApiTargetName(targetName) : targetConfig.activeTarget
  if (!name) return
  const target = targetConfig.targets[name]
  if (!target) throw new Error(`aops_target_not_found:${name}`)
  cachedTokensByTarget.delete(tokenCacheKey(name))
  loadedTargets.add(tokenCacheKey(name))
  const stored = await readStoredTargetTokens(name, target)
  if (stored.accessToken && stored.refreshToken) {
    cachedTokensByTarget.set(tokenCacheKey(name), stored)
    return
  }
}

export async function ensureApiTokensLoaded(targetName?: string): Promise<void> {
  const name = targetName ? normalizeApiTargetName(targetName) : getActiveApiTarget()?.name
  if (name && !loadedTargets.has(tokenCacheKey(name))) await loadApiTokensFromConfig(name)
}

export function getCachedApiTokens(targetName?: string): CachedApiTokens {
  const name = targetName ? normalizeApiTargetName(targetName) : getActiveApiTarget()?.name
  return name ? { ...(cachedTokensByTarget.get(tokenCacheKey(name)) ?? {}) } : {}
}

export async function readApiTokensFromConfigFile(targetName?: string): Promise<CachedApiTokens> {
  const targetConfig = readTargetConfig(readConfig())
  const name = targetName ? normalizeApiTargetName(targetName) : targetConfig.activeTarget
  const target = name ? targetConfig.targets[name] : undefined
  return name && target ? readStoredTargetTokens(name, target) : {}
}
