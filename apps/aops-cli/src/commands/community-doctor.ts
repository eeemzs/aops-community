import { spawnSync } from 'node:child_process'
import { existsSync, statfsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { Command } from 'commander'

import {
  buildCommunityComposeInvocation,
  inspectCommunityInstall,
  readCommunityRuntimePort,
} from '../lib/community-lifecycle.js'
import { communityProcessRuntime } from '../lib/community-docker-adapter.js'

export type CommunityDoctorCheck = {
  id: string
  status: 'pass' | 'fail' | 'warn' | 'skip'
  detail: string
}

export type CommunityDoctorOptions = {
  instance?: string
  dataRoot?: string
  json?: boolean
}

export type CommunityDoctorDependencies = {
  spawn?: typeof spawnSync
  fetchImpl?: typeof fetch
  platform?: NodeJS.Platform
  arch?: string
  statfs?: (candidate: string) => { bavail: bigint; bsize: bigint }
  portProbe?: (port: number) => Promise<boolean>
}

function existingAncestor(candidate: string): string {
  let cursor = path.resolve(candidate)
  while (!existsSync(cursor)) {
    const parent = path.dirname(cursor)
    if (parent === cursor) return cursor
    cursor = parent
  }
  return cursor
}

function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(() => resolve(true)))
  })
}

async function anonymousRegistryCheck(imageDigest: string | undefined, fetchImpl: typeof fetch): Promise<CommunityDoctorCheck> {
  try {
    const tokenResponse = await fetchImpl(
      'https://ghcr.io/token?service=ghcr.io&scope=repository:aopslab/aops-community:pull',
      { signal: AbortSignal.timeout(8_000) },
    )
    if (!tokenResponse.ok) return { id: 'anonymous-registry', status: 'fail', detail: `token HTTP ${tokenResponse.status}` }
    const token = String((await tokenResponse.json() as { token?: unknown }).token ?? '')
    if (!token) return { id: 'anonymous-registry', status: 'fail', detail: 'anonymous token missing' }
    if (!imageDigest) return { id: 'anonymous-registry', status: 'warn', detail: 'anonymous token works; exact release digest unavailable before setup' }
    const manifestResponse = await fetchImpl(`https://ghcr.io/v2/aopslab/aops-community/manifests/${imageDigest}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json',
      },
      signal: AbortSignal.timeout(8_000),
    })
    const observed = manifestResponse.headers.get('docker-content-digest')
    return {
      id: 'anonymous-registry',
      status: manifestResponse.ok && observed === imageDigest ? 'pass' : 'fail',
      detail: `manifest HTTP ${manifestResponse.status}; digest=${observed ?? 'missing'}`,
    }
  } catch (error) {
    return { id: 'anonymous-registry', status: 'fail', detail: error instanceof Error ? error.message : String(error) }
  }
}

export async function inspectCommunityDoctor(
  options: CommunityDoctorOptions = {},
  dependencies: CommunityDoctorDependencies = {},
): Promise<{
  status: 'healthy' | 'attention-required'
  mutationFree: true
  checks: CommunityDoctorCheck[]
}> {
  const spawn = dependencies.spawn ?? spawnSync
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const platform = dependencies.platform ?? process.platform
  const arch = dependencies.arch ?? process.arch
  const checks: CommunityDoctorCheck[] = []
  const osArchSupported = ['win32', 'darwin', 'linux'].includes(platform) && ['x64', 'arm64'].includes(arch)
  checks.push({
    id: 'os-arch',
    status: osArchSupported ? 'pass' : 'fail',
    detail: `${platform}/${arch}`,
  })
  const docker = spawn('docker', ['--version'], { encoding: 'utf8', windowsHide: true })
  checks.push({
    id: 'docker-cli',
    status: docker.status === 0 ? 'pass' : 'fail',
    detail: docker.status === 0 ? String(docker.stdout).trim() : String(docker.stderr || docker.error?.message || 'docker unavailable').trim(),
  })
  checks.push({
    id: 'sigstore-verifier',
    status: 'pass',
    detail: 'bundled sigstore-js verifier; no external cosign installation required',
  })
  if (platform === 'win32') {
    const wsl = spawn('wsl.exe', ['--status'], { encoding: 'utf8', windowsHide: true })
    checks.push({
      id: 'wsl2',
      status: wsl.status === 0 ? 'pass' : 'fail',
      detail: wsl.status === 0 ? String(wsl.stdout).replace(/\0/g, '').trim().slice(-1000) : String(wsl.stderr || wsl.error?.message || 'WSL2 unavailable').replace(/\0/g, '').trim(),
    })
  } else {
    checks.push({ id: 'wsl2', status: 'skip', detail: 'WSL2 check applies only to Windows.' })
  }
  const compose = spawn('docker', ['compose', 'version'], { encoding: 'utf8', windowsHide: true })
  checks.push({
    id: 'docker-compose',
    status: compose.status === 0 ? 'pass' : 'fail',
    detail: compose.status === 0 ? String(compose.stdout).trim() : String(compose.stderr || compose.error?.message || 'docker compose unavailable').trim(),
  })

  const inspection = inspectCommunityInstall({ instanceName: options.instance, dataRoot: options.dataRoot })
  const filesystem = dependencies.statfs?.(existingAncestor(inspection.paths.dataRoot))
    ?? statfsSync(existingAncestor(inspection.paths.dataRoot), { bigint: true })
  const freeBytes = filesystem.bavail * filesystem.bsize
  const minimumBytes = 2n * 1024n * 1024n * 1024n
  checks.push({
    id: 'disk-space',
    status: freeBytes >= minimumBytes ? 'pass' : 'fail',
    detail: `${(Number(freeBytes) / (1024 ** 3)).toFixed(1)} GiB free; 2.0 GiB minimum`,
  })
  checks.push({
    id: 'install-state',
    status: inspection.status === 'installed' ? 'pass' : inspection.status === 'not-installed' ? 'warn' : 'fail',
    detail: inspection.status === 'partial'
      ? `${inspection.error ?? 'partial install'}; missing=${inspection.missingFiles.join(',') || 'none'}`
      : `${inspection.status}; root=${inspection.paths.instanceRoot}`,
  })

  if (inspection.status === 'installed') {
    const state = inspection.state!
    checks.push({ id: 'release-cache', status: 'pass', detail: `${state.activeRelease.releaseVersion} ${state.activeRelease.imageRef}` })
    const status = await communityProcessRuntime.run(buildCommunityComposeInvocation({
      paths: inspection.paths,
      state,
      action: 'status',
    }))
    checks.push({
      id: 'container-status',
      status: status.exitCode === 0 ? 'pass' : 'fail',
      detail: (status.stdout || status.stderr || `exit=${status.exitCode}`).trim().slice(-2000),
    })
    const port = readCommunityRuntimePort(inspection.paths)
    checks.push({ id: 'port', status: 'pass', detail: `configured=${port}; installed service is expected to own it` })
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5_000) })
      checks.push({ id: 'server-health', status: response.ok ? 'pass' : 'fail', detail: `HTTP ${response.status} on port ${port}` })
    } catch (error) {
      checks.push({ id: 'server-health', status: 'fail', detail: error instanceof Error ? error.message : String(error) })
    }
  } else {
    const port = 5900
    const available = await (dependencies.portProbe ?? probePort)(port)
    checks.push({ id: 'port', status: available ? 'pass' : 'fail', detail: available ? `${port} is available` : `${port} is already in use` })
    checks.push({ id: 'container-status', status: 'skip', detail: 'No complete installation to inspect.' })
    checks.push({ id: 'server-health', status: 'skip', detail: 'No complete installation to inspect.' })
  }
  checks.push(await anonymousRegistryCheck(
    inspection.status === 'installed' ? inspection.state!.activeRelease.imageIndexDigest : undefined,
    fetchImpl,
  ))
  return {
    status: checks.some((check) => check.status === 'fail') ? 'attention-required' : 'healthy',
    mutationFree: true,
    checks,
  }
}

export async function runCommunityDoctor(options: CommunityDoctorOptions = {}): Promise<void> {
  const result = await inspectCommunityDoctor(options)
  if (options.json) console.log(JSON.stringify(result, null, 2))
  else {
    for (const check of result.checks) console.log(`${check.status.toUpperCase().padEnd(4)} ${check.id}: ${check.detail}`)
    console.log(`Result: ${result.status}`)
  }
  if (result.status !== 'healthy') process.exitCode = 1
}

export function makeCommunityDoctorCommand(): Command {
  return new Command('doctor')
    .description('Run mutation-free AOPS Community installation and runtime checks')
    .option('--instance <name>', 'Installation instance name', 'default')
    .option('--data-root <path>', 'Absolute Community data root override')
    .option('--json', 'Output JSON')
    .action(runCommunityDoctor)
}
