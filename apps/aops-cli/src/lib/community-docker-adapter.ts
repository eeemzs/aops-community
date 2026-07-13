import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  writeSync,
  type BigIntStats,
} from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

import {
  buildCommunityComposeBaseInvocation,
  buildCommunityComposeInvocation,
  assertCommunityPostgresVolumeName,
  readCommunityRuntimePort,
  type CommunityComposeInvocation,
  type CommunityInstallPaths,
  type CommunityInstallState,
  type CommunityInstalledRelease,
  type CommunityLifecycleAdapter,
  type CommunityPostgresVolumeClaim,
} from './community-lifecycle.js'

export type CommunityProcessInvocation = Omit<CommunityComposeInvocation, 'command'> & {
  command: string
  inputPath?: string
  inputFd?: number
  outputPath?: string
  outputFd?: number
  signal?: AbortSignal
}

export type CommunityProcessResult = {
  exitCode: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

export type CommunityProcessRuntime = {
  run: (invocation: CommunityProcessInvocation) => Promise<CommunityProcessResult>
}

export class CommunityProcessAbortedError extends Error {
  readonly code = 'COMMUNITY_OPERATION_ABORTED'

  constructor() {
    super('community_operation_aborted')
    this.name = 'CommunityProcessAbortedError'
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new CommunityProcessAbortedError()
}

function appendBounded(current: string, chunk: Buffer, maxBytes = 1_048_576): string {
  const next = current + chunk.toString('utf8')
  return next.length > maxBytes ? next.slice(-maxBytes) : next
}

export const communityProcessRuntime: CommunityProcessRuntime = {
  run(invocation) {
    return new Promise((resolve, reject) => {
      let preparedInputFd: number | undefined
      let preparedOutputFd: number | undefined
      let ownsInputFd = false
      let ownsOutputFd = false
      try {
        if (invocation.inputPath && invocation.inputFd !== undefined) throw new Error('community_process_multiple_inputs_refused')
        if (invocation.outputPath && invocation.outputFd !== undefined) throw new Error('community_process_multiple_outputs_refused')
        throwIfAborted(invocation.signal)
        if (invocation.inputFd !== undefined) {
          if (!Number.isInteger(invocation.inputFd) || invocation.inputFd < 0) throw new Error('community_process_input_fd_invalid')
          const stat = fstatSync(invocation.inputFd, { bigint: true })
          if (!stat.isFile() || stat.nlink !== 1n) throw new Error('community_process_input_fd_unsafe')
          preparedInputFd = invocation.inputFd
        } else if (invocation.inputPath) {
          const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
          preparedInputFd = openSync(invocation.inputPath, constants.O_RDONLY | noFollow)
          ownsInputFd = true
          const stat = fstatSync(preparedInputFd, { bigint: true })
          if (!stat.isFile() || stat.nlink !== 1n) throw new Error('community_process_input_path_unsafe')
        }
        if (invocation.outputFd !== undefined) {
          if (!Number.isInteger(invocation.outputFd) || invocation.outputFd < 0) throw new Error('community_process_output_fd_invalid')
          const stat = fstatSync(invocation.outputFd, { bigint: true })
          if (!stat.isFile() || stat.nlink !== 1n || stat.size !== 0n) throw new Error('community_process_output_fd_unsafe')
          preparedOutputFd = invocation.outputFd
        } else if (invocation.outputPath) {
          if (existsSync(invocation.outputPath)) throw new Error('community_process_output_already_exists')
          mkdirSync(path.dirname(invocation.outputPath), { recursive: true })
          const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
          preparedOutputFd = openSync(
            invocation.outputPath,
            constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow,
            0o600,
          )
          ownsOutputFd = true
        }
      } catch (error) {
        if (ownsInputFd && preparedInputFd !== undefined) closeSync(preparedInputFd)
        if (ownsOutputFd && preparedOutputFd !== undefined) closeSync(preparedOutputFd)
        reject(error)
        return
      }
      let child: ReturnType<typeof spawn>
      try {
        child = spawn(invocation.command, invocation.args, {
          env: { ...process.env, ...invocation.env },
          shell: false,
          windowsHide: true,
          // Keep stdout as a pipe even for file output. The parent writes with
          // an explicit position so the held descriptor's read offset remains
          // zero for the subsequent verifier process.
          stdio: [preparedInputFd ?? 'pipe', 'pipe', 'pipe'],
        })
      } catch (error) {
        if (ownsInputFd && preparedInputFd !== undefined) closeSync(preparedInputFd)
        if (ownsOutputFd && preparedOutputFd !== undefined) closeSync(preparedOutputFd)
        reject(error)
        return
      }
      // spawn has already duplicated explicit descriptors into the child.
      if (ownsInputFd && preparedInputFd !== undefined) {
        closeSync(preparedInputFd)
        ownsInputFd = false
      }
      let stdout = ''
      let stderr = ''
      let outputOffset = 0
      let settled = false
      let childClosed = false
      let terminalError: unknown
      let hardKillTimer: ReturnType<typeof setTimeout> | undefined
      let finalKillTimer: ReturnType<typeof setTimeout> | undefined
      let exitCode: number | null = null
      let exitSignal: NodeJS.Signals | null = null

      const cleanup = () => {
        invocation.signal?.removeEventListener('abort', onAbort)
        if (hardKillTimer) clearTimeout(hardKillTimer)
        if (finalKillTimer) clearTimeout(finalKillTimer)
        if (ownsOutputFd && preparedOutputFd !== undefined) {
          closeSync(preparedOutputFd)
          ownsOutputFd = false
        }
      }
      const finish = () => {
        if (settled || !childClosed) return
        settled = true
        cleanup()
        if (terminalError) reject(terminalError)
        else resolve({ exitCode, signal: exitSignal, stdout, stderr })
      }
      const safeKill = (signal: NodeJS.Signals) => {
        try {
          return child.kill(signal)
        } catch {
          return false
        }
      }
      const terminate = (error: unknown) => {
        if (settled) return
        terminalError ??= error
        child.stdin?.destroy()
        child.stdout?.destroy()
        child.stderr?.destroy()
        if (!childClosed) {
          safeKill('SIGTERM')
          hardKillTimer ??= setTimeout(() => {
            if (!childClosed) safeKill('SIGKILL')
          }, 500)
          hardKillTimer.unref()
          finalKillTimer ??= setTimeout(() => {
            if (!childClosed && !settled) {
              safeKill('SIGKILL')
              settled = true
              cleanup()
              reject(new Error('community_process_termination_unconfirmed:child_may_still_run=true'))
            }
          }, 3_000)
          finalKillTimer.unref()
        }
        finish()
      }
      const onAbort = () => terminate(new CommunityProcessAbortedError())

      child.once('error', (error) => {
        terminalError ??= error
        if (!child.pid) {
          childClosed = true
          finish()
        }
      })
      child.stderr?.on('data', (chunk: Buffer) => { stderr = appendBounded(stderr, chunk) })
      child.stdout?.on('data', (chunk: Buffer) => {
        if (settled) return
        if (preparedOutputFd === undefined) {
          stdout = appendBounded(stdout, chunk)
          return
        }
        try {
          let written = 0
          while (written < chunk.byteLength) {
            const count = writeSync(
              preparedOutputFd,
              chunk,
              written,
              chunk.byteLength - written,
              outputOffset + written,
            )
            if (count <= 0) throw new Error('community_process_output_short_write')
            written += count
          }
          outputOffset += written
        } catch (error) {
          terminate(error)
        }
      })
      if (preparedInputFd === undefined) {
        child.stdin?.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code !== 'EPIPE') terminate(error)
        })
        child.stdin?.end()
      }
      child.once('close', (code, signal) => {
        childClosed = true
        exitCode = code
        exitSignal = signal
        finish()
      })
      invocation.signal?.addEventListener('abort', onAbort, { once: true })
      if (invocation.signal?.aborted) onAbort()
    })
  },
}

function composePrefix(params: {
  paths: CommunityInstallPaths
  state: CommunityInstallState
  release?: CommunityInstalledRelease
  postgresVolumeName?: string
}): CommunityComposeInvocation {
  return buildCommunityComposeBaseInvocation(params)
}

async function runChecked(runtime: CommunityProcessRuntime, invocation: CommunityProcessInvocation): Promise<CommunityProcessResult> {
  let result: CommunityProcessResult
  try {
    throwIfAborted(invocation.signal)
    result = await runtime.run(invocation)
    throwIfAborted(invocation.signal)
  } catch (error) {
    if (error instanceof CommunityProcessAbortedError || invocation.signal?.aborted) {
      throw new CommunityProcessAbortedError()
    }
    throw new Error(`community_process_execution_failed:${redactDiagnostic(error instanceof Error ? error.message : String(error))}`)
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `community_process_failed:${redactDiagnostic(invocation.args.at(-1) ?? 'unknown')}:${result.exitCode}:${redactDiagnostic(result.stderr)}`,
    )
  }
  return result
}

function redactDiagnostic(value: string): string {
  return value
    .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(/((?:password|passwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/(--(?:password|passwd|secret|token|api[_-]?key)\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/-]+/gi, '$1[REDACTED]')
    .replace(/("(?:password|passwd|secret|token|apiKey|authorization)"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2')
    .trim()
    .slice(-1000)
}

const VOLUME_LABELS = {
  managed: 'com.aops.community.managed',
  installId: 'com.aops.community.install-id',
  operationId: 'com.aops.community.operation-id',
  claimTokenSha256: 'com.aops.community.claim-token-sha256',
} as const

function expectedVolumeLabels(claim: CommunityPostgresVolumeClaim): Record<string, string> {
  return {
    [VOLUME_LABELS.managed]: 'true',
    [VOLUME_LABELS.installId]: claim.installId,
    [VOLUME_LABELS.operationId]: claim.operationId,
    [VOLUME_LABELS.claimTokenSha256]: claim.claimTokenSha256,
  }
}

function assertClaim(state: CommunityInstallState, claim: CommunityPostgresVolumeClaim): void {
  if (claim.schemaVersion !== 1 || claim.installId !== state.installId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(claim.operationId) ||
      !/^sha256:[a-f0-9]{64}$/.test(claim.claimTokenSha256)) {
    throw new Error('community_postgres_volume_claim_invalid')
  }
  assertCommunityPostgresVolumeName(state, claim.name)
}

async function inspectClaimedVolume(
  runtime: CommunityProcessRuntime,
  state: CommunityInstallState,
  claim: CommunityPostgresVolumeClaim,
  signal?: AbortSignal,
): Promise<void> {
  assertClaim(state, claim)
  const result = await runChecked(runtime, {
    command: 'docker',
    args: ['volume', 'inspect', '--format', '{{json .}}', claim.name],
    env: {},
    signal,
  })
  let inspected: { Name?: unknown; Driver?: unknown; Labels?: unknown }
  try {
    inspected = JSON.parse(result.stdout.trim()) as typeof inspected
  } catch (error) {
    throw new Error('community_postgres_volume_inspect_invalid', { cause: error })
  }
  const labels = inspected.Labels
  const expected = expectedVolumeLabels(claim)
  if (inspected.Name !== claim.name || inspected.Driver !== 'local' ||
      !labels || typeof labels !== 'object' || Array.isArray(labels) ||
      JSON.stringify(Object.keys(labels as Record<string, unknown>).sort()) !== JSON.stringify(Object.keys(expected).sort()) ||
      Object.entries(expected).some(([key, value]) => (labels as Record<string, unknown>)[key] !== value)) {
    throw new Error('community_postgres_volume_ownership_mismatch')
  }
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function assertHeldBackupIdentity(
  backupPath: string,
  backupRoot: string,
  fd: number,
  original: BigIntStats,
  rootOriginal: BigIntStats,
): BigIntStats {
  const root = path.resolve(backupRoot)
  const rootStat = lstatSync(root, { bigint: true })
  const visible = lstatSync(backupPath, { bigint: true })
  const held = fstatSync(fd, { bigint: true })
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory() || !sameIdentity(rootStat, rootOriginal) ||
      realpathSync.native(root) !== root ||
      path.dirname(path.resolve(backupPath)) !== root || visible.isSymbolicLink() || !visible.isFile() || visible.nlink !== 1n ||
      !held.isFile() || held.nlink !== 1n || !sameIdentity(held, original) || !sameIdentity(visible, original) ||
      realpathSync.native(backupPath) !== path.resolve(backupPath)) {
    throw new Error('community_backup_output_identity_changed')
  }
  return held
}

function assertHeldBackupStable(fd: number, expected: BigIntStats): BigIntStats {
  const held = fstatSync(fd, { bigint: true })
  if (!held.isFile() || held.nlink !== 1n || !sameIdentity(held, expected) || held.size !== expected.size ||
      held.mtimeNs !== expected.mtimeNs || held.ctimeNs !== expected.ctimeNs) {
    throw new Error('community_backup_output_changed_during_verification')
  }
  return held
}

async function hashFileDescriptor(fd: number, expected: BigIntStats, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  const expectedSize = Number(expected.size)
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1) throw new Error('community_backup_file_invalid')
  const buffer = Buffer.alloc(64 * 1024)
  let offset = 0
  while (offset < expectedSize) {
    throwIfAborted(signal)
    const count = readSync(fd, buffer, 0, Math.min(buffer.byteLength, expectedSize - offset), offset)
    if (count <= 0) throw new Error('community_backup_output_short_read')
    hash.update(buffer.subarray(0, count))
    offset += count
  }
  throwIfAborted(signal)
  const final = fstatSync(fd, { bigint: true })
  if (!sameIdentity(final, expected) || final.size !== expected.size ||
      final.mtimeNs !== expected.mtimeNs || final.ctimeNs !== expected.ctimeNs) {
    throw new Error('community_backup_output_changed_during_hash')
  }
  return `sha256:${hash.digest('hex')}`
}

export function createCommunityDockerAdapter(options: {
  verifyRelease: (release: CommunityInstalledRelease) => Promise<void>
  runtime?: CommunityProcessRuntime
  fetchImpl?: typeof fetch
  healthUrl?: string
  now?: () => Date
  createId?: () => string
  signal?: AbortSignal
  /** Narrow post-dump race seam. Normal callers must not provide it. */
  afterBackupDump?: (backupPath: string) => void
  /** Narrow in-place mutation seam after the verification baseline. Normal callers must not provide it. */
  afterBackupVerificationBaseline?: (backupPath: string, outputFd: number) => void
}): CommunityLifecycleAdapter {
  const runtime = options.runtime ?? communityProcessRuntime
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? (() => new Date())
  const createId = options.createId ?? randomUUID
  const signal = options.signal
  return {
    verifyRelease: options.verifyRelease,
    async createBackup({ paths, state }) {
      const backupPath = path.join(
        paths.backupRoot,
        `${now().toISOString().replace(/[:.]/g, '-')}-${createId()}.dump`,
      )
      const prefix = composePrefix({ paths, state })
      const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
      const canonicalBackupRoot = realpathSync.native(paths.backupRoot)
      const rootOriginal = lstatSync(paths.backupRoot, { bigint: true })
      if (rootOriginal.isSymbolicLink() || !rootOriginal.isDirectory() || canonicalBackupRoot !== path.resolve(paths.backupRoot)) {
        throw new Error('community_backup_root_unsafe')
      }
      const outputFd = openSync(backupPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | noFollow, 0o600)
      try {
        const original = fstatSync(outputFd, { bigint: true })
        const rootAfterOpen = lstatSync(paths.backupRoot, { bigint: true })
        if (!sameIdentity(rootAfterOpen, rootOriginal) || realpathSync.native(paths.backupRoot) !== canonicalBackupRoot) {
          throw new Error('community_backup_root_identity_changed')
        }
        await runChecked(runtime, {
          ...prefix,
          args: [...prefix.args, 'exec', '-T', 'postgres', 'pg_dump',
            '-U', 'aops', '-d', 'aops', '--format=custom', '--no-owner', '--no-privileges'],
          outputFd,
          signal,
        })
        fsyncSync(outputFd)
        const dumped = assertHeldBackupIdentity(backupPath, paths.backupRoot, outputFd, original, rootOriginal)
        if (dumped.size <= 0n) throw new Error('community_backup_file_invalid')
        options.afterBackupDump?.(backupPath)
        const verificationBaseline = assertHeldBackupStable(outputFd, dumped)
        options.afterBackupVerificationBaseline?.(backupPath, outputFd)
        assertHeldBackupStable(outputFd, verificationBaseline)
        await runChecked(runtime, {
          ...prefix,
          args: [...prefix.args, 'exec', '-T', 'postgres', 'pg_restore', '--list'],
          inputFd: outputFd,
          signal,
        })
        const verified = assertHeldBackupStable(outputFd, verificationBaseline)
        const sha256 = await hashFileDescriptor(outputFd, verified, signal)
        const final = assertHeldBackupIdentity(backupPath, paths.backupRoot, outputFd, original, rootOriginal)
        if (final.size !== verified.size || final.mtimeNs !== verified.mtimeNs || final.ctimeNs !== verified.ctimeNs) {
          throw new Error('community_backup_output_changed_after_verification')
        }
        return {
          path: backupPath,
          sha256,
          byteLength: Number(final.size),
          verified: true,
          createdAt: now().toISOString(),
          sourceRelease: state.activeRelease,
        }
      } finally {
        closeSync(outputFd)
      }
    },
    async stop({ paths, state }) {
      await runChecked(runtime, { ...buildCommunityComposeInvocation({ paths, state, action: 'down' }), signal })
    },
    async pull({ paths, state, release }) {
      await runChecked(runtime, { ...buildCommunityComposeInvocation({ paths, state, release, action: 'pull' }), signal })
    },
    async start({ paths, state, release, postgresVolumeName }) {
      await runChecked(runtime, { ...buildCommunityComposeInvocation({
        paths,
        state,
        release,
        postgresVolumeName,
        action: 'up',
      }), signal })
    },
    async health({ paths }) {
      const port = readCommunityRuntimePort(paths)
      throwIfAborted(signal)
      const timeoutSignal = AbortSignal.timeout(10_000)
      const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
      let response: Response
      try {
        response = await fetchImpl(options.healthUrl ?? `http://127.0.0.1:${port}/api/health`, {
          signal: combinedSignal,
        })
      } catch (error) {
        if (signal?.aborted) throw new CommunityProcessAbortedError()
        throw error
      }
      try {
        await response.body?.cancel()
      } catch {
        // The response body is diagnostic-only. A failed cancellation must not
        // replace the exact health status or command-abort classification.
      }
      throwIfAborted(signal)
      if (!response.ok) throw new Error(`community_health_failed:${response.status}`)
    },
    async dataSmoke({ paths, state }) {
      const prefix = composePrefix({ paths, state })
      const result = await runChecked(runtime, {
        ...prefix,
        args: [...prefix.args, 'exec', '-T', 'postgres', 'psql', '-U', 'aops', '-d', 'aops',
          '--tuples-only', '--no-align', '--command', 'SELECT 1'],
        signal,
      })
      if (result.stdout.trim() !== '1') throw new Error('community_data_smoke_failed')
    },
    async claimFreshPostgresVolume({ state, claim }) {
      assertClaim(state, claim)
      const listed = await runChecked(runtime, {
        command: 'docker',
        args: ['volume', 'ls', '--quiet'],
        env: {},
        signal,
      })
      const exactNames = listed.stdout.split(/\r?\n/).map((name) => name.trim()).filter(Boolean)
      if (exactNames.includes(claim.name)) {
        throw new Error('community_postgres_volume_already_exists')
      }
      const labels = expectedVolumeLabels(claim)
      await runChecked(runtime, {
        command: 'docker',
        args: [
          'volume', 'create', '--driver', 'local',
          ...Object.entries(labels).flatMap(([key, value]) => ['--label', `${key}=${value}`]),
          claim.name,
        ],
        env: {},
        signal,
      })
      await inspectClaimedVolume(runtime, state, claim, signal)
    },
    async restoreBackup({ paths, state, backup, snapshot, volumeClaim }) {
      assertClaim(state, volumeClaim)
      if (snapshot.sourcePath !== backup.path || snapshot.sha256 !== backup.sha256 ||
          snapshot.byteLength !== backup.byteLength || !Number.isInteger(snapshot.fd) || snapshot.fd < 0) {
        throw new Error('community_backup_snapshot_invalid')
      }
      await inspectClaimedVolume(runtime, state, volumeClaim, signal)
      const prefix = composePrefix({ paths, state, postgresVolumeName: volumeClaim.name })
      await runChecked(runtime, {
        ...prefix,
        args: [...prefix.args, 'up', '--no-build', '--detach', '--wait', 'postgres'],
        signal,
      })
      await inspectClaimedVolume(runtime, state, volumeClaim, signal)
      await runChecked(runtime, {
        ...prefix,
        args: [...prefix.args, 'exec', '-T', 'postgres', 'pg_restore',
          '-U', 'aops', '-d', 'aops', '--no-owner', '--no-privileges', '--exit-on-error'],
        inputFd: snapshot.fd,
        signal,
      })
    },
  }
}
