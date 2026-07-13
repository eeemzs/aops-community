import {
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  type Stats,
} from 'node:fs'
import path from 'node:path'
import { Command } from 'commander'

import {
  abandonInterruptedCommunityRecovery,
  assertCommunityLedgerHasNoNonterminalOperation,
  assertNoCommunityRecoveryCommitJournal,
  assertCommunityRecoveryMutationFence,
  buildCommunityComposeInvocation,
  inspectCommunityInstall,
  readCommunityBackupReceipt,
  reconcileCommunityRecoveryCommit,
  recoverCommunityUpdate,
  resolveCommunityInstallPaths,
  restoreCommunitySourceRuntime,
  restoreCommunityBackup,
  rollbackCommunityInstall,
  setupCommunityInstall,
  stageCommunityRelease,
  updateCommunityInstall,
  verifyStagedCommunityRelease,
  verifyCommunityBackupRecord,
  writeCommunityBackupReceipt,
  type CommunityInstallPaths,
  type CommunityInstallState,
  type CommunityLifecycleAdapter,
} from '../lib/community-lifecycle.js'
import { communityProcessRuntime, createCommunityDockerAdapter } from '../lib/community-docker-adapter.js'
import {
  communityCommandAbortRuntime,
  throwIfCommunityCommandAborted,
  withCommunityCommandAbortScope,
  type CommunityCommandAbortRuntime,
} from '../lib/community-command-abort.js'
import { resolveCommunityInstanceLayout } from '../lib/community-instance-layout.js'
import {
  assertCommunityOperationJournalFence,
  captureCommunityOperationDigests,
  createCommunityOperationJournal,
  digestsEqual,
  finishCommunityOperationJournal,
  inspectCommunityOperationJournalFile,
  openCommunityOperationJournalForReconciliation,
  runCommunityJournaledPromotion,
  runCommunityJournaledSideEffect,
  type CommunityOperationJournalHandle,
  type CommunityOperationReconciliationAction,
} from '../lib/community-operation-journal.js'
import {
  COMMUNITY_OPERATION_LOCK_DIRECTORY_NAME,
  inspectCommunityOperationLock,
  recoverStaleCommunityOperationLock,
  withCommunityOperationLock,
  type CommunityOperation,
  type CommunityOperationLockReceipt,
} from '../lib/community-operation-lock.js'
import {
  assertCommunityRepoCandidateCurrent,
  resolveCommunityRepo,
} from '../lib/community-repo-discovery.js'
import { verifyCommunityReleaseBundle } from '../lib/community-release-verifier.js'
import { inspectCommunityDoctor } from './community-doctor.js'

export type CommunityServerOptions = {
  instance?: string
  dataRoot?: string
  repo?: string
  port?: string | number
  certificateIdentity?: string
  certificateOidcIssuer?: string
  tail?: string | number
  backup?: string
  updateId?: string
  retryRecoveryId?: string
  recoveryId?: string
  operationId?: string
  expectedOperation?: CommunityOperation
  reconciliationAction?: string
  confirmRecoveryReconciliation?: boolean
  confirmOperationReconciliation?: boolean
  expectedLockPid?: string | number
  expectedLockOperation?: CommunityOperation
  expectedLockStartedAt?: string
  expectedLockOwnerSha256?: string
  expectedProcessStartIdentity?: string
  confirmStaleLockRecovery?: boolean
  confirmDataRewind?: boolean
  confirmDataLoss?: boolean
  confirmInstance?: string
  json?: boolean
}

export type CommunityServerDependencies = Readonly<{
  verifyReleaseBundle?: typeof verifyCommunityReleaseBundle
  inspectDoctor?: typeof inspectCommunityDoctor
  createAdapter?: typeof createCommunityDockerAdapter
  processRuntime?: typeof communityProcessRuntime
  withOperationLock?: typeof withCommunityOperationLock
  inspectOperationLock?: typeof inspectCommunityOperationLock
  recoverStaleOperationLock?: typeof recoverStaleCommunityOperationLock
  ensureInstanceDirectory?: (instanceRoot: string) => void
  commandAbortRuntime?: CommunityCommandAbortRuntime
  cliVersion?: string
}>

type ResolvedCommunityServerDependencies = Required<CommunityServerDependencies>

const DEFAULT_COMMUNITY_CLI_VERSION = '0.0.1'

function isErrno(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === code
}

function isSamePhysicalPath(left: string, right: string): boolean {
  return path.relative(left, right) === '' && path.relative(right, left) === ''
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function tryLstat(candidate: string): Stats | undefined {
  try {
    return lstatSync(candidate)
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return undefined
    throw error
  }
}

function assertInstanceDirectory(instanceRoot: string): string {
  const resolved = path.resolve(instanceRoot)
  const stat = tryLstat(resolved)
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('community_instance_root_unsafe')
  }
  const canonical = realpathSync.native(resolved)
  if (!isSamePhysicalPath(resolved, canonical)) {
    throw new Error('community_instance_root_alias_refused')
  }
  return canonical
}

function ensureInstanceDirectory(instanceRoot: string): void {
  const resolvedTarget = path.resolve(instanceRoot)
  const missingSegments: string[] = []
  let existingAncestor = resolvedTarget
  let stat = tryLstat(existingAncestor)
  while (!stat) {
    const parent = path.dirname(existingAncestor)
    if (isSamePhysicalPath(parent, existingAncestor)) {
      throw new Error('community_instance_ancestor_missing')
    }
    missingSegments.unshift(path.basename(existingAncestor))
    existingAncestor = parent
    stat = tryLstat(existingAncestor)
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('community_instance_ancestor_unsafe')
  }
  let canonicalParent = realpathSync.native(existingAncestor)
  if (!isSamePhysicalPath(existingAncestor, canonicalParent)) {
    throw new Error('community_instance_ancestor_alias_refused')
  }
  for (const segment of missingSegments) {
    const child = path.join(canonicalParent, segment)
    if (!isSamePhysicalPath(path.dirname(child), canonicalParent)) {
      throw new Error('community_instance_path_segment_escape')
    }
    try {
      mkdirSync(child, { mode: 0o700 })
    } catch (error) {
      if (!isErrno(error, 'EEXIST')) throw error
    }
    const childStat = tryLstat(child)
    if (!childStat || childStat.isSymbolicLink() || !childStat.isDirectory()) {
      throw new Error('community_instance_path_segment_unsafe')
    }
    const canonicalChild = realpathSync.native(child)
    if (!isSamePhysicalPath(child, canonicalChild) ||
        !isSamePhysicalPath(path.dirname(canonicalChild), canonicalParent)) {
      throw new Error('community_instance_path_segment_alias_refused')
    }
    canonicalParent = canonicalChild
  }
  if (!isSamePhysicalPath(canonicalParent, resolvedTarget)) {
    throw new Error('community_instance_root_alias_refused')
  }
  assertInstanceDirectory(resolvedTarget)
}

type OwnedPathMode = 'allow-missing' | 'create-missing' | 'require-existing'

function assertOwnedInstancePaths(paths: CommunityInstallPaths, mode: OwnedPathMode): void {
  const instanceRoot = assertInstanceDirectory(paths.instanceRoot)
  const ownedPaths = [
    ['runtime', paths.runtimeRoot],
    ['releases', paths.releaseCacheRoot],
    ['backups', paths.backupRoot],
  ] as const
  for (const [name, candidate] of ownedPaths) {
    const resolved = path.resolve(candidate)
    if (!isSamePhysicalPath(path.dirname(resolved), instanceRoot) || !isWithin(instanceRoot, resolved)) {
      throw new Error(`community_instance_owned_path_escape:${name}`)
    }
    let stat = tryLstat(resolved)
    if (!stat && mode === 'create-missing') {
      try {
        mkdirSync(resolved, { mode: 0o700 })
      } catch (error) {
        if (!isErrno(error, 'EEXIST')) throw error
      }
      stat = tryLstat(resolved)
    }
    if (!stat) {
      if (mode === 'require-existing') {
        throw new Error(`community_instance_owned_path_missing:${name}`)
      }
      continue
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`community_instance_owned_path_unsafe:${name}`)
    }
    const canonical = realpathSync.native(resolved)
    if (!isSamePhysicalPath(resolved, canonical) || !isWithin(instanceRoot, canonical)) {
      throw new Error(`community_instance_owned_path_unsafe:${name}`)
    }
  }
}

function removeInstanceContentsExceptLock(instanceRoot: string): void {
  const canonicalRoot = assertInstanceDirectory(instanceRoot)
  for (const entry of readdirSync(canonicalRoot, { withFileTypes: true })) {
    if (entry.name === COMMUNITY_OPERATION_LOCK_DIRECTORY_NAME) continue
    const target = path.join(canonicalRoot, entry.name)
    if (path.dirname(target) !== canonicalRoot || !isWithin(canonicalRoot, target)) {
      throw new Error('community_reset_entry_escape')
    }
    const stat = lstatSync(target)
    rmSync(target, { recursive: stat.isDirectory() && !stat.isSymbolicLink(), force: true })
  }
}

function resolveDependencies(
  dependencies: CommunityServerDependencies = {},
): ResolvedCommunityServerDependencies {
  return {
    verifyReleaseBundle: dependencies.verifyReleaseBundle ?? verifyCommunityReleaseBundle,
    inspectDoctor: dependencies.inspectDoctor ?? inspectCommunityDoctor,
    createAdapter: dependencies.createAdapter ?? createCommunityDockerAdapter,
    processRuntime: dependencies.processRuntime ?? communityProcessRuntime,
    withOperationLock: dependencies.withOperationLock ?? withCommunityOperationLock,
    inspectOperationLock: dependencies.inspectOperationLock ?? inspectCommunityOperationLock,
    recoverStaleOperationLock: dependencies.recoverStaleOperationLock ?? recoverStaleCommunityOperationLock,
    ensureInstanceDirectory: dependencies.ensureInstanceDirectory ?? ensureInstanceDirectory,
    commandAbortRuntime: dependencies.commandAbortRuntime ?? communityCommandAbortRuntime,
    cliVersion: dependencies.cliVersion ?? DEFAULT_COMMUNITY_CLI_VERSION,
  }
}

function installSelection(options: CommunityServerOptions): { instanceName?: string; dataRoot?: string } {
  if (options.dataRoot) return { instanceName: options.instance, dataRoot: options.dataRoot }
  const layout = resolveCommunityInstanceLayout({ instanceId: options.instance })
  return { instanceName: layout.instanceId, dataRoot: layout.dataRoot }
}

function pathsFrom(options: CommunityServerOptions) {
  return resolveCommunityInstallPaths(installSelection(options))
}

function inspectFrom(options: CommunityServerOptions) {
  return inspectCommunityInstall(installSelection(options))
}

function writeResult(result: unknown, json = false): void {
  if (json) console.log(JSON.stringify(result, null, 2))
  else if (typeof result === 'string') process.stdout.write(result.endsWith('\n') ? result : `${result}\n`)
  else console.log(JSON.stringify(result, null, 2))
}

async function releaseBundle(
  options: CommunityServerOptions,
  dependencies: ResolvedCommunityServerDependencies,
) {
  const candidate = resolveCommunityRepo({ repo: options.repo })
  const verified = await dependencies.verifyReleaseBundle({
    releaseRoot: candidate.releaseDir,
    certificateIdentity: options.certificateIdentity,
    certificateOidcIssuer: options.certificateOidcIssuer,
  })
  assertCommunityRepoCandidateCurrent(candidate)
  if (verified.identity.releaseVersion !== candidate.releaseIdentity.releaseVersion) {
    throw new Error('community_repo_verified_release_identity_mismatch')
  }
  if (verified.identity.releaseVersion !== dependencies.cliVersion) {
    throw new Error(
      `community_cli_release_version_mismatch:cli=${dependencies.cliVersion}:release=${verified.identity.releaseVersion}`,
    )
  }
  return { candidate, verified }
}

function adapter(
  dependencies: ResolvedCommunityServerDependencies = resolveDependencies(),
  signal?: AbortSignal,
) {
  return dependencies.createAdapter({
    verifyRelease: async (release) => verifyStagedCommunityRelease(release),
    signal,
  })
}

type CommunityJournaledCommandContext = Readonly<{
  signal: AbortSignal
  journal: CommunityOperationJournalHandle
  receipt: CommunityOperationLockReceipt
  lifecycle: CommunityLifecycleAdapter
}>

async function withMutatingCommandScope<T>(
  dependencies: CommunityServerDependencies,
  callback: (runtime: ResolvedCommunityServerDependencies, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const runtime = resolveDependencies(dependencies)
  return withCommunityCommandAbortScope(runtime.commandAbortRuntime, async (signal) => {
    throwIfCommunityCommandAborted(signal)
    const result = await callback(runtime, signal)
    throwIfCommunityCommandAborted(signal)
    return result
  })
}

function createJournaledAdapter(
  base: CommunityLifecycleAdapter,
  journal: CommunityOperationJournalHandle,
  signal: AbortSignal,
): CommunityLifecycleAdapter {
  let step = 0
  const effect = <T>(name: string, callback: () => Promise<T>) => runCommunityJournaledSideEffect({
    handle: journal,
    step: `${name}-${++step}`,
    signal,
    effect: callback,
  })
  return {
    verifyRelease: (release) => effect('verify-release', () => base.verifyRelease(release)),
    createBackup: (params) => effect('create-backup', () => base.createBackup(params)),
    stop: (params) => effect('stop-runtime', () => base.stop(params)),
    pull: (params) => effect('pull-release', () => base.pull(params)),
    start: (params) => effect('start-runtime', () => base.start(params)),
    health: (params) => effect('health-check', () => base.health(params)),
    dataSmoke: (params) => effect('data-smoke', () => base.dataSmoke(params)),
    claimFreshPostgresVolume: (params) => effect('claim-volume', () => base.claimFreshPostgresVolume(params)),
    restoreBackup: (params) => effect('restore-backup', () => base.restoreBackup(params)),
  }
}

async function runWithOperationJournal<T>(params: {
  paths: CommunityInstallPaths
  state: CommunityInstallState | null
  operation: CommunityOperation
  receipt: CommunityOperationLockReceipt
  signal: AbortSignal
  runtime: ResolvedCommunityServerDependencies
  callback: (context: CommunityJournaledCommandContext) => Promise<T>
}): Promise<T> {
  const journal = createCommunityOperationJournal({
    paths: params.paths,
    operation: params.operation,
    receipt: params.receipt,
    sourceState: params.state,
  })
  let lifecycle: CommunityLifecycleAdapter | undefined
  const context: CommunityJournaledCommandContext = {
    signal: params.signal,
    journal,
    receipt: params.receipt,
    get lifecycle() {
      lifecycle ??= createJournaledAdapter(adapter(params.runtime, params.signal), journal, params.signal)
      return lifecycle
    },
  }
  try {
    throwIfCommunityCommandAborted(params.signal)
    const result = await params.callback(context)
    throwIfCommunityCommandAborted(params.signal)
    finishCommunityOperationJournal(journal, params.paths, 'succeeded')
    return result
  } catch (error) {
    if (journal.record().status === 'running') {
      finishCommunityOperationJournal(journal, params.paths, params.signal.aborted ? 'aborted' : 'failed')
    }
    if (params.signal.aborted) throw new Error('community_operation_aborted')
    throw error
  } finally {
    journal.close()
  }
}

function requireInstalled(options: CommunityServerOptions) {
  const inspection = inspectFrom(options)
  if (inspection.status === 'not-installed') throw new Error('community_not_installed:run_aops-cli_server_setup')
  if (inspection.status === 'partial') throw new Error(`community_install_partial:${inspection.error ?? 'unknown'}:run_aops-cli_doctor`)
  return { paths: inspection.paths, state: inspection.state! }
}

function assertSameInstancePaths(expected: CommunityInstallPaths, observed: CommunityInstallPaths): void {
  if (!isSamePhysicalPath(path.resolve(expected.instanceRoot), path.resolve(observed.instanceRoot))) {
    throw new Error('community_instance_path_changed_before_operation')
  }
}

async function requireHealthyPreflight(
  operation: 'setup' | 'update' | 'rollback',
  options: CommunityServerOptions,
  runtime: ResolvedCommunityServerDependencies,
): Promise<void> {
  const selection = installSelection(options)
  const preflight = await runtime.inspectDoctor({
    instance: selection.instanceName,
    dataRoot: selection.dataRoot,
  })
  if (preflight.mutationFree !== true) {
    throw new Error(`community_${operation}_preflight_not_mutation_free`)
  }
  const failedChecks = preflight.checks.filter((check) => check.status === 'fail').map((check) => check.id)
  if (failedChecks.length > 0) {
    throw new Error(`community_${operation}_preflight_failed:${failedChecks.join(',')}:run_aops-cli_doctor`)
  }
}

const RECOVERY_TOLERATED_RUNTIME_FAILURES = new Set(['container-status', 'server-health'])

async function requireRecoveryPreflight(
  options: CommunityServerOptions,
  runtime: ResolvedCommunityServerDependencies,
): Promise<void> {
  const selection = installSelection(options)
  const preflight = await runtime.inspectDoctor({
    instance: selection.instanceName,
    dataRoot: selection.dataRoot,
  })
  if (preflight.mutationFree !== true) {
    throw new Error('community_recover_preflight_not_mutation_free')
  }
  const blockingChecks = preflight.checks
    .filter((check) => check.status === 'fail' && !RECOVERY_TOLERATED_RUNTIME_FAILURES.has(check.id))
    .map((check) => check.id)
  if (blockingChecks.length > 0) {
    throw new Error(`community_recover_preflight_failed:${blockingChecks.join(',')}:run_aops-cli_doctor`)
  }
}

async function withInstalledOperation<T>(
  options: CommunityServerOptions,
  operation: Exclude<CommunityOperation, 'setup' | 'update' | 'rollback' | 'reset'>,
  runtime: ResolvedCommunityServerDependencies,
  signal: AbortSignal,
  callback: (
    installed: ReturnType<typeof requireInstalled>,
    context: CommunityJournaledCommandContext,
  ) => Promise<T>,
): Promise<T> {
  const initial = requireInstalled(options)
  assertOwnedInstancePaths(initial.paths, 'require-existing')
  return runtime.withOperationLock(
    { instanceDirectory: initial.paths.instanceRoot, operation, signal },
    async ({ receipt }) => {
      const locked = requireInstalled(options)
      assertSameInstancePaths(initial.paths, locked.paths)
      assertOwnedInstancePaths(locked.paths, 'require-existing')
      assertCommunityRecoveryMutationFence(locked.paths)
      return runWithOperationJournal({
        paths: locked.paths,
        state: locked.state,
        operation,
        receipt,
        signal,
        runtime,
        callback: (context) => callback(locked, context),
      })
    },
  )
}

export async function runCommunityServerSetup(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const selection = installSelection(options)
    const existing = inspectFrom(options)
    if (existing.status === 'partial') {
      throw new Error(`community_install_partial:${existing.error ?? 'unknown'}:run_aops-cli_doctor_or_server_reset`)
    }
    throwIfCommunityCommandAborted(signal)
    const { candidate, verified } = await releaseBundle(options, runtime)
    throwIfCommunityCommandAborted(signal)
    await requireHealthyPreflight('setup', options, runtime)
    throwIfCommunityCommandAborted(signal)
    const port = Number(options.port ?? 5900)
    const paths = resolveCommunityInstallPaths(selection)
    runtime.ensureInstanceDirectory(paths.instanceRoot)
    assertOwnedInstancePaths(paths, 'allow-missing')
    const result = await runtime.withOperationLock({ instanceDirectory: paths.instanceRoot, operation: 'setup', signal }, async ({ receipt }) => {
      assertCommunityRepoCandidateCurrent(candidate)
      assertOwnedInstancePaths(paths, 'create-missing')
      const lockedInspection = inspectFrom(options)
      if (lockedInspection.status === 'partial') {
        throw new Error(`community_install_partial:${lockedInspection.error ?? 'unknown'}:run_aops-cli_doctor_or_server_reset`)
      }
      assertSameInstancePaths(paths, lockedInspection.paths)
      assertCommunityRecoveryMutationFence(paths)
      return runWithOperationJournal({
        paths,
        state: lockedInspection.status === 'installed' ? lockedInspection.state! : null,
        operation: 'setup',
        receipt,
        signal,
        runtime,
        callback: async (context) => {
          const { journal, receipt } = context
          const setup = await runCommunityJournaledPromotion({
            handle: journal,
            step: 'install-files',
            signal,
            promote: () => setupCommunityInstall({
              manifestContent: verified.manifestContent,
              composeContent: verified.composeContent,
              manifestVerified: true,
              instanceName: selection.instanceName,
              dataRoot: selection.dataRoot,
              port,
              operationJournal: journal,
              operationReceipt: receipt,
            }),
          })
          if (path.resolve(setup.paths.instanceRoot) !== path.resolve(paths.instanceRoot)) {
            throw new Error('community_setup_instance_path_mismatch')
          }
          const lifecycle = context.lifecycle
          await lifecycle.verifyRelease(setup.state.activeRelease)
          await lifecycle.pull({ paths: setup.paths, state: setup.state, release: setup.state.activeRelease })
          await lifecycle.start({
            paths: setup.paths,
            state: setup.state,
            release: setup.state.activeRelease,
            postgresVolumeName: setup.state.postgresVolumeName,
          })
          await lifecycle.health({ paths: setup.paths, state: setup.state })
          await lifecycle.dataSmoke({ paths: setup.paths, state: setup.state })
          throwIfCommunityCommandAborted(signal)
          return {
            status: setup.status === 'created' ? 'community-server-installed-and-running' : 'community-server-running',
            instance: setup.state.instanceName,
            releaseVersion: setup.state.activeRelease.releaseVersion,
            imageRef: setup.state.activeRelease.imageRef,
            dataRoot: setup.paths.dataRoot,
            repository: candidate.repoRoot,
            certificateIdentity: verified.certificateIdentity,
            verifiedArtifactCount: verified.verifiedArtifactCount,
          }
        },
      })
    })
    throwIfCommunityCommandAborted(signal)
    writeResult(result, options.json)
  })
}

export async function runCommunityServerStart(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const result = await withInstalledOperation(options, 'start', runtime, signal, async ({ paths, state }, { lifecycle }) => {
      await lifecycle.verifyRelease(state.activeRelease)
      await lifecycle.pull({ paths, state, release: state.activeRelease })
      await lifecycle.start({ paths, state, release: state.activeRelease, postgresVolumeName: state.postgresVolumeName })
      await lifecycle.health({ paths, state })
      await lifecycle.dataSmoke({ paths, state })
      return { status: 'community-server-running', instance: state.instanceName, imageRef: state.activeRelease.imageRef }
    })
    throwIfCommunityCommandAborted(signal)
    writeResult(result, options.json)
  })
}

export async function runCommunityServerStop(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const result = await withInstalledOperation(options, 'stop', runtime, signal, async ({ paths, state }, { lifecycle }) => {
      await lifecycle.stop({ paths, state })
      return { status: 'community-server-stopped', instance: state.instanceName }
    })
    throwIfCommunityCommandAborted(signal)
    writeResult(result, options.json)
  })
}

export async function runCommunityServerRestart(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const output = await withInstalledOperation(options, 'restart', runtime, signal, async ({ paths, state }, { journal, lifecycle }) => {
      const invocation = buildCommunityComposeInvocation({ paths, state, action: 'restart' })
      const result = await runCommunityJournaledSideEffect({
        handle: journal,
        step: 'restart-runtime',
        signal,
        effect: () => runtime.processRuntime.run({ ...invocation, signal }),
      })
      if (result.exitCode !== 0) throw new Error(`community_process_failed:restart:${result.exitCode}`)
      await lifecycle.health({ paths, state })
      await lifecycle.dataSmoke({ paths, state })
      return { status: 'community-server-restarted', instance: state.instanceName }
    })
    throwIfCommunityCommandAborted(signal)
    writeResult(output, options.json)
  })
}

export async function runCommunityServerStatus(options: CommunityServerOptions): Promise<void> {
  const inspection = inspectFrom(options)
  if (inspection.status !== 'installed') {
    writeResult({
      status: inspection.status,
      instanceRoot: inspection.paths.instanceRoot,
      error: inspection.error ?? null,
      presentFiles: inspection.presentFiles,
      missingFiles: inspection.missingFiles,
    }, options.json)
    return
  }
  const invocation = buildCommunityComposeInvocation({ paths: inspection.paths, state: inspection.state!, action: 'status' })
  const result = await communityProcessRuntime.run(invocation)
  if (options.json) {
    writeResult({
      status: result.exitCode === 0 ? 'installed' : 'docker-status-failed',
      instance: inspection.state!.instanceName,
      releaseVersion: inspection.state!.activeRelease.releaseVersion,
      imageRef: inspection.state!.activeRelease.imageRef,
      docker: { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr },
    }, true)
  } else {
    writeResult(result.stdout || result.stderr || `AOPS Community ${inspection.state!.activeRelease.releaseVersion} is installed.`)
  }
  if (result.exitCode !== 0) process.exitCode = 1
}

export async function runCommunityServerLogs(options: CommunityServerOptions): Promise<void> {
  const { paths, state } = requireInstalled(options)
  const tail = Number(options.tail ?? 100)
  if (!Number.isSafeInteger(tail) || tail < 1 || tail > 10_000) throw new Error('community_logs_tail_invalid')
  const result = await communityProcessRuntime.run(buildCommunityComposeInvocation({ paths, state, action: 'logs', logsTail: tail }))
  if (options.json) writeResult({ exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }, true)
  else writeResult(`${result.stdout}${result.stderr}`)
  if (result.exitCode !== 0) process.exitCode = 1
}

export async function runCommunityServerUpdate(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const initial = requireInstalled(options)
    assertOwnedInstancePaths(initial.paths, 'require-existing')
    const { candidate, verified } = await releaseBundle(options, runtime)
    throwIfCommunityCommandAborted(signal)
    await requireHealthyPreflight('update', options, runtime)
    throwIfCommunityCommandAborted(signal)
    const record = await runtime.withOperationLock(
      { instanceDirectory: initial.paths.instanceRoot, operation: 'update', signal },
      async ({ receipt }) => {
        const locked = requireInstalled(options)
        assertSameInstancePaths(initial.paths, locked.paths)
        assertOwnedInstancePaths(locked.paths, 'require-existing')
        assertCommunityRecoveryMutationFence(locked.paths)
        assertCommunityRepoCandidateCurrent(candidate)
        await requireHealthyPreflight('update', options, runtime)
        throwIfCommunityCommandAborted(signal)
        assertOwnedInstancePaths(locked.paths, 'require-existing')
        return runWithOperationJournal({
          paths: locked.paths,
          state: locked.state,
          operation: 'update',
          receipt,
          signal,
          runtime,
          callback: async (context) => {
            const { journal, receipt } = context
            const targetRelease = await runCommunityJournaledPromotion({
              handle: journal,
              step: 'stage-release',
              signal,
              promote: () => stageCommunityRelease({
                paths: locked.paths,
                manifestContent: verified.manifestContent,
                composeContent: verified.composeContent,
                manifestVerified: true,
              }),
            })
            const lifecycle = context.lifecycle
            return updateCommunityInstall({
              paths: locked.paths,
              targetRelease,
              adapter: lifecycle,
              signal,
              operationJournal: journal,
              operationReceipt: receipt,
            })
          },
        })
      },
    )
    throwIfCommunityCommandAborted(signal)
    writeResult({
      status: 'community-server-updated',
      updateId: record.id,
      releaseVersion: record.targetRelease.releaseVersion,
      imageRef: record.targetRelease.imageRef,
      backup: { path: record.backup.path, sha256: record.backup.sha256, byteLength: record.backup.byteLength },
    }, options.json)
  })
}

export async function runCommunityServerRecover(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  if (!options.updateId) throw new Error('community_recover_update_id_required')
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const initial = requireInstalled(options)
    assertOwnedInstancePaths(initial.paths, 'require-existing')
    await requireRecoveryPreflight(options, runtime)
    throwIfCommunityCommandAborted(signal)
    const record = await runtime.withOperationLock(
      { instanceDirectory: initial.paths.instanceRoot, operation: 'recover', signal },
      async ({ receipt }) => {
        const locked = requireInstalled(options)
        assertSameInstancePaths(initial.paths, locked.paths)
        assertOwnedInstancePaths(locked.paths, 'require-existing')
        assertCommunityRecoveryMutationFence(locked.paths)
        await requireRecoveryPreflight(options, runtime)
        throwIfCommunityCommandAborted(signal)
        assertOwnedInstancePaths(locked.paths, 'require-existing')
        return runWithOperationJournal({
          paths: locked.paths,
          state: locked.state,
          operation: 'recover',
          receipt,
          signal,
          runtime,
          callback: ({ journal, receipt, lifecycle }) => recoverCommunityUpdate({
            paths: locked.paths,
            updateId: options.updateId!,
            retryRecoveryId: options.retryRecoveryId,
            adapter: lifecycle,
            confirmDataRewind: options.confirmDataRewind === true,
            signal,
            operationJournal: journal,
            operationReceipt: receipt,
          }),
        })
      },
    )
    throwIfCommunityCommandAborted(signal)
    writeResult({
      status: 'community-server-recovered',
      updateId: record.recoveredUpdateId,
      recoveryId: record.id,
      releaseVersion: record.priorRelease.releaseVersion,
      imageRef: record.priorRelease.imageRef,
      dataRewound: record.replacementVolumeName !== undefined,
      postgresVolumeName: record.replacementVolumeName ?? record.sourcePostgresVolumeName,
    }, options.json)
  })
}

export async function runCommunityServerReconcileRecovery(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  if (!options.updateId || !options.recoveryId) {
    throw new Error('community_recovery_reconciliation_exact_ids_required')
  }
  if (options.reconciliationAction !== 'complete-commit' &&
      options.reconciliationAction !== 'abandon-interrupted' &&
      options.reconciliationAction !== 'restore-source-runtime') {
    throw new Error('community_recovery_reconciliation_action_invalid')
  }
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const initial = requireInstalled(options)
    assertOwnedInstancePaths(initial.paths, 'require-existing')
    const record = await runtime.withOperationLock(
      { instanceDirectory: initial.paths.instanceRoot, operation: 'recover', signal },
      async () => {
        const locked = requireInstalled(options)
        assertSameInstancePaths(initial.paths, locked.paths)
        assertOwnedInstancePaths(locked.paths, 'require-existing')
        if (options.reconciliationAction === 'complete-commit') {
          return reconcileCommunityRecoveryCommit({
            paths: locked.paths,
            updateId: options.updateId!,
            recoveryId: options.recoveryId!,
            confirm: options.confirmRecoveryReconciliation === true,
          })
        }
        if (options.reconciliationAction === 'abandon-interrupted') {
          return abandonInterruptedCommunityRecovery({
            paths: locked.paths,
            updateId: options.updateId!,
            recoveryId: options.recoveryId!,
            confirm: options.confirmRecoveryReconciliation === true,
          })
        }
        if (options.confirmRecoveryReconciliation !== true) {
          throw new Error('community_recovery_reconciliation_confirmation_required')
        }
        const restored = await restoreCommunitySourceRuntime({
          paths: locked.paths,
          sourceState: locked.state,
          operation: 'recover',
          operationStartedAt: new Date(0).toISOString(),
          expectedUpdateId: options.updateId!,
          expectedRecoveryId: options.recoveryId!,
          adapter: adapter(runtime, signal),
          confirmDataRewind: options.confirmDataRewind === true,
          signal,
        })
        if (!restored.reconciledRecord) {
          throw new Error('community_recovery_reconciliation_record_mismatch')
        }
        return restored.reconciledRecord
      },
    )
    throwIfCommunityCommandAborted(signal)
    writeResult({
      status: options.reconciliationAction === 'complete-commit'
        ? 'community-recovery-commit-completed'
        : options.reconciliationAction === 'abandon-interrupted'
          ? 'community-recovery-attempt-abandoned'
          : 'community-recovery-source-runtime-restored',
      updateId: record.recoveredUpdateId,
      recoveryId: record.id,
      recoveryStatus: record.status,
      retryWithRecoveryId: record.status === 'recovery-failed' ? record.id : undefined,
    }, options.json)
  })
}

export async function runCommunityServerRollback(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const initial = requireInstalled(options)
    assertOwnedInstancePaths(initial.paths, 'require-existing')
    await requireHealthyPreflight('rollback', options, runtime)
    throwIfCommunityCommandAborted(signal)
    const record = await runtime.withOperationLock(
      { instanceDirectory: initial.paths.instanceRoot, operation: 'rollback', signal },
      async ({ receipt }) => {
        const locked = requireInstalled(options)
        assertSameInstancePaths(initial.paths, locked.paths)
        assertOwnedInstancePaths(locked.paths, 'require-existing')
        assertCommunityRecoveryMutationFence(locked.paths)
        await requireHealthyPreflight('rollback', options, runtime)
        throwIfCommunityCommandAborted(signal)
        assertOwnedInstancePaths(locked.paths, 'require-existing')
        return runWithOperationJournal({
          paths: locked.paths,
          state: locked.state,
          operation: 'rollback',
          receipt,
          signal,
          runtime,
          callback: ({ journal, receipt, lifecycle }) => rollbackCommunityInstall({
            paths: locked.paths,
            adapter: lifecycle,
            confirmDataRewind: options.confirmDataRewind === true,
            signal,
            operationJournal: journal,
            operationReceipt: receipt,
          }),
        })
      },
    )
    throwIfCommunityCommandAborted(signal)
    writeResult({
      status: 'community-server-rolled-back',
      updateId: record.id,
      releaseVersion: record.priorRelease.releaseVersion,
      replacementVolumeName: record.replacementVolumeName,
    }, options.json)
  })
}

export async function runCommunityServerBackup(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const output = await withInstalledOperation(options, 'backup', runtime, signal, async ({ paths, state }, { journal, lifecycle }) => {
      const record = await lifecycle.createBackup({ paths, state })
      throwIfCommunityCommandAborted(signal)
      await verifyCommunityBackupRecord(record)
      throwIfCommunityCommandAborted(signal)
      const receiptPath = await runCommunityJournaledPromotion({
        handle: journal,
        step: 'write-backup-receipt',
        signal,
        promote: () => writeCommunityBackupReceipt(paths, record),
      })
      return {
        status: 'community-backup-created',
        backup: { path: record.path, receiptPath, sha256: record.sha256, byteLength: record.byteLength },
        sourceRelease: record.sourceRelease.imageRef,
      }
    })
    throwIfCommunityCommandAborted(signal)
    writeResult(output, options.json)
  })
}

export async function runCommunityServerRestore(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  if (!options.backup) throw new Error('community_restore_backup_path_required')
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const output = await withInstalledOperation(options, 'restore', runtime, signal, async ({ paths }, { journal, receipt, lifecycle }) => {
      const backup = await readCommunityBackupReceipt(paths, path.resolve(options.backup!))
      throwIfCommunityCommandAborted(signal)
      const result = await restoreCommunityBackup({
        paths,
        backup,
        adapter: lifecycle,
        confirmDataRewind: options.confirmDataRewind === true,
        signal,
        operationJournal: journal,
        operationReceipt: receipt,
      })
      throwIfCommunityCommandAborted(signal)
      return {
        status: 'community-backup-restored',
        backup: { path: backup.path, sha256: backup.sha256, byteLength: backup.byteLength },
        replacementVolumeName: result.replacementVolumeName,
      }
    })
    throwIfCommunityCommandAborted(signal)
    writeResult(output, options.json)
  })
}

const COMMUNITY_OPERATION_RECONCILIATION_ACTIONS = new Set<CommunityOperationReconciliationAction>([
  'acknowledge-no-side-effect',
  'restore-source-runtime',
  'acknowledge-artifact-preserved',
  'acknowledge-partial-install-preserved',
  'complete-reset-preserving-volumes',
])

function requireOperationReconciliationSelection(options: CommunityServerOptions): {
  operationId: string
  expectedOperation: CommunityOperation
  action: CommunityOperationReconciliationAction
} {
  if (!options.operationId || !options.expectedOperation || !options.reconciliationAction) {
    throw new Error('community_operation_reconciliation_exact_selection_required:run_server_operation-status')
  }
  if (!COMMUNITY_OPERATION_RECONCILIATION_ACTIONS.has(
    options.reconciliationAction as CommunityOperationReconciliationAction,
  )) {
    throw new Error('community_operation_reconciliation_action_invalid')
  }
  return {
    operationId: options.operationId,
    expectedOperation: options.expectedOperation,
    action: options.reconciliationAction as CommunityOperationReconciliationAction,
  }
}

export async function runCommunityServerOperationStatus(options: CommunityServerOptions): Promise<void> {
  if (!options.operationId) throw new Error('community_operation_status_id_required')
  const paths = pathsFrom(options)
  const inspection = inspectCommunityOperationJournalFile(paths, options.operationId)
  const currentDigests = captureCommunityOperationDigests(paths)
  writeResult({
    surface: 'community-operation-status',
    instance: options.instance ?? 'default',
    operationId: inspection.record.id,
    operation: inspection.record.operation,
    integrity: inspection.integrity,
    validBytes: inspection.validBytes,
    journalSha256: inspection.fileSha256,
    status: inspection.record.status,
    phase: inspection.record.phase,
    step: inspection.record.step,
    lastRunningPhase: inspection.lastRunningPhase,
    lastRunningStep: inspection.lastRunningStep,
    permittedActions: inspection.record.permittedActions,
    receipt: inspection.record.receipt,
    preDigests: inspection.record.preDigests,
    currentDigests,
    currentMatchesPre: digestsEqual(currentDigests, inspection.record.preDigests),
    sourceState: inspection.record.sourceState,
    recoveryCommitPending: Boolean(tryLstat(paths.recoveryJournalPath)),
  }, options.json)
}

async function applyCommunityOperationReconciliation(params: {
  options: CommunityServerOptions
  runtime: ResolvedCommunityServerDependencies
  signal: AbortSignal
  paths: CommunityInstallPaths
  inspection: ReturnType<typeof inspectCommunityOperationJournalFile>
  action: CommunityOperationReconciliationAction
}): Promise<Record<string, unknown>> {
  const { options, runtime, signal, paths, inspection, action } = params
  const record = inspection.record
  const currentDigests = captureCommunityOperationDigests(paths)
  if (action === 'acknowledge-no-side-effect') {
    if (inspection.lastRunningPhase !== 'prepared' || inspection.lastRunningStep !== 'prepared' ||
        !digestsEqual(currentDigests, record.preDigests)) {
      throw new Error('community_operation_reconciliation_not_pre_effect')
    }
    assertNoCommunityRecoveryCommitJournal(paths)
    assertCommunityLedgerHasNoNonterminalOperation(paths)
    return { action, sideEffectAcknowledged: false }
  }
  if (action === 'acknowledge-artifact-preserved') {
    if (record.operation !== 'backup' || !digestsEqual(currentDigests, record.preDigests) ||
        inspection.lastRunningStep.startsWith('write-backup-receipt') ||
        inspection.lastRunningPhase === 'promotion-before' || inspection.lastRunningPhase === 'promotion-after') {
      throw new Error('community_backup_artifact_reconciliation_precondition_failed')
    }
    assertNoCommunityRecoveryCommitJournal(paths)
    assertCommunityLedgerHasNoNonterminalOperation(paths)
    return { action, artifactPreserved: true, receiptPromoted: false }
  }
  if (action === 'acknowledge-partial-install-preserved') {
    if (record.operation !== 'setup' || record.sourceState !== null) {
      throw new Error('community_partial_install_reconciliation_precondition_failed')
    }
    const install = inspectFrom(options)
    assertSameInstancePaths(paths, install.paths)
    if (install.status !== 'partial') {
      throw new Error('community_partial_install_reconciliation_requires_partial_install')
    }
    assertNoCommunityRecoveryCommitJournal(paths)
    assertCommunityLedgerHasNoNonterminalOperation(paths)
    return { action, partialInstallPreserved: true, nextSafeAction: 'reset' }
  }
  if (action === 'complete-reset-preserving-volumes') {
    const instance = (options.instance ?? 'default').trim().toLowerCase()
    const eligibleReset = record.operation === 'reset' || (record.operation === 'setup' && record.sourceState === null)
    if (!eligibleReset || options.confirmDataLoss !== true || options.confirmInstance !== instance) {
      throw new Error('community_operation_reset_reconciliation_confirmation_required')
    }
    const install = inspectFrom({ ...options, instance })
    if (install.status === 'installed') {
      await adapter(runtime, signal).stop({ paths, state: install.state! })
    }
    throwIfCommunityCommandAborted(signal)
    removeInstanceContentsExceptLock(paths.instanceRoot)
    return { action, instance, rootPreserved: true, dockerVolumesPreserved: true }
  }
  if (action === 'restore-source-runtime') {
    if (!record.sourceState) throw new Error('community_operation_source_state_missing')
    const restored = await restoreCommunitySourceRuntime({
      paths,
      sourceState: record.sourceState,
      operation: record.operation,
      operationStartedAt: record.createdAt,
      adapter: adapter(runtime, signal),
      confirmDataRewind: options.confirmDataRewind === true,
      signal,
    })
    return {
      action,
      releaseVersion: restored.state.activeRelease.releaseVersion,
      imageRef: restored.state.activeRelease.imageRef,
      postgresVolumeName: restored.state.postgresVolumeName,
      reconciledLedgerRecordId: restored.reconciledRecord?.id,
    }
  }
  throw new Error('community_operation_reconciliation_action_invalid')
}

export async function runCommunityServerReconcileOperation(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  const selection = requireOperationReconciliationSelection(options)
  if (options.confirmOperationReconciliation !== true) {
    throw new Error('community_operation_reconciliation_confirmation_required')
  }
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const paths = pathsFrom(options)
    assertInstanceDirectory(paths.instanceRoot)
    const initial = inspectCommunityOperationJournalFile(paths, selection.operationId)
    if (initial.record.operation !== selection.expectedOperation ||
        !initial.record.permittedActions.includes(selection.action) ||
        ['succeeded', 'reconciled'].includes(initial.record.status)) {
      throw new Error('community_operation_reconciliation_identity_mismatch')
    }
    const output = await runtime.withOperationLock(
      { instanceDirectory: paths.instanceRoot, operation: selection.expectedOperation, signal },
      async () => {
        const lockedPaths = pathsFrom(options)
        assertSameInstancePaths(paths, lockedPaths)
        assertNoCommunityRecoveryCommitJournal(lockedPaths)
        const lockedInspection = inspectCommunityOperationJournalFile(lockedPaths, selection.operationId)
        if (lockedInspection.record.sequence !== initial.record.sequence ||
            lockedInspection.lastHash !== initial.lastHash ||
            lockedInspection.integrity !== initial.integrity ||
            lockedInspection.validBytes !== initial.validBytes ||
            lockedInspection.fileSha256 !== initial.fileSha256) {
          throw new Error('community_operation_reconciliation_generation_changed')
        }
        const journal = openCommunityOperationJournalForReconciliation({
          paths: lockedPaths,
          operationId: selection.operationId,
          expectedOperation: selection.expectedOperation,
          action: selection.action,
          confirm: true,
          expectedSequence: lockedInspection.record.sequence,
          expectedLastHash: lockedInspection.lastHash,
          expectedFileSha256: lockedInspection.fileSha256,
        })
        try {
          assertCommunityOperationJournalFence(lockedPaths, {
            handle: journal,
            operation: selection.expectedOperation,
            receipt: lockedInspection.record.receipt,
            reconciliation: true,
          })
          throwIfCommunityCommandAborted(signal)
          const detail = await applyCommunityOperationReconciliation({
            options,
            runtime,
            signal,
            paths: lockedPaths,
            inspection: lockedInspection,
            action: selection.action,
          })
          throwIfCommunityCommandAborted(signal)
          journal.assertOwned()
          const terminal = finishCommunityOperationJournal(journal, lockedPaths, 'reconciled')
          return {
            surface: 'community-operation-reconciliation',
            status: terminal.status,
            operationId: terminal.id,
            operation: terminal.operation,
            ...detail,
          }
        } finally {
          journal.close()
        }
      },
    )
    throwIfCommunityCommandAborted(signal)
    writeResult(output, options.json)
  })
}

export async function runCommunityServerLockStatus(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  const runtime = resolveDependencies(dependencies)
  const paths = pathsFrom(options)
  assertInstanceDirectory(paths.instanceRoot)
  const inspection = await runtime.inspectOperationLock({ instanceDirectory: paths.instanceRoot })
  writeResult({ surface: 'community-operation-lock-status', ...inspection }, options.json)
}

export async function runCommunityServerRecoverLock(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  if (!options.expectedLockOperation || !options.expectedLockStartedAt ||
      !options.expectedLockOwnerSha256 || !options.expectedProcessStartIdentity) {
    throw new Error('community_lock_recovery_exact_receipt_required:run_server_lock-status')
  }
  const pid = Number(options.expectedLockPid)
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error('community_lock_recovery_expected_pid_invalid')
  }
  const expectedReceipt: CommunityOperationLockReceipt = {
    schemaVersion: 2,
    pid,
    operation: options.expectedLockOperation,
    startedAt: options.expectedLockStartedAt,
    ownerTokenSha256: options.expectedLockOwnerSha256,
    processStartIdentity: options.expectedProcessStartIdentity,
  }
  const runtime = resolveDependencies(dependencies)
  const paths = pathsFrom(options)
  assertInstanceDirectory(paths.instanceRoot)
  const result = await runtime.recoverStaleOperationLock({
    instanceDirectory: paths.instanceRoot,
    expectedReceipt,
    confirm: options.confirmStaleLockRecovery === true,
  })
  writeResult({ surface: 'community-operation-lock-recovery', ...result }, options.json)
}

export async function runCommunityServerReset(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  const instance = (options.instance ?? 'default').trim().toLowerCase()
  if (options.confirmDataLoss !== true || options.confirmInstance !== instance) {
    throw new Error('community_reset_confirmation_required:use_--confirm-data-loss_--confirm-instance')
  }
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const resetOptions = { ...options, instance }
    const inspection = inspectFrom(resetOptions)
    const expectedRoot = pathsFrom(resetOptions).instanceRoot
    if (path.resolve(expectedRoot) !== path.resolve(inspection.paths.instanceRoot)) throw new Error('community_reset_path_mismatch')
    if (!tryLstat(expectedRoot)) {
      throwIfCommunityCommandAborted(signal)
      writeResult({ status: 'community-install-reset', instance, instanceRoot: expectedRoot, alreadyAbsent: true }, options.json)
      return
    }
    assertInstanceDirectory(expectedRoot)
    assertOwnedInstancePaths(inspection.paths, 'allow-missing')
    const output = await runtime.withOperationLock(
      { instanceDirectory: expectedRoot, operation: 'reset', signal },
      async ({ receipt }) => {
        const locked = inspectFrom(resetOptions)
        assertSameInstancePaths(inspection.paths, locked.paths)
        assertOwnedInstancePaths(locked.paths, 'allow-missing')
        assertCommunityRecoveryMutationFence(locked.paths)
        return runWithOperationJournal({
          paths: locked.paths,
          state: locked.status === 'installed' ? locked.state! : null,
          operation: 'reset',
          receipt,
          signal,
          runtime,
          callback: async ({ journal, lifecycle }) => {
            if (locked.status === 'installed') {
              await lifecycle.stop({ paths: locked.paths, state: locked.state! })
            }
            assertOwnedInstancePaths(locked.paths, 'allow-missing')
            await runCommunityJournaledPromotion({
              handle: journal,
              step: 'remove-instance-contents',
              signal,
              promote: () => removeInstanceContentsExceptLock(expectedRoot),
            })
            return { status: 'community-install-reset', instance, instanceRoot: expectedRoot, rootPreserved: true }
          },
        })
      },
    )
    throwIfCommunityCommandAborted(signal)
    writeResult(output, options.json)
  })
}

function common(command: Command): Command {
  return command
    .option('--instance <name>', 'Installation instance name', 'default')
    .option('--data-root <path>', 'Absolute Community data root override')
    .option('--json', 'Output JSON')
}

function releaseOptions(command: Command): Command {
  return command
    .option('--repo <path>', 'Tagged aops-community clone root; otherwise discover upward from cwd')
    .option('--certificate-identity <identity>', 'Trusted GitHub Actions certificate identity')
    .option('--certificate-oidc-issuer <url>', 'Trusted certificate OIDC issuer')
}

export type CommunityServerCommandIdentity = Readonly<Pick<CommunityServerDependencies, 'cliVersion'>>

export function makeCommunityServerCommand(identity: CommunityServerCommandIdentity = {}): Command {
  const dependencies: CommunityServerDependencies = { cliVersion: identity.cliVersion }
  const command = new Command('server').description('Install and operate the pull-only AOPS Community server')
  common(releaseOptions(command.command('setup').description('Verify a release, install it, and start the server')))
    .option('--port <number>', 'Host port', '5900')
    .action((options) => runCommunityServerSetup(options, dependencies))
  common(command.command('start').alias('up').description('Pull the installed digest and start the server'))
    .action((options) => runCommunityServerStart(options, dependencies))
  common(command.command('stop').alias('down').description('Stop the server without deleting data'))
    .action((options) => runCommunityServerStop(options, dependencies))
  common(command.command('restart').description('Restart the installed server'))
    .action((options) => runCommunityServerRestart(options, dependencies))
  common(command.command('status').description('Show install and container status')).action(runCommunityServerStatus)
  common(command.command('logs').description('Show recent server logs'))
    .option('--tail <number>', 'Number of log lines', '100')
    .action(runCommunityServerLogs)
  common(releaseOptions(command.command('update').description('Verify, back up, and update to a signed release')))
    .action((options) => runCommunityServerUpdate(options, dependencies))
  common(command.command('recover').description('Recover one exact failed or unhealthy update from its verified backup'))
    .requiredOption('--update-id <id>', 'Exact update ID recorded by the failed or unhealthy update')
    .option('--retry-recovery-id <id>', 'Retry only the exact previously failed recovery attempt using a new volume')
    .option('--confirm-data-rewind', 'Confirm that recovery may rewind data to the pre-update backup')
    .action((options) => runCommunityServerRecover(options, dependencies))
  common(command.command('reconcile-recovery').description('Explicitly finish or abandon one exact hard-killed recovery attempt'))
    .requiredOption('--update-id <id>', 'Exact update ID from the recovery ledger')
    .requiredOption('--recovery-id <id>', 'Exact interrupted recovery attempt ID')
    .requiredOption('--reconciliation-action <action>', 'complete-commit, abandon-interrupted, or restore-source-runtime')
    .option('--confirm-recovery-reconciliation', 'Confirm this exact fail-closed reconciliation')
    .option('--confirm-data-rewind', 'Confirm switching back to the exact recorded source data volume')
    .action((options) => runCommunityServerReconcileRecovery(options, dependencies))
  common(command.command('rollback').description('Restore the verified pre-update backup into a fresh data volume'))
    .option('--confirm-data-rewind', 'Confirm that data will be rewound to the pre-update backup')
    .action((options) => runCommunityServerRollback(options, dependencies))
  common(command.command('backup').description('Create and verify a custom-format PostgreSQL backup plus receipt'))
    .action((options) => runCommunityServerBackup(options, dependencies))
  common(command.command('restore').description('Restore a verified manual backup into a fresh data volume'))
    .requiredOption('--backup <path>', 'Backup dump path; its JSON receipt must exist beside it')
    .option('--confirm-data-rewind', 'Confirm that data will be rewound to the selected backup')
    .action((options) => runCommunityServerRestore(options, dependencies))
  common(command.command('operation-status').description('Inspect one exact durable operation journal without changing it'))
    .requiredOption('--operation-id <id>', 'Exact operation journal ID')
    .action((options) => runCommunityServerOperationStatus(options))
  common(command.command('reconcile-operation').description('Reconcile one exact interrupted operation under its instance lock'))
    .requiredOption('--operation-id <id>', 'Exact operation journal ID from server operation-status')
    .requiredOption('--expected-operation <operation>', 'Exact operation recorded by server operation-status')
    .requiredOption('--reconciliation-action <action>', 'One exact action permitted by server operation-status')
    .option('--confirm-operation-reconciliation', 'Confirm reconciliation of this exact operation generation')
    .option('--confirm-data-rewind', 'Confirm switching back to the exact recorded source data volume')
    .option('--confirm-data-loss', 'Confirm completion of an interrupted reset')
    .option('--confirm-instance <name>', 'Repeat the exact instance name for reset reconciliation')
    .action((options) => runCommunityServerReconcileOperation(options, dependencies))
  common(command.command('lock-status').description('Inspect the exact same-instance operation lock without changing it'))
    .action((options) => runCommunityServerLockStatus(options, dependencies))
  common(command.command('recover-lock').description('Recover one exact stale lock generation proven dead or PID-reused'))
    .requiredOption('--expected-lock-pid <pid>', 'Exact PID from server lock-status')
    .requiredOption('--expected-lock-operation <operation>', 'Exact operation from server lock-status')
    .requiredOption('--expected-lock-started-at <iso>', 'Exact startedAt from server lock-status')
    .requiredOption('--expected-lock-owner-sha256 <digest>', 'Exact ownerTokenSha256 from server lock-status')
    .requiredOption('--expected-process-start-identity <digest>', 'Exact processStartIdentity from server lock-status')
    .option('--confirm-stale-lock-recovery', 'Confirm deletion of only this exact proven-stale generation')
    .action((options) => runCommunityServerRecoverLock(options, dependencies))
  common(command.command('reset').description('Remove local installation state; Docker named volumes are preserved'))
    .requiredOption('--confirm-instance <name>', 'Repeat the instance name')
    .option('--confirm-data-loss', 'Confirm removal of the installation state and its active data pointer')
    .action((options) => runCommunityServerReset(options, dependencies))
  return command
}
