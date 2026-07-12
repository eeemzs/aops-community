import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

type EncryptedPayload = {
  v: number
  kdf: 'scrypt'
  salt: string
  iv: string
  tag: string
  data: string
}

type SecureStoreApi = {
  encryptWithPassword: (value: string, password: string) => Promise<{ payload: EncryptedPayload }>
  decryptWithPassword: (payload: EncryptedPayload, password: string) => Promise<string>
}

type AopsConfig = Record<string, unknown> & {
  apiServer?: string
  apiAccessToken?: string
  apiRefreshToken?: string
  apiAccessTokenEnc?: string
  apiRefreshTokenEnc?: string
  apiUserId?: string
}

export type CachedApiTokens = {
  accessToken?: string
  refreshToken?: string
  userId?: string
}

const CONFIG_FILENAME = 'aops.config.json'
const TOKEN_KEY_FILENAME = 'aops.mcp.key'
const KEYTAR_BINARY_RELATIVE_PATH = path.join('build', 'Release', 'keytar.node')
const KEYTAR_REQUIRED_ERROR_CODE = 'AOPS_KEYTAR_REQUIRED'

let cachedApiTokens: CachedApiTokens = {}
let tokensLoaded = false
let secureStoreApiPromise: Promise<SecureStoreApi> | undefined
let secureStoreApiError: Error | undefined
let keytarRepairAttempted = false
const requireFromHere = createRequire(import.meta.url)

type TokenSecretInfo = {
  secret?: string
  source: 'env' | 'file' | 'none'
  keyFilePath: string
}

type RepairAttempt = {
  command: string
  ok: boolean
  output: string
}

type RepairSummary = {
  attempted: boolean
  repaired: boolean
  keytarDir?: string
  attempts: RepairAttempt[]
}

type ErrorWithCode = Error & {
  code?: string
}

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isWindowsDrivePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value)
}

function getConfigFilePath(): string {
  const envPath = process.env.AOPS_CLI_CONFIG_PATH?.trim() || process.env.AGENT_OPS_CONFIG_PATH?.trim()
  if (envPath) {
    if (process.platform === 'win32' || !isWindowsDrivePath(envPath)) {
      return envPath
    }
  }
  return path.join(os.homedir(), '.aops', CONFIG_FILENAME)
}

function readConfig(): AopsConfig {
  const configPath = getConfigFilePath()
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      return (JSON.parse(content) as AopsConfig) ?? {}
    }
  } catch {
    // ignore invalid config
  }
  return {}
}

function writeConfig(config: AopsConfig): void {
  const configPath = getConfigFilePath()
  const dir = path.dirname(configPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

function getTokenKeyFilePath(): string {
  const configPath = getConfigFilePath()
  return path.join(path.dirname(configPath), TOKEN_KEY_FILENAME)
}

function resolveSecureStoreApi(moduleNamespace: unknown): SecureStoreApi | null {
  if (!moduleNamespace || typeof moduleNamespace !== 'object') return null
  const candidate = moduleNamespace as Partial<SecureStoreApi>
  if (
    typeof candidate.encryptWithPassword === 'function' &&
    typeof candidate.decryptWithPassword === 'function'
  ) {
    return candidate as SecureStoreApi
  }
  return null
}

function resolveTokenSecret(options?: { ensure?: boolean }): TokenSecretInfo {
  const keyFilePath = getTokenKeyFilePath()

  const envSecret = process.env.AOPS_MCP_TOKEN_SECRET?.trim() || process.env.AOPS_MCP_CONFIG_SECRET?.trim()
  if (envSecret) {
    return { secret: envSecret, source: 'env', keyFilePath }
  }

  try {
    if (fs.existsSync(keyFilePath)) {
      const content = fs.readFileSync(keyFilePath, 'utf-8').trim()
      if (content) return { secret: content, source: 'file', keyFilePath }
    }
  } catch {
    // ignore key file read failures
  }

  if (!options?.ensure) {
    return { source: 'none', keyFilePath }
  }

  try {
    const dir = path.dirname(keyFilePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    const secret = crypto.randomBytes(32).toString('base64')
    fs.writeFileSync(keyFilePath, `${secret}\n`, { encoding: 'utf-8', mode: 0o600 })
    return { secret, source: 'file', keyFilePath }
  } catch {
    return { source: 'none', keyFilePath }
  }
}

function encodeEncryptedPayload(payload: EncryptedPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64')
}

function decodeEncryptedPayload(value: string): EncryptedPayload {
  const raw = Buffer.from(value, 'base64').toString('utf-8')
  return JSON.parse(raw) as EncryptedPayload
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function getErrorMessage(error: unknown): string {
  return normalizeError(error).message || String(error)
}

function isLikelyKeytarFailure(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  return (
    message.includes('keytar') ||
    message.includes('build/release/keytar.node') ||
    message.includes('build\\release\\keytar.node')
  )
}

function runInstallAttempt(command: string, args: string[], cwd: string): RepairAttempt {
  const display = `${command} ${args.join(' ')}`
  const result = spawnSync(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })

  const output = [result.stdout ?? '', result.stderr ?? '', result.error ? getErrorMessage(result.error) : '']
    .join('\n')
    .trim()

  return {
    command: display,
    ok: result.status === 0 && !result.error,
    output,
  }
}

function resolveKeytarDirectory(): string | undefined {
  try {
    const secureStorePkgJson = requireFromHere.resolve('@aopslab/xf-secure-store/package.json')
    const requireFromSecureStore = createRequire(secureStorePkgJson)
    const keytarPkgJson = requireFromSecureStore.resolve('keytar/package.json')
    return path.dirname(keytarPkgJson)
  } catch {
    return undefined
  }
}

function hasKeytarBinary(keytarDir: string): boolean {
  const keytarBinaryPath = path.join(keytarDir, KEYTAR_BINARY_RELATIVE_PATH)
  return fs.existsSync(keytarBinaryPath)
}

function tryRepairKeytar(error: unknown): RepairSummary {
  if (keytarRepairAttempted) {
    return { attempted: false, repaired: false, attempts: [] }
  }
  if (!isLikelyKeytarFailure(error)) {
    return { attempted: false, repaired: false, attempts: [] }
  }

  keytarRepairAttempted = true
  const keytarDir = resolveKeytarDirectory()
  if (!keytarDir) {
    return { attempted: true, repaired: false, attempts: [] }
  }

  if (hasKeytarBinary(keytarDir)) {
    return { attempted: true, repaired: true, keytarDir, attempts: [] }
  }

  const attempts: RepairAttempt[] = []
  const commands: Array<{ command: string; args: string[] }> = [
    { command: 'pnpm', args: ['--dir', keytarDir, 'run', 'install'] },
    { command: 'npm', args: ['--prefix', keytarDir, 'run', 'install'] },
  ]

  for (const item of commands) {
    const attempt = runInstallAttempt(item.command, item.args, keytarDir)
    attempts.push(attempt)
    if (hasKeytarBinary(keytarDir)) {
      return { attempted: true, repaired: true, keytarDir, attempts }
    }
  }

  return { attempted: true, repaired: false, keytarDir, attempts }
}

function buildKeytarRequiredError(cause: unknown, repair: RepairSummary): ErrorWithCode {
  const reason = getErrorMessage(cause)
  const lines: string[] = [
    'Failed to load @aopslab/xf-secure-store because keytar native module is required.',
    `Reason: ${reason}`,
  ]

  if (repair.attempted) {
    lines.push('Automatic keytar native repair was attempted.')
  } else {
    lines.push('Automatic keytar native repair was not attempted.')
  }

  if (repair.keytarDir) {
    lines.push(`keytar package path: ${repair.keytarDir}`)
    lines.push(`Try: pnpm --dir "${repair.keytarDir}" run install`)
    lines.push(`Or : npm --prefix "${repair.keytarDir}" run install`)
  } else {
    lines.push('keytar package path could not be resolved from current installation.')
    lines.push('Try: pnpm install --force')
  }

  if (repair.attempts.length > 0) {
    lines.push('Automatic repair command outputs:')
    for (const attempt of repair.attempts) {
      const output = attempt.output.length > 0 ? attempt.output : '(no output)'
      lines.push(`- ${attempt.ok ? '[ok]' : '[fail]'} ${attempt.command}`)
      lines.push(`  ${output}`)
    }
  }

  lines.push('If prebuilt binaries are unavailable and source build is required, ensure node-gyp requirements are installed (Python + C++ Build Tools).')
  const error = new Error(lines.join('\n')) as ErrorWithCode
  error.name = 'KeytarRequiredError'
  error.code = KEYTAR_REQUIRED_ERROR_CODE
  return error
}

function importSecureStoreApi(): SecureStoreApi {
  const moduleNamespace = requireFromHere('@aopslab/xf-secure-store')
  const secureStore =
    resolveSecureStoreApi(moduleNamespace) ??
    resolveSecureStoreApi((moduleNamespace as { default?: unknown }).default)

  if (!secureStore) {
    throw new Error('Invalid @aopslab/xf-secure-store export shape. encryptWithPassword/decryptWithPassword are required.')
  }

  return secureStore
}

function requireKeytarModule(): unknown {
  const secureStorePkgJson = requireFromHere.resolve('@aopslab/xf-secure-store/package.json')
  const requireFromSecureStore = createRequire(secureStorePkgJson)
  return requireFromSecureStore('keytar')
}

function clearSecureStoreRequireCache(): void {
  try {
    const secureStoreEntry = requireFromHere.resolve('@aopslab/xf-secure-store')
    delete requireFromHere.cache[secureStoreEntry]
  } catch {
    // ignore
  }
  try {
    const secureStorePkgJson = requireFromHere.resolve('@aopslab/xf-secure-store/package.json')
    const requireFromSecureStore = createRequire(secureStorePkgJson)
    const keytarEntry = requireFromSecureStore.resolve('keytar')
    delete requireFromSecureStore.cache[keytarEntry]
  } catch {
    // ignore
  }
}

function ensureKeytarReady(): void {
  try {
    requireKeytarModule()
    return
  } catch (error) {
    const repair = tryRepairKeytar(error)
    if (repair.repaired) {
      clearSecureStoreRequireCache()
      try {
        requireKeytarModule()
        return
      } catch (retryError) {
        throw buildKeytarRequiredError(retryError, repair)
      }
    }
    throw buildKeytarRequiredError(error, repair)
  }
}

async function loadSecureStoreApi(): Promise<SecureStoreApi> {
  if (secureStoreApiError) throw secureStoreApiError
  if (!secureStoreApiPromise) {
    secureStoreApiPromise = (async () => {
      ensureKeytarReady()
      return importSecureStoreApi()
    })()
  }

  try {
    return await secureStoreApiPromise
  } catch (error) {
    secureStoreApiError = normalizeError(error)
    secureStoreApiPromise = undefined
    throw secureStoreApiError
  }
}

async function encryptToken(value: string): Promise<string> {
  const { secret } = resolveTokenSecret({ ensure: true })
  if (!secret) {
    throw new Error('Token secret is not available. Set AOPS_MCP_TOKEN_SECRET or allow creating the key file.')
  }

  const secureStore = await loadSecureStoreApi()
  const result = await secureStore.encryptWithPassword(value, secret)
  return encodeEncryptedPayload(result.payload)
}

async function decryptToken(value: string): Promise<string | undefined> {
  const { secret } = resolveTokenSecret({ ensure: false })
  if (!secret) return undefined

  let payload: EncryptedPayload
  try {
    payload = decodeEncryptedPayload(value)
  } catch {
    return undefined
  }

  const secureStore = await loadSecureStoreApi()
  try {
    return await secureStore.decryptWithPassword(payload, secret)
  } catch {
    return undefined
  }
}

export function getConfigApiServer(): string | undefined {
  const config = readConfig()
  return normalizeNonEmpty(config.apiServer)
}

export async function setApiTokensInConfig(tokens: {
  accessToken: string
  refreshToken: string
  userId?: string
  apiServer?: string
}): Promise<void> {
  const [accessEnc, refreshEnc] = await Promise.all([
    encryptToken(tokens.accessToken),
    encryptToken(tokens.refreshToken),
  ])

  const current = readConfig()
  const next: AopsConfig = {
    ...current,
    apiServer: normalizeNonEmpty(tokens.apiServer) ?? current.apiServer,
    apiUserId: normalizeNonEmpty(tokens.userId) ?? current.apiUserId,
    apiAccessTokenEnc: accessEnc,
    apiRefreshTokenEnc: refreshEnc,
  }

  delete next.apiAccessToken
  delete next.apiRefreshToken

  writeConfig(next)
  cachedApiTokens = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, userId: tokens.userId }
}

export function clearApiTokensInConfig(): void {
  const current = readConfig()
  const next: AopsConfig = { ...current }
  delete next.apiAccessToken
  delete next.apiRefreshToken
  delete next.apiAccessTokenEnc
  delete next.apiRefreshTokenEnc
  delete next.apiUserId
  writeConfig(next)
  cachedApiTokens = {}
}

export async function loadApiTokensFromConfig(): Promise<void> {
  cachedApiTokens = {}
  tokensLoaded = true

  const config = readConfig()
  const userId = normalizeNonEmpty(config.apiUserId)

  const accessEnc = normalizeNonEmpty(config.apiAccessTokenEnc)
  const refreshEnc = normalizeNonEmpty(config.apiRefreshTokenEnc)
  if (accessEnc && refreshEnc) {
    const [accessToken, refreshToken] = await Promise.all([decryptToken(accessEnc), decryptToken(refreshEnc)])
    if (accessToken && refreshToken) {
      cachedApiTokens = { accessToken, refreshToken, userId }
      return
    }
  }

  const accessToken = normalizeNonEmpty(config.apiAccessToken)
  const refreshToken = normalizeNonEmpty(config.apiRefreshToken)
  if (accessToken && refreshToken) {
    cachedApiTokens = { accessToken, refreshToken, userId }
    await setApiTokensInConfig({ accessToken, refreshToken, userId, apiServer: config.apiServer })
  }
}

export async function ensureApiTokensLoaded(): Promise<void> {
  if (!tokensLoaded) {
    await loadApiTokensFromConfig()
  }
}

export function getCachedApiTokens(): CachedApiTokens {
  return { ...cachedApiTokens }
}

/**
 * Read the latest API tokens directly from the config file WITHOUT mutating the
 * in-memory cache and WITHOUT re-encrypting. Used to recover after a concurrent
 * refresh race, where another CLI process has already rotated the token pair and
 * written it to the shared config.
 */
export async function readApiTokensFromConfigFile(): Promise<CachedApiTokens> {
  const config = readConfig()
  const userId = normalizeNonEmpty(config.apiUserId)

  const accessEnc = normalizeNonEmpty(config.apiAccessTokenEnc)
  const refreshEnc = normalizeNonEmpty(config.apiRefreshTokenEnc)
  if (accessEnc && refreshEnc) {
    try {
      const [accessToken, refreshToken] = await Promise.all([decryptToken(accessEnc), decryptToken(refreshEnc)])
      if (accessToken && refreshToken) return { accessToken, refreshToken, userId }
    } catch {
      // ignore decrypt failures; fall through to plaintext / empty
    }
  }

  const accessToken = normalizeNonEmpty(config.apiAccessToken)
  const refreshToken = normalizeNonEmpty(config.apiRefreshToken)
  if (accessToken && refreshToken) return { accessToken, refreshToken, userId }

  return {}
}
