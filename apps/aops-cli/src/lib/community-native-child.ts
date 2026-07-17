import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const COMMUNITY_NATIVE_CHILD_PROTOCOL = 'aops-community-native-child-v1'
export const COMMUNITY_NATIVE_CONTROL_PROTOCOL = 'aops-community-native-control-v1'

export type CommunityNativeChildIdentity = {
  schemaVersion: 1
  protocol: typeof COMMUNITY_NATIVE_CHILD_PROTOCOL
  launchId: string
  pid: number
  hostPid: number
  startedAt: string
  sourceFingerprint: string
  hostEntry: string
  controlPath: string
  port: number
}

export type CommunityNativeControlRequest = {
  schemaVersion: 1
  protocol: typeof COMMUNITY_NATIVE_CONTROL_PROTOCOL
  launchId: string
  command: 'stop'
  requestedAt: string
}

export type CommunityNativeChildRuntime = {
  spawnHost?: (hostEntry: string, env: NodeJS.ProcessEnv) => ChildProcess
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256 = /^sha256:[a-f0-9]{64}$/
const HOST_STOP_GRACE_MS = 2_000

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = String(env[key] ?? '').trim()
  if (!value) throw new Error(`community_native_child_env_required:${key}`)
  return value
}

function parsePort(value: string): number {
  if (!/^[1-9]\d{0,4}$/.test(value) || Number(value) > 65_535) {
    throw new Error('community_native_child_port_invalid')
  }
  return Number(value)
}

function atomicJsonWrite(targetPath: string, value: unknown): void {
  const parent = path.dirname(targetPath)
  if (!existsSync(parent)) throw new Error('community_native_child_identity_parent_missing')
  const tempPath = path.join(parent, `.${path.basename(targetPath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`)
  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    renameSync(tempPath, targetPath)
  } finally {
    rmSync(tempPath, { force: true })
  }
}

export function buildCommunityNativeChildIdentity(
  env: NodeJS.ProcessEnv = process.env,
  pid = process.pid,
  hostPid = pid,
): CommunityNativeChildIdentity {
  const launchId = requiredEnv(env, 'AOPS_NATIVE_LAUNCH_ID')
  const startedAt = requiredEnv(env, 'AOPS_NATIVE_STARTED_AT')
  const sourceFingerprint = requiredEnv(env, 'AOPS_NATIVE_SOURCE_FINGERPRINT')
  const hostEntry = path.resolve(requiredEnv(env, 'AOPS_NATIVE_HOST_ENTRY'))
  const controlPathInput = requiredEnv(env, 'AOPS_NATIVE_CONTROL_PATH')
  if (!path.isAbsolute(controlPathInput)) throw new Error('community_native_child_control_path_invalid')
  const controlPath = path.resolve(controlPathInput)
  if (!UUID.test(launchId)) throw new Error('community_native_child_launch_id_invalid')
  if (!Number.isSafeInteger(pid) || pid < 1 || !Number.isSafeInteger(hostPid) || hostPid < 1) {
    throw new Error('community_native_child_pid_invalid')
  }
  if (Number.isNaN(Date.parse(startedAt))) throw new Error('community_native_child_started_at_invalid')
  if (!SHA256.test(sourceFingerprint)) throw new Error('community_native_child_source_fingerprint_invalid')
  if (!path.isAbsolute(hostEntry)) throw new Error('community_native_child_host_entry_invalid')
  return {
    schemaVersion: 1,
    protocol: COMMUNITY_NATIVE_CHILD_PROTOCOL,
    launchId,
    pid,
    hostPid,
    startedAt,
    sourceFingerprint,
    hostEntry,
    controlPath,
    port: parsePort(requiredEnv(env, 'AOPS_NATIVE_PORT')),
  }
}

function removeIdentityIfOwned(identityPath: string, launchId: string): void {
  try {
    const parsed = JSON.parse(readFileSync(identityPath, 'utf8')) as Partial<CommunityNativeChildIdentity>
    if (parsed.protocol === COMMUNITY_NATIVE_CHILD_PROTOCOL && parsed.launchId === launchId) {
      rmSync(identityPath, { force: true })
    }
  } catch {
    // A missing, incomplete, or replaced identity is not owned by this child.
  }
}

function readOwnedStopRequest(controlPath: string, launchId: string): CommunityNativeControlRequest | null {
  try {
    const parsed = JSON.parse(readFileSync(controlPath, 'utf8')) as Partial<CommunityNativeControlRequest>
    if (
      parsed.schemaVersion !== 1 || parsed.protocol !== COMMUNITY_NATIVE_CONTROL_PROTOCOL ||
      parsed.launchId !== launchId || parsed.command !== 'stop' ||
      Number.isNaN(Date.parse(String(parsed.requestedAt))) ||
      Object.keys(parsed).sort().join(',') !== 'command,launchId,protocol,requestedAt,schemaVersion'
    ) return null
    return parsed as CommunityNativeControlRequest
  } catch {
    return null
  }
}

function removeControlIfOwned(controlPath: string, launchId: string): void {
  if (readOwnedStopRequest(controlPath, launchId)) rmSync(controlPath, { force: true })
}

type CommunityNativeHostExit = { exitCode: number | null; signal: NodeJS.Signals | null }

function spawnCommunityNativeHost(hostEntry: string, env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(process.execPath, [hostEntry], {
    cwd: process.cwd(),
    env,
    detached: false,
    windowsHide: true,
    stdio: 'inherit',
  })
}

async function waitForHostSpawn(host: ChildProcess): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onSpawn = () => {
      host.off('error', onError)
      resolve()
    }
    const onError = (error: Error) => {
      host.off('spawn', onSpawn)
      reject(error)
    }
    host.once('spawn', onSpawn)
    host.once('error', onError)
  })
}

function observeHostOutcome(host: ChildProcess): Promise<
  { kind: 'exit'; value: CommunityNativeHostExit } | { kind: 'error'; error: Error }
> {
  if (host.exitCode !== null || host.signalCode !== null) {
    return Promise.resolve({
      kind: 'exit',
      value: { exitCode: host.exitCode, signal: host.signalCode },
    })
  }
  return new Promise((resolve) => {
    const onExit = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      host.off('error', onError)
      resolve({ kind: 'exit', value: { exitCode, signal } })
    }
    const onError = (error: Error) => {
      host.off('exit', onExit)
      resolve({ kind: 'error', error })
    }
    host.once('exit', onExit)
    host.once('error', onError)
  })
}

async function terminateAndReapHost(host: ChildProcess): Promise<void> {
  if (host.exitCode !== null || host.signalCode !== null) return
  const exited = new Promise<void>((resolve) => {
    host.once('exit', () => resolve())
  })
  host.kill('SIGKILL')
  await exited
}

export async function runCommunityNativeChild(
  env: NodeJS.ProcessEnv = process.env,
  runtime: CommunityNativeChildRuntime = {},
): Promise<void> {
  const identityPathInput = requiredEnv(env, 'AOPS_NATIVE_IDENTITY_PATH')
  if (!path.isAbsolute(identityPathInput)) throw new Error('community_native_child_identity_path_invalid')
  const identityPath = path.resolve(identityPathInput)
  const controlPathInput = requiredEnv(env, 'AOPS_NATIVE_CONTROL_PATH')
  if (!path.isAbsolute(controlPathInput)) throw new Error('community_native_child_control_path_invalid')
  const controlPath = path.resolve(controlPathInput)
  const hostEntry = path.resolve(requiredEnv(env, 'AOPS_NATIVE_HOST_ENTRY'))
  if (!existsSync(hostEntry)) throw new Error('community_native_child_host_entry_missing')
  mkdirSync(path.dirname(identityPath), { recursive: true, mode: 0o700 })

  const host = (runtime.spawnHost ?? spawnCommunityNativeHost)(hostEntry, env)
  await waitForHostSpawn(host)
  const hostOutcome = observeHostOutcome(host)
  let cleanup: (() => void) | undefined
  let controlTimer: NodeJS.Timeout | undefined
  let forceStopTimer: NodeJS.Timeout | undefined
  let stopping = false
  const forward = (signal: NodeJS.Signals) => {
    if (stopping) return
    stopping = true
    try { host.kill(signal) } catch { /* host already exited */ }
    forceStopTimer = setTimeout(() => {
      if (host.exitCode === null && host.signalCode === null) {
        try { host.kill('SIGKILL') } catch { /* host already exited */ }
      }
    }, HOST_STOP_GRACE_MS)
    forceStopTimer.unref()
  }
  const onSigint = () => forward('SIGINT')
  const onSigterm = () => forward('SIGTERM')
  try {
    if (!host.pid) throw new Error('community_native_child_host_pid_missing')
    const identity = buildCommunityNativeChildIdentity(env, process.pid, host.pid)
    atomicJsonWrite(identityPath, identity)
    cleanup = () => {
      removeIdentityIfOwned(identityPath, identity.launchId)
      removeControlIfOwned(controlPath, identity.launchId)
    }
    process.once('exit', cleanup)
    process.once('SIGINT', onSigint)
    process.once('SIGTERM', onSigterm)
    controlTimer = setInterval(() => {
      if (readOwnedStopRequest(controlPath, identity.launchId)) {
        removeControlIfOwned(controlPath, identity.launchId)
        forward('SIGTERM')
      }
    }, 100)
    const outcome = await hostOutcome
    if (outcome.kind === 'error') throw outcome.error
    if (!stopping && outcome.value.exitCode !== 0) {
      throw new Error(
        `community_native_child_host_failed:${outcome.value.exitCode ?? outcome.value.signal ?? 'unknown'}`,
      )
    }
  } catch (error) {
    await terminateAndReapHost(host)
    throw error
  } finally {
    process.off('SIGINT', onSigint)
    process.off('SIGTERM', onSigterm)
    if (cleanup) process.off('exit', cleanup)
    if (controlTimer) clearInterval(controlTimer)
    if (forceStopTimer) clearTimeout(forceStopTimer)
    cleanup?.()
  }
}

export function isCommunityNativeChildEntry(
  moduleUrl = import.meta.url,
  argvPath: string | undefined = process.argv[1],
): boolean {
  return typeof argvPath === 'string' &&
    /^community-native-child\.[cm]?[jt]s$/i.test(path.basename(argvPath)) &&
    moduleUrl === pathToFileURL(argvPath).href
}

if (isCommunityNativeChildEntry()) {
  runCommunityNativeChild().catch((error) => {
    process.stderr.write(`[aops-community] native child failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
