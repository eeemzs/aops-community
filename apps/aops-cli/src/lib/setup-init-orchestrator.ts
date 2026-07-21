import path from 'node:path'

import { banner, logInfo, logSuccess, logWarn, withSpinner } from '@aopslab/xf-cli-ui'

import { runAuthLogin } from '../commands/auth/login.js'
import { runCommunityServerSetup } from '../commands/community-server.js'
import { runTargetAdd } from '../commands/target.js'
import { promptConfirm, promptInput, promptPassword, promptSelect } from '../utils/prompts.js'
import {
  inspectSetupReadiness,
  parseSetupPath,
  SETUP_PATHS,
  type SetupPathId,
  type SetupReadinessResult,
} from './setup-readiness.js'
import {
  applySetupAgentAssets,
  SETUP_AGENT_ASSETS_GATEWAYS,
  type SetupAgentAssetsProvider,
} from './setup-agent-assets-bridge.js'
import type { SetupOfficialCatalogProviderV1 } from './setup-official-catalog-bridge.js'
import {
  seedCommunityStarterData,
  type CommunityStarterSeedOptions,
} from './community-starter-seed.js'
import {
  defaultLocalPostgresAdminUser,
  defaultLocalPostgresDatabase,
  provisionLocalPostgres,
  type ProvisionLocalPostgresOptions,
} from './setup-local-postgres.js'
import {
  isExternalPostgresTlsProbeError,
  probeExternalPostgresConnection,
} from './setup-external-postgres.js'
import {
  planCommunityNativeInstalledMigration,
  stopCommunityNativeInstall,
} from './community-native-lifecycle.js'

export type SetupInitOptions = {
  path?: string
  postgresConfig?: string
  postgresTls?: 'disable' | 'require' | 'verify-full'
  localPostgresHost?: string
  localPostgresPort?: number
  localPostgresAdminUser?: string
  localPostgresDatabase?: string
  localPostgresAppUser?: string
  localPostgresAdminNoPassword?: boolean
  apiBaseUrl?: string
  instance?: string
  dataRoot?: string
  sourceRoot?: string
  port?: number
  targetName?: string
  targetAuthProvider?: 'trusted-local' | 'authv2-jwt-session'
  targetTlsPolicy?: 'loopback-http' | 'system-ca'
  agentAssets?: 'status' | 'install' | 'repair' | 'skip'
  agentAssetsRelease?: string
  noCatalog?: boolean
  catalogRelease?: string
  catalogIdempotencyKey?: string
  seed?: boolean
  apply?: boolean
  resume?: boolean
  timeoutMs?: number
  yes?: boolean
  json?: boolean
  skipBanner?: boolean
}

type SetupServerEnvResult = Readonly<{
  ok: boolean
  envPath: string
  repoDialect?: string
  updated?: boolean
}>

type SetupFirstAdminResult = Readonly<{
  ok: boolean
  action: string
}>

export type SetupInitDependencies = Readonly<{
  inspectReadiness?: typeof inspectSetupReadiness
  setupServerEnv?: (options: Readonly<{
    root?: string
    envPath?: string
    repoUrl?: string
    yes?: boolean
    skipBanner?: boolean
  }>) => Promise<SetupServerEnvResult>
  setupCommunityServer?: typeof runCommunityServerSetup
  addTarget?: typeof runTargetAdd
  setupFirstAdmin?: (options: Readonly<{ apiBaseUrl?: string }>) => Promise<SetupFirstAdminResult>
  authLogin?: typeof runAuthLogin
  confirm?: typeof promptConfirm
  password?: typeof promptPassword
  input?: typeof promptInput
  select?: typeof promptSelect
  progress?: SetupProgressRunner
  agentAssets?: SetupAgentAssetsProvider
  officialCatalog?: SetupOfficialCatalogProviderV1
  seedStarter?: (options: CommunityStarterSeedOptions) => Promise<Readonly<Record<string, unknown>>>
  provisionLocalPostgres?: (
    options: ProvisionLocalPostgresOptions,
  ) => ReturnType<typeof provisionLocalPostgres>
  probeExternalPostgres?: typeof probeExternalPostgresConnection
  planInstalledMigration?: typeof planCommunityNativeInstalledMigration
  stopInstalledServer?: typeof stopCommunityNativeInstall
}>

export type SetupProgressRunner = <T>(label: string, action: () => Promise<T>) => Promise<T>

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
}

function validateManagedPostgresPassword(value: string): true | string {
  if (value.length < 16) return 'Use at least 16 characters.'
  if (value.length > 128) return 'Use no more than 128 characters.'
  if (value !== value.trim()) return 'Do not begin or end the password with whitespace.'
  if (/\0|\r|\n/.test(value)) return 'The password cannot contain line breaks or NUL characters.'
  return true
}

function validateLocalPostgresIdentifier(value: string): true | string {
  return /^[a-z][a-z0-9_]{0,62}$/.test(value.trim().toLowerCase())
    ? true
    : 'Use 1-63 lowercase letters, digits, or underscores; begin with a letter.'
}

function validateLocalPostgresAdminPassword(value: string): true | string {
  if (value.length > 1_024) return 'Use no more than 1024 characters.'
  if (/\0|\r|\n/.test(value)) return 'The password cannot contain line breaks or NUL characters.'
  return true
}

function printMigrationVerification(result: unknown): void {
  if (!result || typeof result !== 'object') return
  const migration = (result as Record<string, unknown>).migration
  if (!migration || typeof migration !== 'object') return
  const summary = migration as Record<string, unknown>
  if (summary.status !== 'community-native-migration-verified') return
  const action = summary.action === 'migrate' ? 'migrate' : 'verify-only'
  const count = typeof summary.pendingMigrationCount === 'number' ? summary.pendingMigrationCount : 0
  const detail = action === 'migrate'
    ? `${count} migration${count === 1 ? '' : 's'} applied`
    : 'schema already current'
  logSuccess(`PostgreSQL schema verified (${detail}).`)
}

function printSetupReadiness(result: SetupReadinessResult): void {
  for (const check of result.checks) {
    const prefix = check.state === 'ready'
      ? 'READY'
      : check.state === 'not-applicable'
        ? 'N/A'
        : check.state === 'unknown'
          ? 'WAIT'
          : 'ACTION'
    logInfo(`[${prefix}] ${check.summary}`)
    if (check.next) logInfo(`  Next: ${check.next}`)
  }
  if (result.status === 'ready') logSuccess('AOPS setup readiness checks passed.')
  else logWarn('AOPS setup has remaining actions.')
}

function normalizeAgentAssetsAction(value: SetupInitOptions['agentAssets']): SetupInitOptions['agentAssets'] {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'status' || normalized === 'install' || normalized === 'repair' || normalized === 'skip') {
    return normalized
  }
  throw new Error('setup_init_agent_assets_action_invalid:choose_status_install_repair_or_skip')
}

function resolveAgentAssetsReleasePath(value: string | undefined): string {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) throw new Error('setup_init_agent_assets_release_required_for_install')
  if (/\0|\r|\n/.test(normalized) || /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    throw new Error('setup_init_agent_assets_release_path_invalid')
  }
  return path.resolve(normalized)
}

function resolveOfficialCatalogReleasePath(value: string | undefined): string {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) throw new Error('setup_init_catalog_release_required_or_use_--no-catalog')
  if (/\0|\r|\n/.test(normalized) || /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    throw new Error('setup_init_catalog_release_path_invalid')
  }
  return path.resolve(normalized)
}

/**
 * Shared setup-init orchestration. Hosting-specific setup commands inject only
 * their server-env and optional first-admin implementations; readiness,
 * lifecycle, target, login, and TASK-136 assets sequencing remain single-source.
 */
export async function runSetupInitOrchestrator(
  options: SetupInitOptions = {},
  dependencies: SetupInitDependencies = {},
): Promise<SetupReadinessResult> {
  const inspectReadiness = dependencies.inspectReadiness ?? inspectSetupReadiness
  const setupCommunityServer = dependencies.setupCommunityServer ?? runCommunityServerSetup
  const addTarget = dependencies.addTarget ?? runTargetAdd
  const authLogin = dependencies.authLogin ?? runAuthLogin
  const confirm = dependencies.confirm ?? promptConfirm
  const password = dependencies.password ?? promptPassword
  const input = dependencies.input ?? promptInput
  const select = dependencies.select ?? promptSelect
  const interactive = !options.yes && !options.json
  const directProgress: SetupProgressRunner = async (_label, action) => action()
  const progress = interactive
    ? dependencies.progress ?? (process.stdout.isTTY === true ? withSpinner : directProgress)
    : directProgress
  const requestedAgentAssetsAction = normalizeAgentAssetsAction(options.agentAssets)
  const requestedPath = normalizeNonEmpty(options.path)
  if (requestedPath && !parseSetupPath(requestedPath)) {
    throw new Error('setup_init_path_invalid:choose_1_2_3_or_4')
  }

  if (interactive && !options.skipBanner) {
    banner('AOPS Setup')
    logInfo('Install directly here. For guided installation with any terminal AI agent, use `aops setup ai`.')
    logInfo('Enter database secrets only in masked AOPS prompts; never paste them into chat.')
  }

  let selectedPath: SetupPathId | undefined = parseSetupPath(requestedPath)
  if (!selectedPath && interactive) {
    const inferred = await inspectReadiness({
      postgresConfig: options.postgresConfig,
      postgresTls: options.postgresTls,
      apiBaseUrl: options.apiBaseUrl,
      instance: options.instance,
      dataRoot: options.dataRoot,
      sourceRoot: options.sourceRoot,
      port: options.port,
      agentAssetsProvider: dependencies.agentAssets,
      timeoutMs: options.timeoutMs,
    })
    selectedPath = inferred.path.id ?? undefined
    if (!selectedPath) {
      selectedPath = await select({
        message: 'Choose an AOPS setup path:',
        choices: SETUP_PATHS.map((entry) => ({
          name: `${entry.number}. ${entry.title}`,
          value: entry.id,
        })),
        default: 'native-external',
      }) as SetupPathId
    }
  }

  let postgresTls = options.postgresTls
  if (selectedPath === 'native-external' && !postgresTls) postgresTls = 'require'
  let localPostgresHost = normalizeNonEmpty(options.localPostgresHost) ?? '127.0.0.1'
  let localPostgresPort = options.localPostgresPort ?? 5432
  let localPostgresAdminUser = normalizeNonEmpty(options.localPostgresAdminUser)
    ?? defaultLocalPostgresAdminUser()
  let localPostgresDatabase = normalizeNonEmpty(options.localPostgresDatabase)
    ?? defaultLocalPostgresDatabase(options.instance)
  let localPostgresAppUser = normalizeNonEmpty(options.localPostgresAppUser)
    ?? localPostgresDatabase
  if (selectedPath === 'native-local' && interactive) {
    localPostgresHost = await input({
      message: 'Local PostgreSQL host (loopback only):',
      default: localPostgresHost,
      validate: (value) => ['localhost', '127.0.0.1', '::1'].includes(value.trim().toLowerCase())
        || /^127(?:\.\d{1,3}){3}$/.test(value.trim())
        ? true
        : 'Use a loopback host such as 127.0.0.1 or localhost.',
    })
    localPostgresPort = Number(await input({
      message: 'Local PostgreSQL port:',
      default: String(localPostgresPort),
      validate: (value) => {
        const port = Number(value)
        return Number.isSafeInteger(port) && port >= 1 && port <= 65_535 ? true : 'Use a TCP port from 1 to 65535.'
      },
    }))
    localPostgresAdminUser = await input({
      message: 'PostgreSQL administrator role:',
      default: localPostgresAdminUser,
      validate: validateLocalPostgresIdentifier,
    })
    localPostgresDatabase = await input({
      message: 'New AOPS database name:',
      default: localPostgresDatabase,
      validate: validateLocalPostgresIdentifier,
    })
    localPostgresAppUser = await input({
      message: 'New AOPS application role:',
      default: localPostgresAppUser,
      validate: validateLocalPostgresIdentifier,
    })
  }
  let seedStarter = options.seed !== false
  if (selectedPath && !['native-external', 'native-local'].includes(selectedPath) && options.postgresConfig) {
    throw new Error('setup_init_postgres_config_only_valid_for_paths_1_or_3')
  }
  if (selectedPath && selectedPath !== 'native-external' && postgresTls) {
    throw new Error('setup_init_postgres_tls_only_valid_for_path_1')
  }
  const localPostgresOptionsUsed = Boolean(
    options.localPostgresHost !== undefined || options.localPostgresPort !== undefined ||
    options.localPostgresAdminUser !== undefined || options.localPostgresDatabase !== undefined ||
    options.localPostgresAppUser !== undefined || options.localPostgresAdminNoPassword !== undefined,
  )
  if (selectedPath && selectedPath !== 'native-local' && localPostgresOptionsUsed) {
    throw new Error('setup_init_local_postgres_options_only_valid_for_path_3')
  }
  if (selectedPath === 'cli-existing' && (options.noCatalog || options.catalogRelease || options.catalogIdempotencyKey)) {
    throw new Error('setup_init_catalog_options_only_valid_for_server_paths_1_2_or_3')
  }
  if (options.noCatalog && (options.catalogRelease || options.catalogIdempotencyKey)) {
    throw new Error('setup_init_catalog_mode_conflict:choose_default_catalog_or_--no-catalog')
  }

  let effectivePostgresConfig = options.postgresConfig
  let effectivePostgresTls = postgresTls
  const inspect = () => inspectReadiness({
    path: selectedPath,
    postgresConfig: effectivePostgresConfig,
    postgresTls: effectivePostgresTls,
    apiBaseUrl: options.apiBaseUrl,
    instance: options.instance,
    dataRoot: options.dataRoot,
    sourceRoot: options.sourceRoot,
    localPostgresHost,
    localPostgresPort,
    port: options.port,
    agentAssetsProvider: dependencies.agentAssets,
    timeoutMs: options.timeoutMs,
  })

  let initial = await inspect()
  const path3Env = initial.checks.find((check) => check.id === 'global-server-env')
  if (
    selectedPath === 'native-local' && interactive && !options.postgresConfig &&
    path3Env?.data?.blocking === true && typeof path3Env.data.path === 'string'
  ) {
    const instance = normalizeNonEmpty(options.instance)?.toLowerCase() ?? 'default'
    const suggested = path.join(path.dirname(path3Env.data.path), `aops.${instance}.local.server.env`)
    effectivePostgresConfig = await input({
      message: 'Private server env for this local PostgreSQL setup:',
      default: suggested,
      validate: (value) => path.isAbsolute(value.trim()) ? true : 'Use an absolute private env path.',
    })
    initial = await inspect()
  }
  const shouldApply = options.apply === true || (interactive && Boolean(selectedPath))

  if (!shouldApply) {
    if (options.json) {
      console.log(JSON.stringify({ command: 'setup.init', ...initial }, null, 2))
      return initial
    }
    if (!interactive || options.skipBanner || initial.status === 'ready') printSetupReadiness(initial)
    else logInfo('Setup was not changed. Re-run with `--apply` when using an explicit non-interactive path.')
    return initial
  }

  if (!selectedPath) throw new Error('setup_init_path_required_for_apply:choose_1_2_3_or_4')
  if (
    (requestedAgentAssetsAction === 'install' || requestedAgentAssetsAction === 'repair') &&
    !dependencies.agentAssets?.apply
  ) {
    throw new Error('setup_init_agent_assets_contract_unavailable_task_136')
  }
  if (selectedPath === 'native-external' && !postgresTls) {
    throw new Error('setup_init_postgres_tls_required_for_path_1')
  }
  let createPostgresSecret: (() => string) | undefined
  let serverEnvChanged = false
  if (selectedPath === 'native-container' && interactive) {
    const passwordMode = await select({
      message: 'Managed PostgreSQL password:',
      choices: [
        { name: 'Generate a strong password automatically (recommended)', value: 'generate' },
        { name: 'Enter a custom password securely', value: 'custom' },
      ],
      default: 'generate',
    })
    if (passwordMode === 'custom') {
      const customPassword = await password({
        message: 'PostgreSQL password:',
        validate: validateManagedPostgresPassword,
      })
      const confirmedPassword = await password({
        message: 'Confirm PostgreSQL password:',
        validate: (value) => value === customPassword ? true : 'Passwords do not match.',
      })
      if (confirmedPassword !== customPassword) throw new Error('setup_init_postgres_password_mismatch')
      createPostgresSecret = () => customPassword
    }
  }
  const localServerPath = selectedPath !== 'cli-existing'
  const localApiBaseUrl = options.apiBaseUrl ?? `http://127.0.0.1:${options.port ?? 5900}`
  let officialCatalogRelease: string | undefined
  let officialCatalogReleaseSource: string | undefined
  if (localServerPath && !options.noCatalog && dependencies.officialCatalog) {
    const selectedRelease = options.catalogRelease ?? options.agentAssetsRelease
    if (normalizeNonEmpty(selectedRelease)) {
      officialCatalogRelease = resolveOfficialCatalogReleasePath(selectedRelease)
      officialCatalogReleaseSource = options.catalogRelease ? 'explicit-catalog-release' : 'explicit-agent-assets-release'
    } else {
      const resolution = await dependencies.officialCatalog.resolveRelease({
        sourceRoot: options.sourceRoot,
        instance: options.instance,
        dataRoot: options.dataRoot,
      })
      officialCatalogRelease = resolveOfficialCatalogReleasePath(resolution.fromRelease)
      officialCatalogReleaseSource = resolution.source
    }
  } else if (localServerPath && (options.catalogRelease || options.catalogIdempotencyKey) && !dependencies.officialCatalog) {
    throw new Error('setup_init_official_catalog_contract_unavailable')
  }
  if (initial.checks.some((check) => check.data?.blocking === true)) {
    throw new Error('setup_init_install_state_requires_explicit_repair_or_reset')
  }

  const steps: Array<Record<string, unknown>> = []
  if (selectedPath === 'native-external') {
    const envCheck = initial.checks.find((check) => check.id === 'global-server-env')
    const envReady = envCheck?.state === 'ready'
    if (interactive) {
      if (!dependencies.setupServerEnv) {
        throw new Error('setup_init_external_postgres_env_provider_unavailable')
      }
      const serverEnv = await dependencies.setupServerEnv({
        root: options.sourceRoot,
        envPath: options.postgresConfig,
        skipBanner: true,
      })
      if (!serverEnv.ok || serverEnv.repoDialect !== 'pg') {
        throw new Error('setup_init_external_postgres_env_not_ready')
      }
      effectivePostgresConfig = serverEnv.envPath
      serverEnvChanged = serverEnv.updated === true
      steps.push({
        action: 'setup.server-env',
        status: serverEnv.updated ? 'updated' : 'ready',
        envPath: serverEnv.envPath,
      })
    } else if (!envReady) {
      throw new Error('setup_init_external_postgres_env_required:run_setup_server-env_first')
    } else if (!effectivePostgresConfig && typeof envCheck?.data?.path === 'string') {
      effectivePostgresConfig = envCheck.data.path
    }

    if (!effectivePostgresConfig || !effectivePostgresTls) {
      throw new Error('setup_init_external_postgres_probe_configuration_missing')
    }
    const probe = dependencies.probeExternalPostgres ?? probeExternalPostgresConnection
    const testConnection = () => progress(
      `Testing PostgreSQL connection with ${effectivePostgresTls} TLS...`,
      () => probe({
        configRef: effectivePostgresConfig!,
        tlsPolicy: effectivePostgresTls!,
        timeoutMs: options.timeoutMs,
      }),
    )
    let connection
    try {
      connection = await testConnection()
    } catch (error) {
      if (!interactive || options.postgresTls || !isExternalPostgresTlsProbeError(error)) throw error
      effectivePostgresTls = await select({
        message: 'PostgreSQL TLS connection failed. Choose how to retry:',
        choices: [
          {
            name: 'require',
            value: 'require',
            description: 'Keep encrypted transport without CA verification; fix PostgreSQL TLS support if this still fails.',
          },
          {
            name: 'verify-full',
            value: 'verify-full',
            description: 'Use certificate and hostname verification with a trusted CA certificate.',
          },
          {
            name: 'disable',
            value: 'disable',
            description: 'Retry without encryption only when you explicitly accept an unencrypted connection.',
          },
        ],
        default: 'require',
      }) as SetupInitOptions['postgresTls']
      connection = await testConnection()
    }
    steps.push({ action: 'setup.postgres-connection', ...connection })
    if (interactive) {
      logSuccess(`PostgreSQL connection verified (${connection.transport}, server ${connection.serverMajor}).`)
    }
  }

  if (selectedPath === 'native-local') {
    const localCheck = initial.checks.find((check) => check.id === 'local-postgresql')
    if (localCheck?.state !== 'ready') {
      throw new Error('setup_init_local_postgres_not_ready:inspect_readiness_next_actions')
    }
    const envCheck = initial.checks.find((check) => check.id === 'global-server-env')
    if (envCheck?.state === 'ready') {
      effectivePostgresConfig = String(envCheck.data?.path ?? '') || undefined
      effectivePostgresTls = 'disable'
      steps.push({
        action: 'setup.local-postgres',
        status: 'already-configured',
        host: localPostgresHost,
        port: localPostgresPort,
        envPath: effectivePostgresConfig,
      })
    } else {
      let adminPassword = process.env.AOPS_LOCAL_POSTGRES_ADMIN_PASSWORD ?? ''
      const passwordValidation = validateLocalPostgresAdminPassword(adminPassword)
      if (passwordValidation !== true) throw new Error('setup_init_local_postgres_admin_password_invalid')
      if (interactive) {
        adminPassword = await password({
          message: 'Existing PostgreSQL administrator password (leave blank only for local trust auth):',
          validate: validateLocalPostgresAdminPassword,
        })
      } else if (!adminPassword && options.localPostgresAdminNoPassword !== true) {
        throw new Error('setup_init_local_postgres_admin_password_required:use_private_environment_or_--local-postgres-admin-no-password')
      }
      const provision = dependencies.provisionLocalPostgres ?? provisionLocalPostgres
      let provisioned: Awaited<ReturnType<typeof provisionLocalPostgres>>
      try {
        provisioned = await progress('Creating the local AOPS PostgreSQL role and database...', () => provision({
          host: localPostgresHost,
          port: localPostgresPort,
          adminUser: localPostgresAdminUser,
          adminPassword,
          database: localPostgresDatabase,
          appUser: localPostgresAppUser,
          connectTimeoutMs: options.timeoutMs,
        }))
      } finally {
        adminPassword = ''
        delete process.env.AOPS_LOCAL_POSTGRES_ADMIN_PASSWORD
      }
      const { connectionUrl, ...safeProvisioned } = provisioned
      if (!dependencies.setupServerEnv) {
        throw new Error('setup_init_local_postgres_env_provider_unavailable')
      }
      const serverEnv = await dependencies.setupServerEnv({
        root: options.sourceRoot,
        envPath: effectivePostgresConfig,
        repoUrl: connectionUrl,
        yes: true,
        skipBanner: true,
      })
      if (!serverEnv.ok || serverEnv.repoDialect !== 'pg') {
        throw new Error('setup_init_local_postgres_env_not_ready')
      }
      effectivePostgresConfig = serverEnv.envPath
      effectivePostgresTls = 'disable'
      serverEnvChanged = serverEnv.updated === true
      steps.push({
        action: 'setup.local-postgres',
        ...safeProvisioned,
        envPath: serverEnv.envPath,
      })
    }
  }

  if (selectedPath === 'native-external' || selectedPath === 'native-container' || selectedPath === 'native-local') {
    const installationReady = initial.checks.find((check) => check.id === 'installation-state')?.state === 'ready'
    const hostReady = initial.checks.find((check) => check.id === 'host')?.state === 'ready'
    let reuseRunningServer = false
    if (installationReady && hostReady && !serverEnvChanged) {
      try {
        const installedPlan = await progress(
          'Checking the running AOPS server database migrations...',
          () => (dependencies.planInstalledMigration ?? planCommunityNativeInstalledMigration)({
            instanceName: options.instance,
            dataRoot: options.dataRoot,
          }),
        )
        if (installedPlan.planning.migrationPlan.action === 'verify-only') {
          reuseRunningServer = true
          steps.push({
            action: 'community-server.setup',
            status: 'already-running-current',
            migrationAction: 'verify-only',
            acceptedPlanSha256: installedPlan.planning.acceptedPlanSha256,
          })
          if (interactive) logSuccess('Running AOPS server database schema is already current.')
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        if (!/^community_native_(source|build)_drift/.test(reason)) throw error
      }
    }
    if (!reuseRunningServer && installationReady && hostReady) {
      await progress('Stopping the local AOPS server for setup changes...', () =>
        (dependencies.stopInstalledServer ?? stopCommunityNativeInstall)({
          instanceName: options.instance,
          dataRoot: options.dataRoot,
          timeoutMs: options.timeoutMs,
        }))
      steps.push({ action: 'community-server.stop-for-setup', status: 'applied' })
    }
    if (!reuseRunningServer) {
      let lifecycleResult: unknown
      const reportedStages = new Set<string>()
      await progress('Preparing PostgreSQL, verifying migrations, and starting AOPS server...', () => setupCommunityServer({
        runtime: 'native',
        postgres: selectedPath === 'native-external' || selectedPath === 'native-local'
          ? 'external'
          : selectedPath === 'native-container'
            ? 'container'
            : undefined,
        postgresConfig: selectedPath === 'native-external' || selectedPath === 'native-local'
          ? effectivePostgresConfig
          : undefined,
        postgresTls: selectedPath === 'native-external' || selectedPath === 'native-local'
          ? effectivePostgresTls
          : undefined,
        instance: options.instance,
        dataRoot: options.dataRoot,
        sourceRoot: options.sourceRoot,
        port: options.port,
        detach: true,
        createPostgresSecret: selectedPath === 'native-container' ? createPostgresSecret : undefined,
        apply: true,
        silent: true,
        progressSink: interactive
          ? (event) => {
              if (reportedStages.has(event.stage)) return
              reportedStages.add(event.stage)
              logInfo(`  ${event.message}`)
            }
          : undefined,
        resultSink: (result) => { lifecycleResult = result },
      }))
      steps.push({ action: 'community-server.setup', status: 'applied', result: lifecycleResult ?? null })
      if (interactive) printMigrationVerification(lifecycleResult)
    }
  } else {
    const targetName = normalizeNonEmpty(options.targetName)
    const apiBaseUrl = normalizeNonEmpty(options.apiBaseUrl)
    const targetReady = initial.checks.find((check) => check.id === 'target-login')?.state === 'ready'
    if (!targetReady && apiBaseUrl && targetName) {
      let targetResult: unknown
      await addTarget({
        name: targetName,
        apiBaseUrl,
        authProvider: options.targetAuthProvider,
        tlsPolicy: options.targetTlsPolicy,
        use: true,
        apply: true,
        quiet: options.json === true,
        resultSink: (result) => { targetResult = result },
      })
      steps.push({ action: 'target.add', status: 'applied', result: targetResult ?? null })
    } else if (!targetReady) {
      throw new Error('setup_init_existing_server_target_required:provide_--target-name_and_--api-base-url')
    }
  }

  if (localServerPath && options.noCatalog) {
    steps.push({
      action: 'setup.catalog.skip',
      status: 'skipped',
      reason: '--no-catalog',
      coreClientAssetsAffected: false,
      existingCatalogRowsDeleted: false,
    })
  } else if (localServerPath && dependencies.officialCatalog && officialCatalogRelease) {
    const catalog = await progress('Installing the official AOPS catalog...', () => dependencies.officialCatalog!.reconcile({
      fromRelease: officialCatalogRelease,
      apiBaseUrl: localApiBaseUrl,
      timeoutMs: options.timeoutMs,
      idempotencyKey: options.catalogIdempotencyKey,
    }))
    steps.push({
      action: 'setup.catalog.reconcile',
      status: catalog.mutation,
      scopeSlug: catalog.scopeSlug,
      releaseSetSha256: catalog.releaseSetSha256,
      receiptId: catalog.receiptId ?? null,
      releaseSource: officialCatalogReleaseSource,
      historyDeleteCount: catalog.historyDeleteCount,
      activationEffects: catalog.activationEffects,
    })
  }

  let result = await progress('Checking AOPS server health and setup readiness...', inspect)
  const agentAssetsCheck = result.checks.find((check) => check.id === 'agent-assets')
  let agentAssetsAction = requestedAgentAssetsAction
  if (agentAssetsCheck?.state === 'ready') {
    steps.push({ action: 'assets.status', status: 'ready', target: 'all' })
    agentAssetsAction = 'skip'
  } else if (!agentAssetsAction && dependencies.agentAssets?.apply) {
    const recommendedAction = agentAssetsCheck?.data?.recommendedAction === 'repair' ? 'repair' : 'install'
    if (interactive) {
      logInfo(`Codex gateway: ${SETUP_AGENT_ASSETS_GATEWAYS.codex}`)
      logInfo(`Claude gateway: ${SETUP_AGENT_ASSETS_GATEWAYS.claude}`)
      logInfo(`Setup will ${recommendedAction} the verified AOPS core and gateway for every registered runtime.`)
      logInfo('Rich mounted-domain guides and discipline references will be available; setup will not select a working discipline for you.')
    }
    agentAssetsAction = recommendedAction
  }

  if (agentAssetsAction === 'install' || agentAssetsAction === 'repair') {
    if (!dependencies.agentAssets?.apply) {
      throw new Error('setup_init_agent_assets_contract_unavailable_task_136')
    }
    let fromRelease = options.agentAssetsRelease ?? officialCatalogRelease
    if (agentAssetsAction === 'install' && !normalizeNonEmpty(fromRelease) && dependencies.agentAssets.resolveRelease) {
      const resolution = await dependencies.agentAssets.resolveRelease({
        sourceRoot: options.sourceRoot,
        instance: options.instance,
        dataRoot: options.dataRoot,
      })
      fromRelease = resolution.fromRelease
    }
    const appliedAssets = await progress('Installing global AOPS agent gateways...', () => applySetupAgentAssets(dependencies.agentAssets!, {
      action: agentAssetsAction,
      fromRelease: agentAssetsAction === 'install'
        ? resolveAgentAssetsReleasePath(fromRelease)
        : undefined,
    }))
    steps.push({ action: `assets.${agentAssetsAction}`, status: appliedAssets.state, target: 'all' })
    result = await inspect()
  }

  if (selectedPath === 'native-external' || selectedPath === 'native-container' || selectedPath === 'native-local') {
    if (seedStarter) {
      const seed = await progress('Creating the AOPS starter project and user guide...', () => (dependencies.seedStarter ?? seedCommunityStarterData)({
        instanceName: normalizeNonEmpty(options.instance)?.toLowerCase() ?? 'default',
        dataRoot: options.dataRoot,
        origin: localApiBaseUrl,
        apply: true,
        timeoutMs: options.timeoutMs,
      }))
      steps.push({ action: 'setup.starter-seed', status: seed.status ?? 'applied', result: seed })
    } else {
      steps.push({ action: 'setup.starter-seed', status: 'skipped', reason: '--no-seed' })
    }
  }

  const firstAdminRequired = result.checks.find((check) => check.id === 'first-admin')?.state === 'action-required'
  if (interactive && firstAdminRequired && dependencies.setupFirstAdmin) {
    if (await confirm({ message: 'Create or promote the first admin now?', default: true })) {
      const firstAdmin = await dependencies.setupFirstAdmin({ apiBaseUrl: localApiBaseUrl })
      steps.push({ action: 'setup.first-admin', status: firstAdmin.action, ok: firstAdmin.ok })
      result = await inspect()
    }
  }
  if (interactive && result.checks.find((check) => check.id === 'target-login')?.state === 'action-required') {
    if (await confirm({ message: 'Login to the selected target now?', default: true })) {
      await authLogin({ apiBaseUrl: options.apiBaseUrl, target: options.targetName })
      steps.push({ action: 'auth.login', status: process.exitCode === 1 ? 'failed' : 'applied' })
      result = await inspect()
    }
  }

  if (options.json) {
    console.log(JSON.stringify({
      command: 'setup.init',
      mutationFree: false,
      applied: { path: selectedPath, mode: options.resume === true ? 'resume' : 'apply', steps },
      readiness: result,
    }, null, 2))
    return result
  }
  printSetupReadiness(result)
  return result
}
