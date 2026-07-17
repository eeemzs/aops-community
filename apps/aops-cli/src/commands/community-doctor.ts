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
import { buildCommunityInstanceContract } from '../lib/community-instance-contract.js'
import { resolveCommunityCliIdentity } from '../lib/community-client-contract.js'
import { communityProcessRuntime } from '../lib/community-docker-adapter.js'
import { resolveCommunityInstanceLayout } from '../lib/community-instance-layout.js'
import { inspectCommunityNativeInstall } from '../lib/community-native-lifecycle.js'
import { inspectCommunityNativePostgres } from '../lib/community-native-postgres.js'
import { getActiveApiTarget, getApiTarget } from '../utils/config.js'
import { inspectTargetDoctor } from './target.js'

export type CommunityDoctorCheck = {
  id: string
  status: 'pass' | 'fail' | 'warn' | 'skip'
  detail: string
}
export type CommunityDoctorOptions = {
  instance?: string
  dataRoot?: string
  runtime?: 'native' | 'oci'
  postgres?: 'external' | 'container'
  postgresConfig?: string
  postgresTls?: 'disable' | 'require' | 'verify-full'
  target?: string
  timeoutMs?: number
  json?: boolean
}

export type CommunityDoctorDependencies = {
  spawn?: typeof spawnSync
  fetchImpl?: typeof fetch
  platform?: NodeJS.Platform
  arch?: string
  statfs?: (candidate: string) => { bavail: bigint; bsize: bigint }
  portProbe?: (port: number) => Promise<boolean>
  targetDoctor?: typeof inspectTargetDoctor
}

function installSelection(options: CommunityDoctorOptions): { instanceName?: string; dataRoot?: string } {
  if (options.dataRoot) return { instanceName: options.instance, dataRoot: options.dataRoot }
  const layout = resolveCommunityInstanceLayout({ instanceId: options.instance })
  return { instanceName: layout.instanceId, dataRoot: layout.dataRoot }
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
      'https://ghcr.io/token?service=ghcr.io&scope=repository:eeemzs/aops-community:pull',
      { signal: AbortSignal.timeout(8_000) },
    )
    if (!tokenResponse.ok) return { id: 'anonymous-registry', status: 'fail', detail: `token HTTP ${tokenResponse.status}` }
    const token = String((await tokenResponse.json() as { token?: unknown }).token ?? '')
    if (!token) return { id: 'anonymous-registry', status: 'fail', detail: 'anonymous token missing' }
    if (!imageDigest) return { id: 'anonymous-registry', status: 'warn', detail: 'anonymous token works; exact release digest unavailable before setup' }
    const manifestResponse = await fetchImpl(`https://ghcr.io/v2/eeemzs/aops-community/manifests/${imageDigest}`, {
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
  profile: 'target-only' | 'unconfigured' | 'native-external-postgres' | 'native-container-postgres' | 'oci-managed-stack'
  cli: ReturnType<typeof resolveCommunityCliIdentity>
  selectedTarget: ReturnType<typeof getActiveApiTarget> | null
  checks: CommunityDoctorCheck[]
}> {
  const spawn = dependencies.spawn ?? spawnSync
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const platform = dependencies.platform ?? process.platform
  const arch = dependencies.arch ?? process.arch
  const checks: CommunityDoctorCheck[] = []
  const cli = resolveCommunityCliIdentity()
  if (options.target && options.runtime) throw new Error('community_doctor_selector_conflict:choose_--target_or_--runtime')
  if (!options.runtime && (options.postgres || options.postgresConfig || options.postgresTls)) {
    throw new Error('community_doctor_postgres_requires_runtime_native')
  }
  const selectedTarget = options.target
    ? getApiTarget(options.target)
    : options.runtime
      ? undefined
      : getActiveApiTarget()
  if (options.target && !selectedTarget) throw new Error(`aops_target_not_found:${options.target}`)
  const selection = installSelection(options)
  const inspection = inspectCommunityInstall(selection)
  const nativeInspection = inspectCommunityNativeInstall(selection)
  const explicitContract = options.runtime
    ? buildCommunityInstanceContract({ ...options, port: 5900 })
    : undefined
  const profile = selectedTarget
    ? 'target-only' as const
    : explicitContract?.profile
      ?? (nativeInspection.status === 'installed' ? nativeInspection.state!.profile : undefined)
      ?? (inspection.status === 'installed' ? 'oci-managed-stack' as const : 'unconfigured' as const)
  const needsDocker = profile === 'oci-managed-stack' || profile === 'native-container-postgres'
  const needsCompose = profile === 'oci-managed-stack'

  checks.push({ id: 'cli-identity', status: 'pass', detail: `${cli.packageName}@${cli.version}; schema=${cli.commandSchemaVersion}; source=${cli.artifactSource}` })
  const osArchSupported = ['win32', 'darwin', 'linux'].includes(platform) && ['x64', 'arm64'].includes(arch)
  checks.push({ id: 'os-arch', status: osArchSupported ? 'pass' : 'fail', detail: `${platform}/${arch}` })

  if (needsDocker) {
    const docker = spawn('docker', ['--version'], { encoding: 'utf8', windowsHide: true })
    checks.push({
      id: 'docker-cli',
      status: docker.status === 0 ? 'pass' : 'fail',
      detail: docker.status === 0 ? String(docker.stdout).trim() : String(docker.stderr || docker.error?.message || 'docker unavailable').trim(),
    })
  } else checks.push({ id: 'docker-cli', status: 'skip', detail: `${profile} does not require a Docker application runtime.` })

  if (platform === 'win32' && needsDocker) {
    const wsl = spawn('wsl.exe', ['--status'], { encoding: 'utf8', windowsHide: true })
    checks.push({
      id: 'wsl2',
      status: wsl.status === 0 ? 'pass' : 'fail',
      detail: wsl.status === 0 ? String(wsl.stdout).replace(/\0/g, '').trim().slice(-1000) : String(wsl.stderr || wsl.error?.message || 'WSL2 unavailable').replace(/\0/g, '').trim(),
    })
  } else checks.push({ id: 'wsl2', status: 'skip', detail: needsDocker ? 'WSL2 check applies only to Windows.' : 'No Docker runtime selected.' })

  if (needsCompose) {
    const compose = spawn('docker', ['compose', 'version'], { encoding: 'utf8', windowsHide: true })
    checks.push({
      id: 'docker-compose',
      status: compose.status === 0 ? 'pass' : 'fail',
      detail: compose.status === 0 ? String(compose.stdout).trim() : String(compose.stderr || compose.error?.message || 'docker compose unavailable').trim(),
    })
  } else checks.push({ id: 'docker-compose', status: 'skip', detail: `${profile} does not require the application Compose stack.` })

  checks.push({
    id: 'sigstore-verifier',
    status: needsCompose ? 'pass' : 'skip',
    detail: needsCompose ? 'bundled sigstore-js verifier; no external cosign installation required' : 'Signed OCI release verification is not used by this profile.',
  })

  if (profile === 'target-only') {
    checks.push({ id: 'disk-space', status: 'skip', detail: 'The selected server is not managed as a local instance.' })
  } else {
    const filesystem = dependencies.statfs?.(existingAncestor(inspection.paths.dataRoot))
      ?? statfsSync(existingAncestor(inspection.paths.dataRoot), { bigint: true })
    const freeBytes = filesystem.bavail * filesystem.bsize
    const minimumBytes = 2n * 1024n * 1024n * 1024n
    checks.push({ id: 'disk-space', status: freeBytes >= minimumBytes ? 'pass' : 'fail', detail: `${(Number(freeBytes) / (1024 ** 3)).toFixed(1)} GiB free; 2.0 GiB minimum` })
  }

  checks.push({
    id: 'install-state',
    status: profile === 'target-only'
      ? 'skip'
      : nativeInspection.status === 'installed' && profile !== 'oci-managed-stack'
        ? 'pass'
        : nativeInspection.status === 'partial' || nativeInspection.status === 'runtime-conflict'
          ? 'fail'
      : inspection.status === 'installed' && profile === 'oci-managed-stack'
        ? 'pass'
        : inspection.status === 'partial'
          ? 'fail'
          : 'warn',
    detail: profile === 'target-only'
      ? 'The selected target is independent of any local installation state.'
      : nativeInspection.status === 'installed' && profile !== 'oci-managed-stack'
        ? `installed; profile=${nativeInspection.state!.profile}; root=${nativeInspection.paths.instanceRoot}`
        : nativeInspection.status === 'partial' || nativeInspection.status === 'runtime-conflict'
          ? `${nativeInspection.error ?? nativeInspection.status}; missing=${nativeInspection.missingFiles.join(',') || 'none'}`
      : inspection.status === 'partial'
      ? `${inspection.error ?? 'partial install'}; missing=${inspection.missingFiles.join(',') || 'none'}`
      : `${inspection.status}; profile=${profile}; root=${inspection.paths.instanceRoot}`,
  })

  if (profile === 'target-only' && selectedTarget) {
    checks.push({ id: 'release-cache', status: 'skip', detail: 'No local release cache is required for a server target.' })
    checks.push({ id: 'container-status', status: 'skip', detail: 'The target server lifecycle is not owned by this CLI instance.' })
    checks.push({ id: 'port', status: 'skip', detail: `Remote/existing endpoint: ${selectedTarget.apiBaseUrl}` })
    const targetDoctor = await (dependencies.targetDoctor ?? inspectTargetDoctor)(selectedTarget.name, { timeoutMs: options.timeoutMs, json: true })
    const compatibility = targetDoctor.compatibility as { compatible?: boolean; status?: string; reason?: string }
    checks.push({ id: 'server-health', status: targetDoctor.status === 'unavailable' ? 'fail' : 'pass', detail: `target=${selectedTarget.name}; status=${targetDoctor.status}` })
    checks.push({ id: 'compatibility', status: compatibility.compatible ? (compatibility.status === 'warning' ? 'warn' : 'pass') : 'fail', detail: String(compatibility.reason ?? 'unknown') })
  } else if (inspection.status === 'installed' && profile === 'oci-managed-stack') {
    const state = inspection.state!
    checks.push({ id: 'release-cache', status: 'pass', detail: `${state.activeRelease.releaseVersion} ${state.activeRelease.imageRef}` })
    const status = await communityProcessRuntime.run(buildCommunityComposeInvocation({ paths: inspection.paths, state, action: 'status' }))
    checks.push({ id: 'container-status', status: status.exitCode === 0 ? 'pass' : 'fail', detail: (status.stdout || status.stderr || `exit=${status.exitCode}`).trim().slice(-2000) })
    const port = readCommunityRuntimePort(inspection.paths)
    checks.push({ id: 'port', status: 'pass', detail: `configured=${port}; installed service is expected to own it` })
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5_000) })
      checks.push({ id: 'server-health', status: response.ok ? 'pass' : 'fail', detail: `HTTP ${response.status} on port ${port}` })
    } catch (error) {
      checks.push({ id: 'server-health', status: 'fail', detail: error instanceof Error ? error.message : String(error) })
    }
  } else if (nativeInspection.status === 'installed' && nativeInspection.state && profile !== 'oci-managed-stack') {
    const state = nativeInspection.state
    checks.push({ id: 'release-cache', status: 'skip', detail: `Native source checkout ${state.source.releaseVersion}; no OCI release cache.` })
    if (state.postgres.mode === 'container') {
      try {
        const postgres = await inspectCommunityNativePostgres({
          state: state.postgres,
          instanceName: state.instanceName,
          instanceRoot: nativeInspection.paths.instanceRoot,
        })
        checks.push({
          id: 'container-status',
          status: postgres.container === 'running' && postgres.health === 'healthy' ? 'pass' : 'fail',
          detail: `postgres=${postgres.container}; health=${postgres.health}; image=${postgres.imageRef}`,
        })
      } catch (error) {
        checks.push({ id: 'container-status', status: 'fail', detail: error instanceof Error ? error.message : String(error) })
      }
    } else {
      checks.push({ id: 'container-status', status: 'skip', detail: 'External PostgreSQL is owned outside this CLI instance.' })
    }
    checks.push({ id: 'port', status: 'pass', detail: `configured=${state.server.port}; installed native service is expected to own it` })
    try {
      const response = await fetchImpl(`http://127.0.0.1:${state.server.port}/api/health`, { signal: AbortSignal.timeout(5_000) })
      checks.push({ id: 'server-health', status: response.ok ? 'pass' : 'fail', detail: `HTTP ${response.status} on port ${state.server.port}` })
    } catch (error) {
      checks.push({ id: 'server-health', status: 'fail', detail: error instanceof Error ? error.message : String(error) })
    }
    checks.push({ id: 'compatibility', status: 'skip', detail: 'Local native runtime uses the installed CLI/server contract.' })
  } else {
    const available = await (dependencies.portProbe ?? probePort)(explicitContract?.server.port ?? 5900)
    checks.push({ id: 'release-cache', status: 'skip', detail: 'No complete OCI installation to inspect.' })
    checks.push({ id: 'port', status: available ? 'pass' : 'fail', detail: available ? '5900 is available' : '5900 is already in use' })
    checks.push({ id: 'container-status', status: 'skip', detail: 'No complete local installation to inspect.' })
    checks.push({ id: 'server-health', status: 'skip', detail: 'No configured server target or running local instance.' })
    checks.push({ id: 'compatibility', status: 'skip', detail: 'Select a target or start a local instance first.' })
  }

  if (profile === 'oci-managed-stack') {
    checks.push(await anonymousRegistryCheck(inspection.status === 'installed' ? inspection.state!.activeRelease.imageIndexDigest : undefined, fetchImpl))
  } else checks.push({ id: 'anonymous-registry', status: 'skip', detail: `${profile} does not pull the AOPS application image.` })

  return {
    status: checks.some((check) => check.status === 'fail') ? 'attention-required' : 'healthy',
    mutationFree: true,
    profile,
    cli,
    selectedTarget: selectedTarget ?? null,
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
    .description('Run mutation-free, profile-aware CLI/target/local-instance checks')
    .option('--instance <name>', 'Local instance name', 'default')
    .option('--data-root <path>', 'Absolute Community data root override')
    .option('--runtime <native|oci>', 'Preview checks for an explicit application runtime')
    .option('--postgres <external|container>', 'PostgreSQL profile for --runtime native')
    .option('--postgres-config <path>', 'External PostgreSQL config reference')
    .option('--postgres-tls <disable|require|verify-full>', 'External PostgreSQL TLS policy')
    .option('--target <name>', 'Named existing server target')
    .option('--timeout-ms <ms>', 'Target request timeout', (value) => Number.parseInt(value, 10))
    .option('--json', 'Output JSON')
    .action(runCommunityDoctor)
}
