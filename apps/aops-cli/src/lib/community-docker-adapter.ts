import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

import {
  buildCommunityComposeBaseInvocation,
  buildCommunityComposeInvocation,
  readCommunityRuntimePort,
  type CommunityComposeInvocation,
  type CommunityInstallPaths,
  type CommunityInstallState,
  type CommunityInstalledRelease,
  type CommunityLifecycleAdapter,
} from './community-lifecycle.js'

export type CommunityProcessInvocation = CommunityComposeInvocation & {
  inputPath?: string
  outputPath?: string
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

function appendBounded(current: string, chunk: Buffer, maxBytes = 1_048_576): string {
  const next = current + chunk.toString('utf8')
  return next.length > maxBytes ? next.slice(-maxBytes) : next
}

export const communityProcessRuntime: CommunityProcessRuntime = {
  run(invocation) {
    return new Promise((resolve, reject) => {
      if (invocation.outputPath && existsSync(invocation.outputPath)) {
        reject(new Error('community_process_output_already_exists'))
        return
      }
      const child = spawn(invocation.command, invocation.args, {
        env: { ...process.env, ...invocation.env },
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      let outputStream: ReturnType<typeof createWriteStream> | undefined
      child.once('error', reject)
      child.stderr.on('data', (chunk: Buffer) => { stderr = appendBounded(stderr, chunk) })
      if (invocation.outputPath) {
        mkdirSync(path.dirname(invocation.outputPath), { recursive: true })
        outputStream = createWriteStream(invocation.outputPath, { flags: 'wx', mode: 0o600 })
        outputStream.once('error', reject)
        child.stdout.pipe(outputStream)
      } else {
        child.stdout.on('data', (chunk: Buffer) => { stdout = appendBounded(stdout, chunk) })
      }
      if (invocation.inputPath) {
        createReadStream(invocation.inputPath).pipe(child.stdin)
      } else {
        child.stdin.end()
      }
      child.once('exit', (exitCode, signal) => {
        const finish = () => resolve({ exitCode, signal, stdout, stderr })
        if (outputStream && !outputStream.closed) outputStream.once('close', finish)
        else finish()
      })
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
  const result = await runtime.run(invocation)
  if (result.exitCode !== 0) {
    if (invocation.outputPath) rmSync(invocation.outputPath, { force: true })
    throw new Error(`community_process_failed:${invocation.args.at(-1)}:${result.exitCode}:${result.stderr.trim().slice(-1000)}`)
  }
  return result
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return `sha256:${hash.digest('hex')}`
}

export function createCommunityDockerAdapter(options: {
  verifyRelease: (release: CommunityInstalledRelease) => Promise<void>
  runtime?: CommunityProcessRuntime
  fetchImpl?: typeof fetch
  healthUrl?: string
  now?: () => Date
  createId?: () => string
}): CommunityLifecycleAdapter {
  const runtime = options.runtime ?? communityProcessRuntime
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? (() => new Date())
  const createId = options.createId ?? randomUUID
  return {
    verifyRelease: options.verifyRelease,
    async createBackup({ paths, state }) {
      const backupPath = path.join(
        paths.backupRoot,
        `${now().toISOString().replace(/[:.]/g, '-')}-${createId()}.dump`,
      )
      const prefix = composePrefix({ paths, state })
      await runChecked(runtime, {
        ...prefix,
        args: [...prefix.args, 'exec', '-T', 'postgres', 'pg_dump',
          '-U', 'aops', '-d', 'aops', '--format=custom', '--no-owner', '--no-privileges'],
        outputPath: backupPath,
      })
      const stat = statSync(backupPath)
      if (!stat.isFile() || stat.size <= 0) throw new Error('community_backup_file_invalid')
      await runChecked(runtime, {
        ...prefix,
        args: [...prefix.args, 'exec', '-T', 'postgres', 'pg_restore', '--list'],
        inputPath: backupPath,
      })
      return {
        path: backupPath,
        sha256: await hashFile(backupPath),
        byteLength: stat.size,
        verified: true,
        createdAt: now().toISOString(),
        sourceRelease: state.activeRelease,
      }
    },
    async stop({ paths, state }) {
      await runChecked(runtime, buildCommunityComposeInvocation({ paths, state, action: 'down' }))
    },
    async pull({ paths, state, release }) {
      await runChecked(runtime, buildCommunityComposeInvocation({ paths, state, release, action: 'pull' }))
    },
    async start({ paths, state, release, postgresVolumeName }) {
      await runChecked(runtime, buildCommunityComposeInvocation({
        paths,
        state,
        release,
        postgresVolumeName,
        action: 'up',
      }))
    },
    async health({ paths }) {
      const port = readCommunityRuntimePort(paths)
      const response = await fetchImpl(options.healthUrl ?? `http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`community_health_failed:${response.status}`)
    },
    async dataSmoke({ paths, state }) {
      const prefix = composePrefix({ paths, state })
      const result = await runChecked(runtime, {
        ...prefix,
        args: [...prefix.args, 'exec', '-T', 'postgres', 'psql', '-U', 'aops', '-d', 'aops',
          '--tuples-only', '--no-align', '--command', 'SELECT 1'],
      })
      if (result.stdout.trim() !== '1') throw new Error('community_data_smoke_failed')
    },
    async restoreBackup({ paths, state, backup, postgresVolumeName }) {
      const prefix = composePrefix({ paths, state, postgresVolumeName })
      await runChecked(runtime, {
        ...prefix,
        args: [...prefix.args, 'up', '--no-build', '--detach', '--wait', 'postgres'],
      })
      await runChecked(runtime, {
        ...prefix,
        args: [...prefix.args, 'exec', '-T', 'postgres', 'pg_restore',
          '-U', 'aops', '-d', 'aops', '--no-owner', '--no-privileges', '--exit-on-error'],
        inputPath: backup.path,
      })
    },
  }
}
