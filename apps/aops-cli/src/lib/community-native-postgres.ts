import { createHash, randomBytes } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

import {
  communityProcessRuntime,
  type CommunityProcessResult,
  type CommunityProcessRuntime,
} from './community-docker-adapter.js'
import {
  CommunityCommandAbortedError,
  throwIfCommunityCommandAborted,
} from './community-command-abort.js'

export const COMMUNITY_NATIVE_POSTGRES_CONTRACT_PATH = 'community-postgres.json'

const SHA256 = /^sha256:[a-f0-9]{64}$/
const IMAGE_REF = /^ghcr\.io\/eeemzs\/aops-community-base-postgres:17-bookworm@(sha256:[a-f0-9]{64})$/
const SAFE_NAME = /^[a-z0-9][a-z0-9_.-]{0,179}$/
const NAMESPACE = /^[a-f0-9]{12}$/
const SECRET = /^[A-Za-z0-9_-]{32,}$/
const DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/
const MAX_CONTRACT_BYTES = 65_536
const MAX_SECRET_BYTES = 4_096
const LABEL_PROFILE = 'io.aopslab.aops-community.profile'
const LABEL_INSTANCE = 'io.aopslab.aops-community.instance'
const LABEL_NAMESPACE = 'io.aopslab.aops-community.namespace'
const LABEL_SECRET_SHA256 = 'io.aopslab.aops-community.secret-sha256'
const PROFILE = 'native-container-postgres'
const DEFAULT_READY_TIMEOUT_MS = 90_000
const READY_POLL_MS = 500
const POSTGRES_DATA_MOUNT = '/var/lib/postgresql/data'
const POSTGRES_PORT_KEY = '5432/tcp'
const SAFE_ENV_INSPECT_FORMAT = '{{range .Config.Env}}{{if eq (index (split . "=") 0) "POSTGRES_DB"}}{{println .}}{{end}}{{if eq (index (split . "=") 0) "POSTGRES_USER"}}{{println .}}{{end}}{{end}}'

export type CommunityNativePostgresContract = Readonly<{
  schemaVersion: 1
  profile: typeof PROFILE
  engine: 'postgresql'
  majorVersion: 17
  imageRef: string
  imageDigest: string
  database: 'aops'
  username: 'aops'
  containerPort: 5432
  dataMount: '/var/lib/postgresql/data'
  bindHost: '127.0.0.1'
}>

export type CommunityNativePostgresState = {
  mode: 'container'
  contractRef: string
  contractSha256: string
  imageRef: string
  imageDigest: string
  namespace: string
  containerName: string
  volumeName: string
  secretRef: string
  secretSha256: string
  host: '127.0.0.1'
  port: number
}

export type CommunityNativePostgresRuntime = Readonly<{
  run: CommunityProcessRuntime['run']
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>
}>

export type CommunityNativePostgresStatus = {
  container: 'missing' | 'created' | 'running' | 'stopped' | 'unhealthy'
  health: 'healthy' | 'starting' | 'unhealthy' | 'not-checked'
  imageRef: string
  containerName: string
  volumeName: string
  host: '127.0.0.1'
  port: number
}

export const communityNativePostgresRuntime: CommunityNativePostgresRuntime = {
  run: (invocation) => communityProcessRuntime.run(invocation),
  sleep: (milliseconds, signal) => {
    throwIfCommunityCommandAborted(signal)
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        reject(new CommunityCommandAbortedError())
      }
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, milliseconds)
      signal?.addEventListener('abort', onAbort, { once: true })
      if (signal?.aborted) onAbort()
    })
  },
}

function sha256(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function exactKeys(input: Record<string, unknown>, expected: string[], code: string): void {
  const actual = Object.keys(input).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(code)
  }
}

function redactDiagnostic(value: string): string {
  return value
    .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(/((?:password|passwd|secret|token)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .slice(-1_000)
}

function parseContract(value: unknown): CommunityNativePostgresContract {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community_native_postgres_contract_invalid')
  }
  const input = value as Record<string, any>
  exactKeys(input, [
    'schemaVersion', 'profile', 'engine', 'majorVersion', 'imageRef', 'imageDigest',
    'database', 'username', 'containerPort', 'dataMount', 'bindHost',
  ], 'community_native_postgres_contract_schema_invalid')
  const imageMatch = IMAGE_REF.exec(String(input.imageRef))
  if (
    input.schemaVersion !== 1 || input.profile !== PROFILE || input.engine !== 'postgresql' ||
    input.majorVersion !== 17 || !imageMatch || !SHA256.test(String(input.imageDigest)) ||
    imageMatch[1] !== input.imageDigest || input.database !== 'aops' || input.username !== 'aops' ||
    input.containerPort !== 5432 || input.dataMount !== '/var/lib/postgresql/data' ||
    input.bindHost !== '127.0.0.1'
  ) throw new Error('community_native_postgres_contract_schema_invalid')
  return Object.freeze(input as CommunityNativePostgresContract)
}

export function inspectCommunityNativePostgresContract(sourceRoot: string): {
  contract: CommunityNativePostgresContract
  contractRef: string
  contractSha256: string
} {
  const resolvedRoot = path.resolve(sourceRoot)
  let rootStats: ReturnType<typeof lstatSync>
  try { rootStats = lstatSync(resolvedRoot) } catch { throw new Error('community_native_postgres_source_root_invalid') }
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error('community_native_postgres_source_root_invalid')
  }
  const realRoot = realpathSync(resolvedRoot)
  const candidate = path.resolve(realRoot, COMMUNITY_NATIVE_POSTGRES_CONTRACT_PATH)
  if (!isWithin(realRoot, candidate)) throw new Error('community_native_postgres_contract_path_escape')
  let stats: ReturnType<typeof lstatSync>
  try { stats = lstatSync(candidate) } catch { throw new Error('community_native_postgres_contract_file_invalid') }
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.size > MAX_CONTRACT_BYTES) {
    throw new Error('community_native_postgres_contract_file_invalid')
  }
  const contractRef = realpathSync(candidate)
  if (!isWithin(realRoot, contractRef)) throw new Error('community_native_postgres_contract_path_escape')
  const content = readFileSync(contractRef)
  let parsed: unknown
  try { parsed = JSON.parse(content.toString('utf8')) } catch {
    throw new Error('community_native_postgres_contract_json_invalid')
  }
  return { contract: parseContract(parsed), contractRef, contractSha256: sha256(content) }
}

export function assertCommunityNativePostgresState(value: unknown): CommunityNativePostgresState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community_native_postgres_state_invalid')
  }
  const input = value as Record<string, any>
  exactKeys(input, [
    'mode', 'contractRef', 'contractSha256', 'imageRef', 'imageDigest', 'namespace',
    'containerName', 'volumeName', 'secretRef', 'secretSha256', 'host', 'port',
  ], 'community_native_postgres_state_schema_invalid')
  const imageMatch = IMAGE_REF.exec(String(input.imageRef))
  if (
    input.mode !== 'container' || !path.isAbsolute(String(input.contractRef)) ||
    !SHA256.test(String(input.contractSha256)) || !imageMatch ||
    !SHA256.test(String(input.imageDigest)) || imageMatch[1] !== input.imageDigest ||
    !NAMESPACE.test(String(input.namespace)) || !SAFE_NAME.test(String(input.containerName)) ||
    !SAFE_NAME.test(String(input.volumeName)) || !path.isAbsolute(String(input.secretRef)) ||
    !SHA256.test(String(input.secretSha256)) ||
    input.host !== '127.0.0.1' || !Number.isSafeInteger(input.port) || input.port < 1 || input.port > 65_535
  ) throw new Error('community_native_postgres_state_schema_invalid')
  return input as CommunityNativePostgresState
}

function readSecret(secretRef: string): {
  database: 'aops'
  username: 'aops'
  password: string
  secretSha256: string
} {
  const resolved = path.resolve(secretRef)
  let stats: ReturnType<typeof lstatSync>
  try { stats = lstatSync(resolved) } catch { throw new Error('community_native_postgres_secret_invalid') }
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.size > MAX_SECRET_BYTES) {
    throw new Error('community_native_postgres_secret_invalid')
  }
  const content = readFileSync(resolved)
  let parsed: ReturnType<typeof parseEnv>
  try { parsed = parseEnv(content.toString('utf8')) } catch {
    throw new Error('community_native_postgres_secret_invalid')
  }
  exactKeys(parsed, ['POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'], 'community_native_postgres_secret_invalid')
  const password = String(parsed.POSTGRES_PASSWORD ?? '')
  if (parsed.POSTGRES_DB !== 'aops' || parsed.POSTGRES_USER !== 'aops' || !SECRET.test(password)) {
    throw new Error('community_native_postgres_secret_invalid')
  }
  return { database: 'aops', username: 'aops', password, secretSha256: sha256(content) }
}

function ensureSecret(secretRef: string, createSecret: () => string): ReturnType<typeof readSecret> {
  if (existsSync(secretRef)) {
    return readSecret(secretRef)
  }
  const secret = createSecret()
  if (!SECRET.test(secret)) throw new Error('community_native_postgres_generated_secret_invalid')
  mkdirSync(path.dirname(secretRef), { recursive: true, mode: 0o700 })
  writeFileSync(
    secretRef,
    `POSTGRES_DB=aops\nPOSTGRES_USER=aops\nPOSTGRES_PASSWORD=${secret}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  )
  return readSecret(secretRef)
}

function assertSecretFingerprint(
  secretRef: string,
  expectedSecretSha256: string,
): ReturnType<typeof readSecret> {
  const secret = readSecret(secretRef)
  if (secret.secretSha256 !== expectedSecretSha256) {
    throw new Error('community_native_postgres_secret_identity_mismatch')
  }
  return secret
}

function dockerInvocation(args: string[], signal?: AbortSignal) {
  return { command: 'docker' as const, args, env: {}, signal }
}

async function runDocker(
  runtime: CommunityNativePostgresRuntime,
  args: string[],
  operation: string,
  signal?: AbortSignal,
): Promise<CommunityProcessResult> {
  throwIfCommunityCommandAborted(signal)
  const result = await runtime.run(dockerInvocation(args, signal))
  throwIfCommunityCommandAborted(signal)
  if (result.exitCode !== 0) {
    throw new Error(`community_native_postgres_${operation}_failed:${result.exitCode ?? result.signal ?? 'unknown'}:${redactDiagnostic(result.stderr)}`)
  }
  return result
}

function isMissing(result: CommunityProcessResult): boolean {
  return result.exitCode !== 0 && /No such (?:container|object|volume)/i.test(result.stderr)
}

async function inspectLabels(
  runtime: CommunityNativePostgresRuntime,
  kind: 'container' | 'volume',
  name: string,
  signal?: AbortSignal,
): Promise<Record<string, string> | null> {
  const format = kind === 'container' ? '{{json .Config.Labels}}' : '{{json .Labels}}'
  throwIfCommunityCommandAborted(signal)
  const result = await runtime.run(dockerInvocation([kind, 'inspect', '--format', format, name], signal))
  throwIfCommunityCommandAborted(signal)
  if (isMissing(result)) return null
  if (result.exitCode !== 0) {
    throw new Error(`community_native_postgres_${kind}_inspect_failed:${redactDiagnostic(result.stderr)}`)
  }
  let parsed: unknown
  try { parsed = JSON.parse(result.stdout.trim()) } catch {
    throw new Error(`community_native_postgres_${kind}_labels_invalid`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`community_native_postgres_${kind}_labels_invalid`)
  }
  return parsed as Record<string, string>
}

async function inspectContainerJson(
  runtime: CommunityNativePostgresRuntime,
  name: string,
  format: string,
  operation: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const result = await runDocker(
    runtime,
    ['container', 'inspect', '--format', format, name],
    operation,
    signal,
  )
  try {
    return JSON.parse(result.stdout.trim())
  } catch {
    throw new Error(`community_native_postgres_${operation}_invalid`)
  }
}

function assertOwnedLabels(
  labels: Record<string, string>,
  state: Pick<CommunityNativePostgresState, 'namespace' | 'secretSha256'> & { instanceName: string },
  kind: string,
): void {
  if (
    labels[LABEL_PROFILE] !== PROFILE || labels[LABEL_INSTANCE] !== state.instanceName ||
    labels[LABEL_NAMESPACE] !== state.namespace || labels[LABEL_SECRET_SHA256] !== state.secretSha256
  ) throw new Error(`community_native_postgres_${kind}_ownership_conflict`)
}

function identity(instanceName: string, instanceRoot: string) {
  const namespace = createHash('sha256').update(path.resolve(instanceRoot)).digest('hex').slice(0, 12)
  return {
    namespace,
    containerName: `aops-community-${instanceName}-${namespace}-postgres`,
    volumeName: `aops-community-${instanceName}-${namespace}-postgres-data`,
  }
}

function sameResolvedPath(left: string, right: string): boolean {
  const resolvedLeft = path.resolve(left)
  const resolvedRight = path.resolve(right)
  return process.platform === 'win32'
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight
}

export function assertCommunityNativePostgresInstanceState(params: {
  state: CommunityNativePostgresState
  instanceName: string
  instanceRoot: string
}): CommunityNativePostgresState {
  const state = assertCommunityNativePostgresState(params.state)
  const expected = identity(params.instanceName, params.instanceRoot)
  const expectedSecretRef = path.join(path.resolve(params.instanceRoot), 'runtime', 'native-postgres.env')
  if (
    state.namespace !== expected.namespace || state.containerName !== expected.containerName ||
    state.volumeName !== expected.volumeName || !sameResolvedPath(state.secretRef, expectedSecretRef)
  ) throw new Error('community_native_postgres_state_identity_mismatch')
  assertSecretFingerprint(state.secretRef, state.secretSha256)
  return state
}

function ownershipArgs(instanceName: string, namespace: string, secretSha256: string): string[] {
  return [
    '--label', `${LABEL_PROFILE}=${PROFILE}`,
    '--label', `${LABEL_INSTANCE}=${instanceName}`,
    '--label', `${LABEL_NAMESPACE}=${namespace}`,
    '--label', `${LABEL_SECRET_SHA256}=${secretSha256}`,
  ]
}

async function verifyContainer(
  runtime: CommunityNativePostgresRuntime,
  state: CommunityNativePostgresState,
  instanceName: string,
  signal?: AbortSignal,
  verifyPersistedPort = true,
): Promise<boolean> {
  const labels = await inspectLabels(runtime, 'container', state.containerName, signal)
  if (!labels) return false
  assertOwnedLabels(labels, {
    namespace: state.namespace,
    secretSha256: state.secretSha256,
    instanceName,
  }, 'container')
  const image = await runDocker(
    runtime,
    ['container', 'inspect', '--format', '{{.Config.Image}}', state.containerName],
    'container_image_inspect',
    signal,
  )
  if (image.stdout.trim() !== state.imageRef) throw new Error('community_native_postgres_container_image_drift')

  const mounts = await inspectContainerJson(
    runtime,
    state.containerName,
    '{{json .Mounts}}',
    'container_mount_inspect',
    signal,
  )
  if (
    !Array.isArray(mounts) || mounts.length !== 1 || !mounts[0] || typeof mounts[0] !== 'object' ||
    (mounts[0] as any).Type !== 'volume' || (mounts[0] as any).Name !== state.volumeName ||
    (mounts[0] as any).Destination !== POSTGRES_DATA_MOUNT || (mounts[0] as any).RW !== true
  ) throw new Error('community_native_postgres_container_mount_drift')

  const portBindings = await inspectContainerJson(
    runtime,
    state.containerName,
    '{{json .HostConfig.PortBindings}}',
    'container_port_binding_inspect',
    signal,
  )
  if (!portBindings || typeof portBindings !== 'object' || Array.isArray(portBindings)) {
    throw new Error('community_native_postgres_container_port_binding_drift')
  }
  const bindingKeys = Object.keys(portBindings as Record<string, unknown>)
  const binding = (portBindings as Record<string, unknown>)[POSTGRES_PORT_KEY]
  if (
    bindingKeys.length !== 1 || bindingKeys[0] !== POSTGRES_PORT_KEY || !Array.isArray(binding) ||
    binding.length !== 1 || !binding[0] || typeof binding[0] !== 'object' ||
    (binding[0] as any).HostIp !== '127.0.0.1'
  ) throw new Error('community_native_postgres_container_port_binding_drift')
  const configuredHostPort = (binding[0] as any).HostPort
  const hostPort = configuredHostPort === '' ? null : Number(configuredHostPort)
  if (
    typeof configuredHostPort !== 'string' ||
    (hostPort !== null && (!Number.isSafeInteger(hostPort) || hostPort < 1 || hostPort > 65_535)) ||
    (verifyPersistedPort && hostPort !== null && hostPort !== state.port)
  ) throw new Error('community_native_postgres_container_port_binding_drift')
  if (verifyPersistedPort && await mappedPort(runtime, state, signal) !== state.port) {
    throw new Error('community_native_postgres_container_port_binding_drift')
  }

  const restartPolicy = await inspectContainerJson(
    runtime,
    state.containerName,
    '{{json .HostConfig.RestartPolicy}}',
    'container_restart_policy_inspect',
    signal,
  ) as any
  if (
    !restartPolicy || typeof restartPolicy !== 'object' || Array.isArray(restartPolicy) ||
    restartPolicy.Name !== 'unless-stopped' || restartPolicy.MaximumRetryCount !== 0
  ) throw new Error('community_native_postgres_container_restart_policy_drift')

  const safeEnv = await runDocker(
    runtime,
    ['container', 'inspect', '--format', SAFE_ENV_INSPECT_FORMAT, state.containerName],
    'container_safe_env_inspect',
    signal,
  )
  const safeEnvLines = safeEnv.stdout.trim().split(/\r?\n/).filter(Boolean).sort()
  if (
    safeEnvLines.length !== 2 || safeEnvLines[0] !== 'POSTGRES_DB=aops' ||
    safeEnvLines[1] !== 'POSTGRES_USER=aops'
  ) throw new Error('community_native_postgres_container_safe_env_drift')

  const health = await inspectContainerJson(
    runtime,
    state.containerName,
    '{{json .Config.Healthcheck}}',
    'container_healthcheck_inspect',
    signal,
  ) as any
  if (
    !health || typeof health !== 'object' || Array.isArray(health) ||
    !Array.isArray(health.Test) || health.Test.length !== 2 || health.Test[0] !== 'CMD-SHELL' ||
    health.Test[1] !== 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' ||
    health.Interval !== 5_000_000_000 || health.Timeout !== 5_000_000_000 ||
    health.Retries !== 20 || health.StartPeriod !== 10_000_000_000 ||
    (health.StartInterval !== undefined && health.StartInterval !== 0)
  ) throw new Error('community_native_postgres_container_healthcheck_drift')
  return true
}

async function containerState(runtime: CommunityNativePostgresRuntime, name: string, signal?: AbortSignal): Promise<{
  status: string
  health: string | null
}> {
  const result = await runDocker(
    runtime,
    ['container', 'inspect', '--format', '{{json .State}}', name],
    'state_inspect',
    signal,
  )
  let parsed: any
  try { parsed = JSON.parse(result.stdout.trim()) } catch { throw new Error('community_native_postgres_container_state_invalid') }
  const status = String(parsed?.Status ?? '')
  const health = parsed?.Health?.Status == null ? null : String(parsed.Health.Status)
  if (!['created', 'running', 'exited', 'dead', 'restarting'].includes(status)) {
    throw new Error('community_native_postgres_container_state_invalid')
  }
  return { status, health }
}

async function mappedPort(
  runtime: CommunityNativePostgresRuntime,
  state: CommunityNativePostgresState,
  signal?: AbortSignal,
): Promise<number> {
  const result = await runDocker(
    runtime,
    ['container', 'port', state.containerName, '5432/tcp'],
    'port_inspect',
    signal,
  )
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length !== 1) throw new Error('community_native_postgres_port_mapping_invalid')
  const match = /^127\.0\.0\.1:(\d{1,5})$/.exec(lines[0]!)
  const port = Number(match?.[1])
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('community_native_postgres_port_mapping_invalid')
  }
  return port
}

async function waitReady(
  runtime: CommunityNativePostgresRuntime,
  state: CommunityNativePostgresState,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<number> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    throwIfCommunityCommandAborted(signal)
    const observed = await containerState(runtime, state.containerName, signal)
    if (observed.status === 'running' && observed.health === 'healthy') {
      const port = await mappedPort(runtime, state, signal)
      const smoke = await runDocker(runtime, [
        'container', 'exec', state.containerName,
        'psql', '-U', 'aops', '-d', 'aops', '--tuples-only', '--no-align', '--command', 'SELECT 1',
      ], 'data_smoke', signal)
      if (smoke.stdout.trim() !== '1') throw new Error('community_native_postgres_data_smoke_failed')
      return port
    }
    if (observed.status === 'exited' || observed.status === 'dead' || observed.health === 'unhealthy') {
      throw new Error(`community_native_postgres_unhealthy:${observed.status}:${observed.health ?? 'unknown'}`)
    }
    await runtime.sleep(READY_POLL_MS, signal)
    throwIfCommunityCommandAborted(signal)
  }
  throw new Error('community_native_postgres_ready_timeout')
}

export async function setupCommunityNativePostgres(params: {
  sourceRoot: string
  instanceRoot: string
  runtimeRoot: string
  instanceName: string
  runtime?: CommunityNativePostgresRuntime
  createSecret?: () => string
  readyTimeoutMs?: number
  signal?: AbortSignal
}): Promise<CommunityNativePostgresState> {
  throwIfCommunityCommandAborted(params.signal)
  const runtime = params.runtime ?? communityNativePostgresRuntime
  const inspected = inspectCommunityNativePostgresContract(params.sourceRoot)
  const names = identity(params.instanceName, params.instanceRoot)
  const secretRef = path.join(path.resolve(params.runtimeRoot), 'native-postgres.env')
  const secret = ensureSecret(secretRef, params.createSecret ?? (() => randomBytes(32).toString('base64url')))
  const seed: CommunityNativePostgresState = {
    mode: 'container',
    contractRef: inspected.contractRef,
    contractSha256: inspected.contractSha256,
    imageRef: inspected.contract.imageRef,
    imageDigest: inspected.contract.imageDigest,
    namespace: names.namespace,
    containerName: names.containerName,
    volumeName: names.volumeName,
    secretRef,
    secretSha256: secret.secretSha256,
    host: '127.0.0.1',
    port: 1,
  }
  await runDocker(runtime, ['image', 'pull', seed.imageRef], 'image_pull', params.signal)
  const volumeLabels = await inspectLabels(runtime, 'volume', seed.volumeName, params.signal)
  if (volumeLabels) {
    assertOwnedLabels(volumeLabels, {
      namespace: seed.namespace,
      secretSha256: seed.secretSha256,
      instanceName: params.instanceName,
    }, 'volume')
  } else {
    await runDocker(runtime, [
      'volume', 'create', ...ownershipArgs(params.instanceName, seed.namespace, seed.secretSha256), seed.volumeName,
    ], 'volume_create', params.signal)
    const createdLabels = await inspectLabels(runtime, 'volume', seed.volumeName, params.signal)
    if (!createdLabels) throw new Error('community_native_postgres_volume_create_unverified')
    assertOwnedLabels(createdLabels, {
      namespace: seed.namespace,
      secretSha256: seed.secretSha256,
      instanceName: params.instanceName,
    }, 'volume')
  }
  const existing = await inspectLabels(runtime, 'container', seed.containerName, params.signal)
  let created = false
  if (existing) {
    assertOwnedLabels(existing, {
      namespace: seed.namespace,
      secretSha256: seed.secretSha256,
      instanceName: params.instanceName,
    }, 'container')
    const verified = await verifyContainer(runtime, seed, params.instanceName, params.signal, false)
    if (!verified) throw new Error('community_native_postgres_container_missing')
  } else {
    await runDocker(runtime, [
      'container', 'create', '--name', seed.containerName,
      ...ownershipArgs(params.instanceName, seed.namespace, seed.secretSha256),
      '--restart', 'unless-stopped',
      '--publish', '127.0.0.1::5432',
      '--mount', `type=volume,source=${seed.volumeName},target=/var/lib/postgresql/data`,
      '--env-file', seed.secretRef,
      '--health-cmd', 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
      '--health-interval', '5s', '--health-timeout', '5s', '--health-retries', '20',
      '--health-start-period', '10s',
      seed.imageRef,
    ], 'container_create', params.signal)
    created = true
  }
  try {
    if (created && !await verifyContainer(runtime, seed, params.instanceName, params.signal, false)) {
      throw new Error('community_native_postgres_container_create_unverified')
    }
    await runDocker(runtime, ['container', 'start', seed.containerName], 'container_start', params.signal)
    const port = await waitReady(runtime, seed, params.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS, params.signal)
    return assertCommunityNativePostgresState({ ...seed, port })
  } catch (error) {
    if (created) {
      try {
        await runtime.run(dockerInvocation(['container', 'rm', '--force', seed.containerName], params.signal))
      } catch { /* best effort */ }
    }
    throw error
  }
}

export async function startCommunityNativePostgres(params: {
  state: CommunityNativePostgresState
  instanceName: string
  instanceRoot: string
  runtime?: CommunityNativePostgresRuntime
  readyTimeoutMs?: number
  signal?: AbortSignal
}): Promise<void> {
  throwIfCommunityCommandAborted(params.signal)
  const state = assertCommunityNativePostgresInstanceState(params)
  const runtime = params.runtime ?? communityNativePostgresRuntime
  if (!await verifyContainer(runtime, state, params.instanceName, params.signal)) {
    throw new Error('community_native_postgres_container_missing:run_server_setup_--apply')
  }
  readSecret(state.secretRef)
  await runDocker(runtime, ['container', 'start', state.containerName], 'container_start', params.signal)
  const port = await waitReady(runtime, state, params.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS, params.signal)
  if (port !== state.port) throw new Error('community_native_postgres_port_mapping_drift:run_server_setup_--apply')
}

export async function stopCommunityNativePostgres(params: {
  state: CommunityNativePostgresState
  instanceName: string
  instanceRoot: string
  runtime?: CommunityNativePostgresRuntime
  signal?: AbortSignal
}): Promise<'stopped' | 'already-stopped'> {
  throwIfCommunityCommandAborted(params.signal)
  const state = assertCommunityNativePostgresInstanceState(params)
  const runtime = params.runtime ?? communityNativePostgresRuntime
  if (!await verifyContainer(runtime, state, params.instanceName, params.signal)) {
    throw new Error('community_native_postgres_container_missing')
  }
  const observed = await containerState(runtime, state.containerName, params.signal)
  if (observed.status === 'exited' || observed.status === 'created') return 'already-stopped'
  await runDocker(runtime, ['container', 'stop', '--time', '15', state.containerName], 'container_stop', params.signal)
  return 'stopped'
}

export async function removeCommunityNativePostgresContainer(params: {
  state: CommunityNativePostgresState
  instanceName: string
  instanceRoot: string
  runtime?: CommunityNativePostgresRuntime
  signal?: AbortSignal
}): Promise<'removed' | 'missing'> {
  throwIfCommunityCommandAborted(params.signal)
  const state = assertCommunityNativePostgresInstanceState(params)
  const runtime = params.runtime ?? communityNativePostgresRuntime
  if (!await verifyContainer(runtime, state, params.instanceName, params.signal)) return 'missing'
  await runDocker(runtime, ['container', 'rm', '--force', state.containerName], 'container_remove', params.signal)
  return 'removed'
}

export async function removeCommunityNativePostgresContainerForReset(params: {
  instanceName: string
  instanceRoot: string
  runtime?: CommunityNativePostgresRuntime
  signal?: AbortSignal
}): Promise<{ container: 'removed' | 'missing'; containerName: string; volumeName: string }> {
  throwIfCommunityCommandAborted(params.signal)
  const runtime = params.runtime ?? communityNativePostgresRuntime
  const expected = identity(params.instanceName, params.instanceRoot)
  const containerLabels = await inspectLabels(runtime, 'container', expected.containerName, params.signal)
  if (!containerLabels) {
    return { container: 'missing', containerName: expected.containerName, volumeName: expected.volumeName }
  }
  const secretRef = path.join(path.resolve(params.instanceRoot), 'runtime', 'native-postgres.env')
  const secret = readSecret(secretRef)
  const ownedState = {
    namespace: expected.namespace,
    secretSha256: secret.secretSha256,
    instanceName: params.instanceName,
  }
  assertOwnedLabels(containerLabels, ownedState, 'container')
  const volumeLabels = await inspectLabels(runtime, 'volume', expected.volumeName, params.signal)
  if (volumeLabels) {
    assertOwnedLabels(volumeLabels, ownedState, 'volume')
  }
  await runDocker(runtime, ['container', 'rm', '--force', expected.containerName], 'container_remove', params.signal)
  return { container: 'removed', containerName: expected.containerName, volumeName: expected.volumeName }
}

export async function inspectCommunityNativePostgres(params: {
  state: CommunityNativePostgresState
  instanceName: string
  instanceRoot: string
  runtime?: CommunityNativePostgresRuntime
  signal?: AbortSignal
}): Promise<CommunityNativePostgresStatus> {
  throwIfCommunityCommandAborted(params.signal)
  const state = assertCommunityNativePostgresInstanceState(params)
  const runtime = params.runtime ?? communityNativePostgresRuntime
  if (!await verifyContainer(runtime, state, params.instanceName, params.signal)) {
    return {
      container: 'missing', health: 'not-checked', imageRef: state.imageRef,
      containerName: state.containerName, volumeName: state.volumeName, host: state.host, port: state.port,
    }
  }
  const observed = await containerState(runtime, state.containerName, params.signal)
  const health = observed.health === 'healthy' || observed.health === 'starting' || observed.health === 'unhealthy'
    ? observed.health
    : 'not-checked'
  const container = observed.status === 'running'
    ? (health === 'unhealthy' ? 'unhealthy' : 'running')
    : observed.status === 'created' ? 'created' : 'stopped'
  return {
    container, health, imageRef: state.imageRef, containerName: state.containerName,
    volumeName: state.volumeName, host: state.host, port: state.port,
  }
}

export function buildCommunityNativePostgresUrl(
  state: CommunityNativePostgresState,
  database = 'aops',
): string {
  const validated = assertCommunityNativePostgresState(state)
  if (!DATABASE_NAME.test(database)) throw new Error('community_native_postgres_database_name_invalid')
  const secret = assertSecretFingerprint(validated.secretRef, validated.secretSha256)
  const url = new URL('postgresql://127.0.0.1/')
  url.username = secret.username
  url.password = secret.password
  url.port = String(validated.port)
  url.pathname = `/${database === 'aops' ? secret.database : database}`
  url.searchParams.set('sslmode', 'disable')
  return url.toString()
}
