import { spawnSync } from 'node:child_process'
import path from 'node:path'

import {
  readAopsServerEnvConfig,
  resolveAopsServerEnvPath,
  type AopsServerEnvPathSource,
} from '@aops/runtime-config'

import { inspectCommunityInstall } from './community-lifecycle.js'
import {
  buildCommunityPnpmInvocation,
  isCommunityNativeNpmPackageSource,
  inspectCommunityNativeInstall,
  inspectCommunityNativeSource,
  loadExternalPostgresUrl,
  resolveCommunityNativeDefaultSourceRoot,
} from './community-native-lifecycle.js'
import {
  buildCommunityInstanceContract,
  type CommunityPostgresTlsPolicy,
} from './community-instance-contract.js'
import { createCliApiClientFromOptions, fetchCliBootstrapHealth } from '../utils/api.js'
import { getActiveApiTarget } from '../utils/config.js'
import {
  inspectSetupAgentAssets,
  type SetupAgentAssetsProvider,
  type SetupAgentAssetsStatus,
} from './setup-agent-assets-bridge.js'
import {
  inspectLocalPostgres,
  type LocalPostgresInspection,
} from './setup-local-postgres.js'

export const SETUP_PATHS = [
  {
    id: 'native-external',
    number: '1',
    title: 'Npm server with your existing PostgreSQL',
  },
  {
    id: 'native-container',
    number: '2',
    title: 'Npm server with automatic Docker PostgreSQL',
  },
  {
    id: 'native-local',
    number: '3',
    title: 'Npm server with PostgreSQL installed on this computer',
  },
  {
    id: 'cli-existing',
    number: '4',
    title: 'CLI connected to an existing AOPS server',
  },
] as const

export type SetupPathId = (typeof SETUP_PATHS)[number]['id']
export type SetupPathNumber = (typeof SETUP_PATHS)[number]['number']
export type SetupReadinessState = 'ready' | 'action-required' | 'not-applicable' | 'unknown'

export type SetupReadinessCheck = Readonly<{
  id:
    | 'installation-path'
    | 'installation-state'
    | 'global-server-env'
    | 'postgresql-tls'
    | 'local-postgresql'
    | 'runtime'
    | 'host'
    | 'first-admin'
    | 'target-login'
    | 'agent-assets'
  state: SetupReadinessState
  required: boolean
  summary: string
  next?: string
  data?: Readonly<Record<string, unknown>>
}>

export type SetupReadinessResult = Readonly<{
  schemaVersion: 1
  mutationFree: true
  status: 'ready' | 'action-required'
  path: Readonly<{
    id: SetupPathId | null
    number: SetupPathNumber | null
    title: string | null
    source: 'explicit' | 'installed-state' | 'active-target' | 'unselected'
  }>
  checks: readonly SetupReadinessCheck[]
  nextActions: readonly string[]
}>

type ActiveTargetSummary = Readonly<{
  name: string
  apiBaseUrl: string
  authProvider: 'trusted-local' | 'authv2-jwt-session'
  hasCredentials: boolean
}>

type EndpointProbe = Readonly<{
  reachable: boolean
  authRequired: boolean | null
  firstAdminState: 'not-applicable' | 'required' | 'ready' | 'blocked' | 'unknown' | null
}>

export type SetupReadinessProbeOverrides = Readonly<{
  nativeInspection?: ReturnType<typeof inspectCommunityNativeInstall>
  ociInspection?: ReturnType<typeof inspectCommunityInstall>
  activeTarget?: ActiveTargetSummary | null
  commandAvailable?: (command: string) => boolean
  endpoint?: EndpointProbe
  agentAssets?: SetupAgentAssetsStatus
  localPostgres?: LocalPostgresInspection
}>

export type InspectSetupReadinessOptions = Readonly<{
  path?: string
  postgresConfig?: string
  postgresTls?: CommunityPostgresTlsPolicy
  apiBaseUrl?: string
  instance?: string
  dataRoot?: string
  port?: number
  timeoutMs?: number
  cwd?: string
  sourceRoot?: string
  localPostgresHost?: string
  localPostgresPort?: number
  processEnv?: NodeJS.ProcessEnv
  agentAssetsProvider?: SetupAgentAssetsProvider
  probes?: SetupReadinessProbeOverrides
}>

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function normalizeSafeApiBaseUrl(value: unknown): string | undefined {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return undefined
  try {
    const parsed = new URL(normalized)
    if (
      !['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.search || parsed.hash || parsed.pathname !== '/'
    ) {
      throw new Error('setup_api_base_url_invalid')
    }
    return parsed.origin
  } catch {
    throw new Error('setup_api_base_url_invalid')
  }
}

function normalizePort(value: unknown): number {
  const port = Number(value ?? 5900)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('setup_port_invalid')
  }
  return port
}

export function parseSetupPath(value: unknown): SetupPathId | undefined {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized) return undefined
  return SETUP_PATHS.find((entry) => entry.id === normalized || entry.number === normalized)?.id
}

function pathDescriptor(id: SetupPathId | undefined) {
  return id ? SETUP_PATHS.find((entry) => entry.id === id)! : undefined
}

function isLoopbackUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)
  } catch {
    return false
  }
}

function isLoopbackPostgresAtPort(value: string, port: number): boolean {
  try {
    const parsed = new URL(value)
    return isLoopbackUrl(value) && Number(parsed.port || 5432) === port
  } catch {
    return false
  }
}

function commandAvailable(command: string): boolean {
  const locator = process.platform === 'win32' ? 'where.exe' : 'which'
  const result = spawnSync(locator, [command], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 1_000,
    stdio: 'ignore',
  })
  return result.status === 0
}

function dockerRuntimeAvailable(compose: boolean): boolean {
  const info = spawnSync('docker', ['info', '--format', '{{json .ServerVersion}}'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 2_000,
    stdio: 'ignore',
  })
  if (info.status !== 0) return false
  if (!compose) return true
  const composeVersion = spawnSync('docker', ['compose', 'version'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 2_000,
    stdio: 'ignore',
  })
  return composeVersion.status === 0
}

function safeReason(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : ''
  return /^[a-z0-9_:-]+$/i.test(message) ? message : fallback
}

function inferInstalledPath(
  native: ReturnType<typeof inspectCommunityNativeInstall>,
  oci: ReturnType<typeof inspectCommunityInstall>,
): SetupPathId | undefined {
  if (native.status === 'installed' && native.state?.profile === 'native-external-postgres') {
    return 'native-external'
  }
  if (native.status === 'installed' && native.state?.profile === 'native-container-postgres') {
    return 'native-container'
  }
  return undefined
}

function installationStateCheck(
  selected: SetupPathId | undefined,
  native: ReturnType<typeof inspectCommunityNativeInstall>,
  oci: ReturnType<typeof inspectCommunityInstall>,
): SetupReadinessCheck {
  if (!selected) {
    return {
      id: 'installation-state',
      state: 'unknown',
      required: false,
      summary: 'Installation state will be evaluated after a path is selected.',
    }
  }
  if (selected === 'cli-existing') {
    return {
      id: 'installation-state',
      state: 'not-applicable',
      required: false,
      summary: 'The CLI-only path does not install a local server runtime.',
    }
  }
  if (oci.status !== 'not-installed') {
    return {
      id: 'installation-state',
      state: 'action-required',
      required: true,
      summary: 'A legacy application-image installation owns this local instance.',
      next: 'Use the explicit server lifecycle to inspect or remove that installation before selecting an npm-server setup path.',
      data: { blocking: true, legacyProfile: 'oci-managed-stack' },
    }
  }
  const installedPath = inferInstalledPath(native, oci)
  const compatibleInstalledPath =
    selected === 'native-local' && installedPath === 'native-external'
      ? selected
      : installedPath
  if (compatibleInstalledPath && compatibleInstalledPath !== selected) {
    return {
      id: 'installation-state',
      state: 'action-required',
      required: true,
      summary: 'A different local installation profile already owns this instance.',
      next: 'Use the installed path, or run the explicit migration/reset workflow before switching paths.',
      data: { blocking: true, selectedPath: selected, installedPath },
    }
  }
  if (native.status === 'runtime-conflict' || (native.status !== 'not-installed' && oci.status !== 'not-installed')) {
    return {
      id: 'installation-state',
      state: 'action-required',
      required: true,
      summary: 'Conflicting local runtime state requires repair before setup can continue.',
      next: 'Run `aops doctor --json` and resolve the reported runtime conflict.',
      data: { blocking: true },
    }
  }
  const expected =
    selected === 'native-external' || selected === 'native-local'
      ? native.status === 'installed' && native.state?.profile === 'native-external-postgres'
      : selected === 'native-container'
        ? native.status === 'installed' && native.state?.profile === 'native-container-postgres'
        : false
  const partial = native.status === 'partial'
  if (partial) {
    return {
      id: 'installation-state',
      state: 'action-required',
      required: true,
      summary: 'A partial local installation requires repair or an explicit reset.',
      next: 'Run `aops doctor --json` before resuming setup.',
      data: { blocking: true },
    }
  }
  return expected
    ? {
        id: 'installation-state',
        state: 'ready',
        required: true,
        summary: 'The selected local installation profile is present.',
      }
    : {
        id: 'installation-state',
        state: 'action-required',
        required: true,
        summary: 'The selected local installation profile is not installed yet.',
        next: 'Run `aops setup init --apply` to continue the selected setup path.',
      }
}

async function probeEndpoint(options: {
  apiBaseUrl?: string
  targetName?: string
  timeoutMs: number
}): Promise<EndpointProbe> {
  try {
    const api = await createCliApiClientFromOptions({
      apiBaseUrl: options.apiBaseUrl,
      targetName: options.targetName,
      timeoutMs: options.timeoutMs,
    })
    const bootstrap = await fetchCliBootstrapHealth<Record<string, unknown>>(api, {
      timeoutMs: options.timeoutMs,
    })
    const auth = bootstrap.auth && typeof bootstrap.auth === 'object'
      ? bootstrap.auth as Record<string, unknown>
      : null
    const firstAdminState = auth && typeof auth.firstAdminState === 'string'
      ? auth.firstAdminState
      : null
    return {
      reachable: true,
      authRequired: bootstrap.authRequired === true,
      firstAdminState:
        firstAdminState === 'not-applicable' || firstAdminState === 'required' ||
        firstAdminState === 'ready' || firstAdminState === 'blocked' || firstAdminState === 'unknown'
          ? firstAdminState
          : null,
    }
  } catch {
    return { reachable: false, authRequired: null, firstAdminState: null }
  }
}

function agentAssetCheck(status: SetupAgentAssetsStatus): SetupReadinessCheck {
  if (status.availability === 'task-136-pending') {
    return {
      id: 'agent-assets',
      state: 'action-required',
      required: false,
      summary: status.summary,
      next: status.nextActions[0],
      data: status.data,
    }
  }
  return status.state === 'ready'
    ? {
        id: 'agent-assets',
        state: 'ready',
        required: true,
        summary: status.summary,
        data: status.data,
      }
    : {
        id: 'agent-assets',
        state: 'action-required',
        required: true,
        summary: status.summary,
        next: status.nextActions[0],
        data: status.data,
      }
}

export async function inspectSetupReadiness(
  options: InspectSetupReadinessOptions = {},
): Promise<SetupReadinessResult> {
  const processEnv = options.processEnv ?? process.env
  const cwd = path.resolve(options.cwd ?? process.cwd())
  const probes = options.probes ?? {}
  const explicitApiBaseUrl = normalizeSafeApiBaseUrl(options.apiBaseUrl)
  const localPort = normalizePort(options.port)
  const native = probes.nativeInspection ?? inspectCommunityNativeInstall({
    instanceName: options.instance,
    dataRoot: options.dataRoot,
  })
  const oci = probes.ociInspection ?? inspectCommunityInstall({
    instanceName: options.instance,
    dataRoot: options.dataRoot,
  })
  let activeTarget: ActiveTargetSummary | null = probes.activeTarget ?? null
  if (probes.activeTarget === undefined) {
    try {
      activeTarget = getActiveApiTarget() as ActiveTargetSummary | null
    } catch {
      activeTarget = null
    }
  }

  const explicitPath = parseSetupPath(options.path)
  const installedPath = inferInstalledPath(native, oci)
  const activeTargetPath = activeTarget && !isLoopbackUrl(activeTarget.apiBaseUrl) ? 'cli-existing' : undefined
  const selected = explicitPath ?? installedPath ?? activeTargetPath
  const descriptor = pathDescriptor(selected)
  const source = explicitPath
    ? 'explicit'
    : installedPath
      ? 'installed-state'
      : activeTargetPath
        ? 'active-target'
        : 'unselected'
  const checks: SetupReadinessCheck[] = [
    descriptor
      ? {
          id: 'installation-path',
          state: 'ready',
          required: true,
          summary: `Path ${descriptor.number} selected: ${descriptor.title}.`,
          data: { id: descriptor.id, number: descriptor.number },
        }
      : {
          id: 'installation-path',
          state: 'action-required',
          required: true,
          summary: 'No installation path has been selected or inferred.',
          next: 'Choose path 1, 2, 3, or 4.',
          data: { choices: SETUP_PATHS },
        },
  ]
  checks.push(installationStateCheck(selected, native, oci))

  const explicitPostgresConfig = normalizeNonEmpty(options.postgresConfig)
  const safePostgresConfig = explicitPostgresConfig
    ? buildCommunityInstanceContract({
        runtime: 'native',
        postgres: 'external',
        postgresConfig: explicitPostgresConfig,
        postgresTls: options.postgresTls ?? 'require',
        processEnv,
      }).postgres.configRef
    : undefined
  const envResolution = resolveAopsServerEnvPath({ explicitPath: safePostgresConfig }, processEnv)
  let envSnapshot: ReturnType<typeof readAopsServerEnvConfig> | undefined
  let envError: string | undefined
  try {
    envSnapshot = readAopsServerEnvConfig(processEnv, envResolution.path)
  } catch (error) {
    envError = safeReason(error, 'aops_server_env_invalid')
  }
  if (selected === 'native-external' || selected === 'native-local') {
    const postgresEnvReady = Boolean(envSnapshot?.exists && envSnapshot.repoDialect === 'pg' && envSnapshot.repoUrl)
    const selectedLocalPostgresPort = Number(options.localPostgresPort ?? 5432)
    const envReady = postgresEnvReady && (
      selected !== 'native-local' || isLoopbackPostgresAtPort(
        String(envSnapshot?.repoUrl ?? ''),
        selectedLocalPostgresPort,
      )
    )
    checks.push({
      id: 'global-server-env',
      state: envReady ? 'ready' : 'action-required',
      required: true,
      summary: envReady
        ? 'The selected server env contains a PostgreSQL repository target.'
        : selected === 'native-local' && postgresEnvReady
          ? 'The selected server env points to a non-local PostgreSQL target or a different local port.'
          : 'The selected server env is missing, unsafe, or does not contain a PostgreSQL target.',
      next: envReady
        ? undefined
        : selected === 'native-local'
          ? 'Path 3 creates a private local server env during apply; use `--postgres-config <private-path>` to preserve an existing remote env, or use path 1 for that remote target.'
          : 'Run `aops setup server-env` or provide a safe `--postgres-config` file path.',
      data: {
        path: envResolution.path,
        source: envResolution.source satisfies AopsServerEnvPathSource,
        exists: envSnapshot?.exists ?? false,
        repoDialect: envSnapshot?.repoDialect ?? null,
        redactedRepoUrl: envSnapshot?.redactedRepoUrl ?? null,
        error: envError ?? null,
        blocking: selected === 'native-local' && postgresEnvReady && !envReady,
      },
    })
    const tlsPolicy = selected === 'native-local' ? 'disable' : options.postgresTls
    if (!tlsPolicy) {
      checks.push({
        id: 'postgresql-tls',
        state: 'action-required',
        required: true,
        summary: 'A PostgreSQL TLS policy has not been selected.',
        next: 'Choose disable (loopback only), require, or verify-full.',
      })
    } else if (!envReady) {
      checks.push({
        id: 'postgresql-tls',
        state: 'action-required',
        required: true,
        summary: 'PostgreSQL TLS readiness cannot be validated until the server env is ready.',
      })
    } else {
      try {
        loadExternalPostgresUrl(envResolution.path, tlsPolicy)
        checks.push({
          id: 'postgresql-tls',
          state: 'ready',
          required: true,
          summary: `PostgreSQL configuration satisfies the ${tlsPolicy} TLS policy.`,
          data: { policy: tlsPolicy },
        })
      } catch (error) {
        checks.push({
          id: 'postgresql-tls',
          state: 'action-required',
          required: true,
          summary: 'PostgreSQL or TLS configuration is not ready.',
          next: 'Repair the selected server env and TLS root certificate reference.',
          data: { policy: tlsPolicy, error: safeReason(error, 'postgresql_tls_config_invalid') },
        })
      }
    }
  } else {
    checks.push({
      id: 'global-server-env',
      state: 'not-applicable',
      required: false,
      summary: 'This path does not require an external PostgreSQL server env.',
      data: { path: envResolution.path, source: envResolution.source },
    })
    checks.push({
      id: 'postgresql-tls',
      state: 'not-applicable',
      required: false,
      summary: 'External PostgreSQL TLS configuration is not used by this path.',
    })
  }

  if (selected === 'native-local') {
    const local = probes.localPostgres ?? await inspectLocalPostgres({
      host: options.localPostgresHost,
      port: options.localPostgresPort,
      timeoutMs: options.timeoutMs,
    })
    const next = local.reachable
      ? undefined
      : [local.guidance.summary, ...local.guidance.commands, local.guidance.url].join(' ')
    checks.push({
      id: 'local-postgresql',
      state: local.reachable ? 'ready' : 'action-required',
      required: true,
      summary: local.reachable
        ? `A local PostgreSQL endpoint is reachable at ${local.host}:${local.port}.`
        : local.status === 'installed-not-running'
          ? `PostgreSQL tools were found, but no server is reachable at ${local.host}:${local.port}.`
          : `PostgreSQL was not detected at ${local.host}:${local.port}.`,
      next,
      data: {
        host: local.host,
        port: local.port,
        status: local.status,
        psqlAvailable: local.psqlAvailable,
        psqlVersion: local.psqlVersion,
        install: local.reachable ? null : local.guidance,
      },
    })
  } else {
    checks.push({
      id: 'local-postgresql',
      state: 'not-applicable',
      required: false,
      summary: 'Local PostgreSQL discovery and provisioning are not used by this path.',
    })
  }

  const hasCommand = probes.commandAvailable ?? commandAvailable
  if (selected === 'native-external' || selected === 'native-container' || selected === 'native-local') {
    const selectedSourceRoot = path.resolve(
      options.sourceRoot ?? native.state?.source.root ?? resolveCommunityNativeDefaultSourceRoot(cwd),
    )
    let nativeSourceReady = false
    let npmPackage = false
    let nativeSourceError: string | null = null
    if (probes.commandAvailable) {
      nativeSourceReady = options.sourceRoot ? hasCommand('pnpm') : true
    } else {
      try {
        inspectCommunityNativeSource(selectedSourceRoot)
        npmPackage = isCommunityNativeNpmPackageSource(selectedSourceRoot)
        if (!npmPackage) buildCommunityPnpmInvocation(selectedSourceRoot, ['--version'], processEnv)
        nativeSourceReady = true
      } catch (error) {
        nativeSourceError = safeReason(error, 'community_native_source_runtime_invalid')
      }
    }
    const needsDocker = selected === 'native-container'
    const dockerReady = !needsDocker
      ? true
      : probes.commandAvailable
        ? hasCommand('docker')
        : hasCommand('docker') && dockerRuntimeAvailable(false)
    const runtimeReady = nativeSourceReady && dockerReady
    checks.push({
      id: 'runtime',
      state: runtimeReady ? 'ready' : 'action-required',
      required: true,
      summary: runtimeReady
        ? npmPackage
          ? 'The installed npm server runtime is ready; no source build is required.'
          : 'Native source runtime requirements are available.'
        : needsDocker
          ? 'The installed npm server runtime (or an explicit source checkout) and a running Docker daemon are required.'
          : 'Install @aopslab/aops-server through the CLI package, or provide a valid Community checkout with pnpm 11.',
      next: runtimeReady
        ? undefined
        : needsDocker
          ? 'Install and start Docker Desktop/Engine, then retry the npm-server setup.'
          : 'Install the matching npm server package or provide a valid Community source checkout.',
      data: {
        node: process.version,
        sourceRoot: selectedSourceRoot,
        sourceKind: npmPackage ? 'npm-package' : 'source-checkout',
        nativeSource: nativeSourceReady,
        docker: needsDocker ? dockerReady : null,
        error: nativeSourceError,
      },
    })
  } else if (selected === 'cli-existing') {
    checks.push({
      id: 'runtime',
      state: 'not-applicable',
      required: false,
      summary: 'The CLI-only path does not require a local server or container runtime.',
    })
  } else {
    checks.push({
      id: 'runtime',
      state: 'unknown',
      required: false,
      summary: 'Runtime requirements depend on the selected installation path.',
    })
  }

  const endpointUrl = selected === 'cli-existing'
    ? explicitApiBaseUrl ?? activeTarget?.apiBaseUrl
    : explicitApiBaseUrl ?? `http://127.0.0.1:${localPort}`
  const endpoint = probes.endpoint ?? (endpointUrl
    ? await probeEndpoint({
        apiBaseUrl: selected === 'cli-existing' && !explicitApiBaseUrl ? undefined : endpointUrl,
        targetName: selected === 'cli-existing' && !explicitApiBaseUrl ? activeTarget?.name : undefined,
        timeoutMs: options.timeoutMs ?? 1_500,
      })
    : { reachable: false, authRequired: null, firstAdminState: null })
  checks.push({
    id: 'host',
    state: endpoint.reachable ? 'ready' : 'action-required',
    required: true,
    summary: endpoint.reachable
      ? `${selected === 'cli-existing' ? 'Remote' : 'Local'} AOPS host is reachable.`
      : `${selected === 'cli-existing' ? 'Remote' : 'Local'} AOPS host is not reachable yet.`,
    next: endpoint.reachable
      ? undefined
      : selected === 'cli-existing'
        ? 'Configure a reachable target or pass `--api-base-url`.'
        : 'Install or start the selected local runtime.',
    data: { apiBaseUrl: endpointUrl ?? null },
  })
  const firstAdminReady =
    !endpoint.reachable || endpoint.authRequired !== true ||
    endpoint.firstAdminState === 'ready' || endpoint.firstAdminState === 'not-applicable'
  checks.push({
    id: 'first-admin',
    state: !endpoint.reachable
      ? 'unknown'
      : firstAdminReady
        ? 'ready'
        : 'action-required',
    required: endpoint.reachable && endpoint.authRequired === true,
    summary: !endpoint.reachable
      ? 'First-admin readiness will be checked when the host is reachable.'
      : firstAdminReady
        ? 'First-admin bootstrap does not require action.'
        : 'Interactive auth requires a first admin.',
    next: endpoint.reachable && !firstAdminReady ? 'Run `aops setup first-admin`.' : undefined,
    data: { state: endpoint.firstAdminState },
  })
  const targetRequired = selected === 'cli-existing'
  const loginReady =
    endpoint.authRequired !== true || Boolean(activeTarget?.hasCredentials)
  checks.push({
    id: 'target-login',
    state: !targetRequired
      ? 'not-applicable'
      : !activeTarget
        ? 'action-required'
        : loginReady
          ? 'ready'
          : 'action-required',
    required: targetRequired,
    summary: !targetRequired
      ? 'A remote target is not required for this local installation path.'
      : !activeTarget
        ? explicitApiBaseUrl
          ? 'The endpoint was probed, but no persistent existing-server target is selected.'
          : 'No existing-server target is configured.'
        : loginReady
          ? 'Target and login state are ready.'
          : 'The target requires login credentials.',
    next: targetRequired && !activeTarget
      ? 'Add and select an AOPS target.'
      : targetRequired && !loginReady
        ? 'Run `aops auth login` for the selected target.'
        : undefined,
    data: activeTarget
      ? { name: activeTarget.name, apiBaseUrl: activeTarget.apiBaseUrl, hasCredentials: activeTarget.hasCredentials }
      : { apiBaseUrl: endpointUrl ?? null },
  })

  const assets = probes.agentAssets ?? await inspectSetupAgentAssets(options.agentAssetsProvider)
  checks.push(agentAssetCheck(assets))

  const requiredAction = checks.some((check) => check.required && check.state !== 'ready' && check.state !== 'not-applicable')
  const nextActions = [...new Set(checks.map((check) => check.next).filter((value): value is string => Boolean(value)))]
  return Object.freeze({
    schemaVersion: 1,
    mutationFree: true,
    status: requiredAction ? 'action-required' : 'ready',
    path: Object.freeze({
      id: descriptor?.id ?? null,
      number: descriptor?.number ?? null,
      title: descriptor?.title ?? null,
      source,
    }),
    checks: Object.freeze(checks),
    nextActions: Object.freeze(nextActions),
  })
}
