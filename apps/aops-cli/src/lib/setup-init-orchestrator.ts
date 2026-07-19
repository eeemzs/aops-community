import path from 'node:path'

import { banner, logInfo, logSuccess, logWarn } from '@aopslab/xf-cli-ui'

import { runAuthLogin } from '../commands/auth/login.js'
import { runCommunityServerSetup } from '../commands/community-server.js'
import { runTargetAdd } from '../commands/target.js'
import { promptConfirm, promptInput, promptSelect } from '../utils/prompts.js'
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

export type SetupInitOptions = {
  path?: string
  postgresConfig?: string
  postgresTls?: 'disable' | 'require' | 'verify-full'
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
    skipBanner?: boolean
  }>) => Promise<SetupServerEnvResult>
  setupCommunityServer?: typeof runCommunityServerSetup
  addTarget?: typeof runTargetAdd
  setupFirstAdmin?: (options: Readonly<{ apiBaseUrl?: string }>) => Promise<SetupFirstAdminResult>
  authLogin?: typeof runAuthLogin
  confirm?: typeof promptConfirm
  select?: typeof promptSelect
  input?: typeof promptInput
  agentAssets?: SetupAgentAssetsProvider
  officialCatalog?: SetupOfficialCatalogProviderV1
}>

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized || undefined
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
  const select = dependencies.select ?? promptSelect
  const input = dependencies.input ?? promptInput
  const interactive = !options.yes && !options.json
  const requestedAgentAssetsAction = normalizeAgentAssetsAction(options.agentAssets)
  const requestedPath = normalizeNonEmpty(options.path)
  if (requestedPath && !parseSetupPath(requestedPath)) {
    throw new Error('setup_init_path_invalid:choose_1_2_3_or_4')
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
        default: 'oci-ready',
      }) as SetupPathId
    }
  }

  let postgresTls = options.postgresTls
  if (selectedPath === 'native-external' && !postgresTls && interactive) {
    postgresTls = await select({
      message: 'External PostgreSQL TLS policy:',
      choices: [
        { name: 'verify-full (certificate and hostname verification)', value: 'verify-full' },
        { name: 'require (encrypted transport without CA verification)', value: 'require' },
        { name: 'disable (loopback PostgreSQL only)', value: 'disable' },
      ],
      default: 'verify-full',
    }) as SetupInitOptions['postgresTls']
  }
  if (selectedPath && selectedPath !== 'native-external' && (options.postgresConfig || postgresTls)) {
    throw new Error('setup_init_external_postgres_options_only_valid_for_path_1')
  }
  if (selectedPath === 'cli-existing' && (options.noCatalog || options.catalogRelease || options.catalogIdempotencyKey)) {
    throw new Error('setup_init_catalog_options_only_valid_for_server_paths_1_2_or_3')
  }
  if (options.noCatalog && (options.catalogRelease || options.catalogIdempotencyKey)) {
    throw new Error('setup_init_catalog_mode_conflict:choose_default_catalog_or_--no-catalog')
  }

  const inspect = () => inspectReadiness({
    path: selectedPath,
    postgresConfig: options.postgresConfig,
    postgresTls,
    apiBaseUrl: options.apiBaseUrl,
    instance: options.instance,
    dataRoot: options.dataRoot,
    sourceRoot: options.sourceRoot,
    port: options.port,
    agentAssetsProvider: dependencies.agentAssets,
    timeoutMs: options.timeoutMs,
  })

  const initial = await inspect()
  if (interactive && !options.skipBanner) banner('AOPS Setup')

  let shouldApply = options.apply === true
  if (!shouldApply && interactive && selectedPath && initial.status === 'action-required') {
    printSetupReadiness(initial)
    shouldApply = await confirm({ message: 'Continue the selected setup path now?', default: true })
  }

  if (!shouldApply) {
    if (options.json) {
      console.log(JSON.stringify({ command: 'setup.init', ...initial }, null, 2))
      return initial
    }
    if (!interactive || options.skipBanner || initial.status === 'ready') printSetupReadiness(initial)
    else logInfo('Setup was not changed. Re-run with `--apply` or choose Continue setup later.')
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
  const localServerPath = selectedPath !== 'cli-existing'
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
  if (initial.checks.some((check) =>
    check.id === 'installation-state' && check.data?.blocking === true,
  )) {
    throw new Error('setup_init_install_state_requires_explicit_repair_or_reset')
  }

  const steps: Array<Record<string, unknown>> = []
  if (selectedPath === 'native-external') {
    const envReady = initial.checks.find((check) => check.id === 'global-server-env')?.state === 'ready'
    if (!envReady) {
      if (!interactive) {
        throw new Error('setup_init_external_postgres_env_required:run_setup_server-env_first')
      }
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
      steps.push({ action: 'setup.server-env', status: 'ready', envPath: serverEnv.envPath })
    }
  }

  if (selectedPath === 'native-external' || selectedPath === 'native-container' || selectedPath === 'oci-ready') {
    let lifecycleResult: unknown
    await setupCommunityServer({
      runtime: selectedPath === 'oci-ready' ? 'oci' : 'native',
      postgres: selectedPath === 'native-external'
        ? 'external'
        : selectedPath === 'native-container'
          ? 'container'
          : undefined,
      postgresConfig: selectedPath === 'native-external' ? options.postgresConfig : undefined,
      postgresTls: selectedPath === 'native-external' ? postgresTls : undefined,
      instance: options.instance,
      dataRoot: options.dataRoot,
      sourceRoot: selectedPath === 'oci-ready' ? undefined : options.sourceRoot,
      port: options.port,
      detach: selectedPath === 'oci-ready' ? undefined : true,
      apply: true,
      silent: options.json === true,
      resultSink: (result) => { lifecycleResult = result },
    })
    steps.push({ action: 'community-server.setup', status: 'applied', result: lifecycleResult ?? null })
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
    const catalog = await dependencies.officialCatalog.reconcile({
      fromRelease: officialCatalogRelease,
      apiBaseUrl: options.apiBaseUrl,
      timeoutMs: options.timeoutMs,
      idempotencyKey: options.catalogIdempotencyKey,
    })
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

  let result = await inspect()
  const agentAssetsCheck = result.checks.find((check) => check.id === 'agent-assets')
  let agentAssetsAction = requestedAgentAssetsAction
  if (agentAssetsCheck?.state === 'ready') {
    steps.push({ action: 'assets.status', status: 'ready', target: 'both' })
    agentAssetsAction = 'skip'
  } else if (!agentAssetsAction && interactive && dependencies.agentAssets?.apply) {
    logInfo(`Codex gateway: ${SETUP_AGENT_ASSETS_GATEWAYS.codex}`)
    logInfo(`Claude gateway: ${SETUP_AGENT_ASSETS_GATEWAYS.claude}`)
    logInfo('Only the global AOPS gateway pointers are managed; hosted assets remain versioned in the AOPS store.')
    const recommendedAction = agentAssetsCheck?.data?.recommendedAction === 'repair' ? 'repair' : 'install'
    agentAssetsAction = await select({
      message: 'Global AOPS agent gateway action:',
      choices: [
        { name: recommendedAction === 'repair' ? 'Repair gateway bindings (recommended)' : 'Install gateways (recommended)', value: recommendedAction },
        { name: 'Inspect status only', value: 'status' },
        { name: 'Skip for now', value: 'skip' },
      ],
      default: recommendedAction,
    }) as SetupInitOptions['agentAssets']
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
    if (agentAssetsAction === 'install' && !normalizeNonEmpty(fromRelease) && interactive) {
      fromRelease = await input({
        message: 'Verified AOPS agent-assets release directory:',
        validate: (value) => value.trim().length > 0 ? true : 'A release directory is required.',
      })
    }
    const confirmed = !interactive || await confirm({
      message: `${agentAssetsAction === 'install' ? 'Install' : 'Repair'} the Codex and Claude AOPS gateway pointers now?`,
      default: true,
    })
    if (confirmed) {
      const appliedAssets = await applySetupAgentAssets(dependencies.agentAssets, {
        action: agentAssetsAction,
        fromRelease: agentAssetsAction === 'install'
          ? resolveAgentAssetsReleasePath(fromRelease)
          : undefined,
      })
      steps.push({ action: `assets.${agentAssetsAction}`, status: appliedAssets.state, target: 'both' })
      result = await inspect()
    } else {
      steps.push({ action: `assets.${agentAssetsAction}`, status: 'cancelled', target: 'both' })
    }
  }

  const firstAdminRequired = result.checks.find((check) => check.id === 'first-admin')?.state === 'action-required'
  if (interactive && firstAdminRequired && dependencies.setupFirstAdmin) {
    if (await confirm({ message: 'Create or promote the first admin now?', default: true })) {
      const firstAdmin = await dependencies.setupFirstAdmin({ apiBaseUrl: options.apiBaseUrl })
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
