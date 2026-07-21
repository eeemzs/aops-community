import {
  existsSync,
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
import {
  resolveCommunityOfflineRelease,
  resolveCommunityPublishedRelease,
} from '../lib/community-release-resolver.js'
import { inspectCommunityDoctor } from './community-doctor.js'
import {
  buildCommunityInstanceContract,
  type CommunityPostgresMode,
  type CommunityPostgresTlsPolicy,
  type CommunityServerRuntime,
} from '../lib/community-instance-contract.js'
import {
  assertCommunityNativePathLayout,
  attestCommunityNativeExternalSnapshot,
  inspectCommunityNativeInstall,
  inspectCommunityNativeRuntime,
  planCommunityNativeInstalledMigration,
  readCommunityNativeLogs,
  rollbackCommunityNativeApplication,
  resolveCommunityNativeLaunchMode,
  resolveCommunityNativePaths,
  setupCommunityNativeInstall,
  startCommunityNativeInstall,
  stopCommunityNativeInstall,
  type CommunityNativeInspection,
} from '../lib/community-native-lifecycle.js'
import type { CommunityNativeMigrationReceiptV1 } from '../lib/community-native-migration.js'
import { inspectCommunityNativeApplicationRecoveryStatus } from '../lib/community-native-application-recovery.js'
import {
  inspectCommunityNativeDatabaseRecoveryStatus,
  restoreCommunityNativeDatabaseForUpdate,
} from '../lib/community-native-database-recovery.js'
import {
  inspectCommunityNativePostgres,
  removeCommunityNativePostgresContainerForReset,
  removeCommunityNativeManagedPostgres,
} from '../lib/community-native-postgres.js'

export type CommunityServerOptions = {
  instance?: string
  dataRoot?: string
  repo?: string
  releaseDir?: string
  releaseDescriptor?: string
  runtime?: CommunityServerRuntime
  postgres?: CommunityPostgresMode
  postgresConfig?: string
  postgresTls?: CommunityPostgresTlsPolicy
  sourceRoot?: string
  foreground?: boolean
  detach?: boolean
  apply?: boolean
  preview?: boolean
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
  removeManagedPostgres?: boolean
  expectedPlanSha256?: string
  provider?: string
  snapshotRef?: string
  snapshotDigest?: string
  attestedBy?: string
  restoreInstructionsRef?: string
  confirmExternalRecoveryOwner?: boolean
  confirmExternalRestoreComplete?: boolean
  json?: boolean
  /** Internal composition seam used by setup/init; never exposed as a CLI flag. */
  resultSink?: (result: unknown) => void
  /** Internal composition seam used to preserve a single parent JSON envelope. */
  silent?: boolean
  /** Ephemeral setup-only secret factory; never exposed as a CLI flag or serialized. */
  createPostgresSecret?: () => string
}

export type CommunityServerDependencies = Readonly<{
  verifyReleaseBundle?: typeof verifyCommunityReleaseBundle
  resolvePublishedRelease?: typeof resolveCommunityPublishedRelease
  resolveOfflineRelease?: typeof resolveCommunityOfflineRelease
  inspectDoctor?: typeof inspectCommunityDoctor
  createAdapter?: typeof createCommunityDockerAdapter
  processRuntime?: typeof communityProcessRuntime
  withOperationLock?: typeof withCommunityOperationLock
  inspectOperationLock?: typeof inspectCommunityOperationLock
  recoverStaleOperationLock?: typeof recoverStaleCommunityOperationLock
  removeNativePostgresContainerForReset?: typeof removeCommunityNativePostgresContainerForReset
  removeNativeManagedPostgres?: typeof removeCommunityNativeManagedPostgres
  planNativeMigration?: typeof planCommunityNativeInstalledMigration
  attestNativeExternalSnapshot?: typeof attestCommunityNativeExternalSnapshot
  setupNativeInstall?: typeof setupCommunityNativeInstall
  rollbackNativeApplication?: typeof rollbackCommunityNativeApplication
  restoreNativeDatabase?: typeof restoreCommunityNativeDatabaseForUpdate
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

type CommunityInstanceDirectoryIdentity = Readonly<{
  path: string
  device: string
  inode: string
}>

function captureInstanceDirectoryIdentity(instanceRoot: string): CommunityInstanceDirectoryIdentity {
  const canonical = assertInstanceDirectory(instanceRoot)
  const stat = lstatSync(canonical, { bigint: true })
  return Object.freeze({ path: canonical, device: stat.dev.toString(), inode: stat.ino.toString() })
}

function assertInstanceDirectoryIdentity(identity: CommunityInstanceDirectoryIdentity): void {
  const canonical = assertInstanceDirectory(identity.path)
  const stat = lstatSync(canonical, { bigint: true })
  if (stat.dev.toString() !== identity.device || stat.ino.toString() !== identity.inode) {
    throw new Error('community_instance_root_identity_changed')
  }
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

function removeNativeInstanceContentsPreservingPostgres(instanceRoot: string): void {
  const canonicalRoot = assertInstanceDirectory(instanceRoot)
  const runtimeRoot = path.join(canonicalRoot, 'runtime')
  const postgresSecretName = 'native-postgres.env'
  for (const entry of readdirSync(canonicalRoot, { withFileTypes: true })) {
    if (entry.name === COMMUNITY_OPERATION_LOCK_DIRECTORY_NAME) continue
    const target = path.join(canonicalRoot, entry.name)
    if (entry.name !== 'runtime') {
      const stat = lstatSync(target)
      rmSync(target, { recursive: stat.isDirectory() && !stat.isSymbolicLink(), force: true })
      continue
    }
    const runtimeStat = lstatSync(target)
    if (!runtimeStat.isDirectory() || runtimeStat.isSymbolicLink() ||
        !isSamePhysicalPath(realpathSync.native(target), runtimeRoot)) {
      throw new Error('community_native_runtime_root_unsafe')
    }
    for (const runtimeEntry of readdirSync(runtimeRoot, { withFileTypes: true })) {
      if (runtimeEntry.name === postgresSecretName) continue
      const runtimeTarget = path.join(runtimeRoot, runtimeEntry.name)
      const stat = lstatSync(runtimeTarget)
      rmSync(runtimeTarget, { recursive: stat.isDirectory() && !stat.isSymbolicLink(), force: true })
    }
  }
}

function resolveDependencies(
  dependencies: CommunityServerDependencies = {},
): ResolvedCommunityServerDependencies {
  return {
    verifyReleaseBundle: dependencies.verifyReleaseBundle ?? verifyCommunityReleaseBundle,
    resolvePublishedRelease: dependencies.resolvePublishedRelease ?? resolveCommunityPublishedRelease,
    resolveOfflineRelease: dependencies.resolveOfflineRelease ?? resolveCommunityOfflineRelease,
    inspectDoctor: dependencies.inspectDoctor ?? inspectCommunityDoctor,
    createAdapter: dependencies.createAdapter ?? createCommunityDockerAdapter,
    processRuntime: dependencies.processRuntime ?? communityProcessRuntime,
    withOperationLock: dependencies.withOperationLock ?? withCommunityOperationLock,
    inspectOperationLock: dependencies.inspectOperationLock ?? inspectCommunityOperationLock,
    recoverStaleOperationLock: dependencies.recoverStaleOperationLock ?? recoverStaleCommunityOperationLock,
    removeNativePostgresContainerForReset:
      dependencies.removeNativePostgresContainerForReset ?? removeCommunityNativePostgresContainerForReset,
    removeNativeManagedPostgres:
      dependencies.removeNativeManagedPostgres ?? removeCommunityNativeManagedPostgres,
    planNativeMigration: dependencies.planNativeMigration ?? planCommunityNativeInstalledMigration,
    attestNativeExternalSnapshot:
      dependencies.attestNativeExternalSnapshot ?? attestCommunityNativeExternalSnapshot,
    setupNativeInstall: dependencies.setupNativeInstall ?? setupCommunityNativeInstall,
    rollbackNativeApplication: dependencies.rollbackNativeApplication ?? rollbackCommunityNativeApplication,
    restoreNativeDatabase: dependencies.restoreNativeDatabase ?? restoreCommunityNativeDatabaseForUpdate,
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

function nativeJournalPathsFrom(options: CommunityServerOptions): CommunityInstallPaths {
  const selection = installSelection(options)
  const base = resolveCommunityInstallPaths(selection)
  const native = resolveCommunityNativePaths(selection)
  if (!isSamePhysicalPath(base.instanceRoot, native.instanceRoot)) {
    throw new Error('community_native_journal_instance_path_mismatch')
  }
  return {
    ...base,
    statePath: native.statePath,
    envPath: native.secretPath,
    ledgerPath: native.processPath,
  }
}

function journalPathsForMode(
  options: CommunityServerOptions,
  runtimeMode: 'oci' | 'native',
): CommunityInstallPaths {
  return runtimeMode === 'native' ? nativeJournalPathsFrom(options) : pathsFrom(options)
}

function inspectFrom(options: CommunityServerOptions) {
  return inspectCommunityInstall(installSelection(options))
}

function inspectNativeFrom(options: CommunityServerOptions): CommunityNativeInspection {
  return inspectCommunityNativeInstall(installSelection(options))
}

function writeResult(
  result: unknown,
  json = false,
  composition: Pick<CommunityServerOptions, 'resultSink' | 'silent'> = {},
): void {
  composition.resultSink?.(result)
  if (composition.silent) return
  if (json) console.log(JSON.stringify(result, null, 2))
  else if (typeof result === 'string') process.stdout.write(result.endsWith('\n') ? result : `${result}\n`)
  else console.log(JSON.stringify(result, null, 2))
}

function nativeMigrationSummary(receipt: CommunityNativeMigrationReceiptV1): Record<string, unknown> {
  return {
    status: receipt.status,
    completedAt: receipt.completedAt,
    action: receipt.action,
    policyId: receipt.policyId,
    targetLineageId: receipt.targetLineageId,
    resultLineageId: receipt.resultLineageId,
    pendingMigrationCount: receipt.pendingMigrationCount,
    acceptedPlanSha256: receipt.acceptedPlanSha256,
    sourceMigrationStateFingerprintSha256: receipt.sourceMigrationStateFingerprintSha256,
    resultSchemaFingerprintSha256: receipt.resultSchemaFingerprintSha256,
    resultReceiptFingerprintSha256: receipt.resultReceiptFingerprintSha256,
    resultMigrationStateFingerprintSha256: receipt.resultMigrationStateFingerprintSha256,
  }
}

async function releaseBundle(
  options: CommunityServerOptions,
  dependencies: ResolvedCommunityServerDependencies,
  signal?: AbortSignal,
) {
  const sourceSelection = selectCommunityReleaseSource(options)
  if (sourceSelection === 'published-version-tag') {
    const verified = await dependencies.resolvePublishedRelease({
      releaseVersion: dependencies.cliVersion,
      certificateIdentity: options.certificateIdentity,
      certificateOidcIssuer: options.certificateOidcIssuer,
      signal,
    })
    return {
      verified,
      assertCurrent: () => {},
      descriptorSource: verified.descriptorSource,
    }
  }
  if (sourceSelection === 'offline-descriptor') {
    const resolved = await dependencies.resolveOfflineRelease({
      descriptorPath: options.releaseDescriptor!,
      releaseVersion: dependencies.cliVersion,
      certificateIdentity: options.certificateIdentity,
      certificateOidcIssuer: options.certificateOidcIssuer,
      signal,
    })
    return {
      verified: resolved.verified,
      assertCurrent: resolved.assertCurrent,
      descriptorSource: resolved.descriptorSource,
    }
  }
  let repo = options.repo
  let expectedReleaseDir: string | undefined
  if (options.releaseDir) {
    const requested = path.resolve(options.releaseDir)
    const directManifest = tryLstat(path.join(requested, 'release.json'))
    repo = directManifest?.isFile() ? path.dirname(requested) : requested
    expectedReleaseDir = directManifest?.isFile() ? requested : path.join(requested, 'release')
  }
  const candidate = resolveCommunityRepo({ repo })
  if (expectedReleaseDir && !isSamePhysicalPath(realpathSync.native(expectedReleaseDir), candidate.releaseDir)) {
    throw new Error('community_release_dir_repo_mismatch')
  }
  const verified = await dependencies.verifyReleaseBundle({
    releaseRoot: candidate.releaseDir,
    certificateIdentity: options.certificateIdentity,
    certificateOidcIssuer: options.certificateOidcIssuer,
    verificationMode: options.releaseDir !== undefined ? 'offline' : 'online',
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
  return {
    verified,
    assertCurrent: () => assertCommunityRepoCandidateCurrent(candidate),
    descriptorSource: Object.freeze({
      kind: 'local-bundle' as const,
      repository: candidate.repoRoot,
      releaseDirectory: candidate.releaseDir,
    }),
  }
}

export function selectCommunityReleaseSource(
  options: Pick<CommunityServerOptions, 'repo' | 'releaseDir' | 'releaseDescriptor'>,
): 'published-version-tag' | 'local-bundle' | 'offline-descriptor' {
  const selectors = [
    options.repo !== undefined ? '--repo' : null,
    options.releaseDir !== undefined ? '--release-dir' : null,
    options.releaseDescriptor !== undefined ? '--release-descriptor' : null,
  ].filter((value): value is string => value !== null)
  if (selectors.length > 1) {
    throw new Error(`community_release_selector_conflict:choose_only_one_of_${selectors.join('_')}`)
  }
  if (options.releaseDescriptor !== undefined) return 'offline-descriptor'
  return options.repo !== undefined || options.releaseDir !== undefined ? 'local-bundle' : 'published-version-tag'
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
  runtimeMode?: 'oci' | 'native'
  callback: (context: CommunityJournaledCommandContext) => Promise<T>
}): Promise<T> {
  const journal = createCommunityOperationJournal({
    paths: params.paths,
    operation: params.operation,
    receipt: params.receipt,
    sourceState: params.state,
    runtimeMode: params.runtimeMode,
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
  const native = inspectNativeFrom(options)
  if (native.status !== 'not-installed') {
    throw new Error(`community_oci_operation_refused:native_${native.status}:${native.error ?? 'use_native_lifecycle_command'}`)
  }
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

async function withNativeOperation<T>(
  options: CommunityServerOptions,
  operation: 'start' | 'stop' | 'restart' | 'update' | 'rollback' | 'backup' | 'restore',
  runtime: ResolvedCommunityServerDependencies,
  signal: AbortSignal,
  callback: (inspection: CommunityNativeInspection) => Promise<T>,
): Promise<T> {
  const initial = inspectNativeFrom(options)
  if (initial.status !== 'installed' || !initial.state) {
    throw new Error(`community_native_not_installed:${initial.status}:${initial.error ?? 'run_server_setup'}`)
  }
  const initialRoot = assertInstanceDirectory(initial.paths.instanceRoot)
  const instanceIdentity = captureInstanceDirectoryIdentity(initialRoot)
  return runtime.withOperationLock(
    { instanceDirectory: initialRoot, operation, signal },
    async ({ receipt }) => {
      throwIfCommunityCommandAborted(signal)
      assertInstanceDirectoryIdentity(instanceIdentity)
      const locked = inspectNativeFrom(options)
      if (locked.status !== 'installed' || !locked.state) {
        throw new Error(`community_native_install_changed:${locked.status}:${locked.error ?? 'unknown'}`)
      }
      if (!isSamePhysicalPath(initialRoot, path.resolve(locked.paths.instanceRoot))) {
        throw new Error('community_instance_path_changed_before_operation')
      }
      const oci = inspectFrom(options)
      if (oci.status !== 'not-installed') {
        throw new Error(`community_instance_runtime_conflict:oci_${oci.status}:run_aops-cli_doctor`)
      }
      const basePaths = pathsFrom(options)
      assertOwnedInstancePaths(basePaths, 'allow-missing')
      assertCommunityNativePathLayout(locked.paths, { requireInstanceRoot: true })
      const journalPaths = nativeJournalPathsFrom(options)
      assertCommunityOperationJournalFence(journalPaths)
      return runWithOperationJournal({
        paths: journalPaths,
        state: null,
        operation,
        receipt,
        signal,
        runtime,
        runtimeMode: 'native',
        callback: ({ journal }) => runCommunityJournaledSideEffect({
          handle: journal,
          step: `native-${operation}`,
          signal,
          effect: async () => {
            assertInstanceDirectoryIdentity(instanceIdentity)
            const result = await callback(locked)
            assertInstanceDirectoryIdentity(instanceIdentity)
            return result
          },
        }),
      })
    },
  )
}

export async function runCommunityServerSetup(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  const contract = buildCommunityInstanceContract({
    runtime: options.runtime,
    postgres: options.postgres,
    postgresConfig: options.postgresConfig,
    postgresTls: options.postgresTls,
    instance: options.instance,
    port: options.port,
  })
  if (contract.runtime === 'oci' && (options.sourceRoot || options.foreground === true || options.detach === true)) {
    throw new Error('community_setup_oci_native_options_refused')
  }
  if (options.preview === true && options.apply === true) {
    throw new Error('community_setup_mode_conflict:choose_--preview_or_--apply')
  }
  if (options.preview === true) {
    writeResult({
      status: 'community-server-setup-preview',
      mutationFree: true,
      contract,
      next: contract.runtime === 'native'
        ? 'Re-run with --apply to start the installed npm server package, or build an explicit public checkout supplied with --source-root.'
        : 'Re-run with --apply to verify the signed release and start the OCI stack.',
    }, options.json, options)
    return
  }
  if (options.apply !== true) {
    throw new Error('community_setup_apply_required:use_--preview_or_--apply')
  }

  if (contract.runtime === 'native') {
    await withMutatingCommandScope(dependencies, async (runtime, signal) => {
      const selection = installSelection({ ...options, instance: contract.instanceId })
      const paths = resolveCommunityInstallPaths(selection)
      runtime.ensureInstanceDirectory(paths.instanceRoot)
      assertOwnedInstancePaths(paths, 'allow-missing')
      const instanceIdentity = captureInstanceDirectoryIdentity(paths.instanceRoot)
      const setup = await runtime.withOperationLock(
        { instanceDirectory: paths.instanceRoot, operation: 'setup', signal },
        async ({ receipt }) => {
          throwIfCommunityCommandAborted(signal)
          assertInstanceDirectoryIdentity(instanceIdentity)
          assertOwnedInstancePaths(paths, 'allow-missing')
          const nativePaths = resolveCommunityNativePaths(selection)
          assertCommunityNativePathLayout(nativePaths, { requireInstanceRoot: true })
          const ociInspection = inspectFrom({ ...options, instance: contract.instanceId })
          if (ociInspection.status !== 'not-installed') {
            throw new Error(`community_instance_runtime_conflict:oci_${ociInspection.status}:run_aops-cli_doctor`)
          }
          const nativeInspection = inspectNativeFrom({ ...options, instance: contract.instanceId })
          if (nativeInspection.status === 'partial' || nativeInspection.status === 'runtime-conflict') {
            throw new Error(`community_native_install_${nativeInspection.status}:${nativeInspection.error ?? 'unknown'}:run_doctor`)
          }
          const journalPaths = nativeJournalPathsFrom({ ...options, instance: contract.instanceId })
          assertCommunityOperationJournalFence(journalPaths)
          return runWithOperationJournal({
            paths: journalPaths,
            state: null,
            operation: 'setup',
            receipt,
            signal,
            runtime,
            runtimeMode: 'native',
            callback: ({ journal }) => runCommunityJournaledSideEffect({
              handle: journal,
              step: 'native-setup',
              signal,
              effect: async () => {
                assertInstanceDirectoryIdentity(instanceIdentity)
                const result = await runtime.setupNativeInstall({
                  contract,
                  sourceRoot: options.sourceRoot,
                  dataRoot: selection.dataRoot,
                  mode: resolveCommunityNativeLaunchMode(options),
                  createPostgresSecret: options.createPostgresSecret,
                  signal,
                })
                assertInstanceDirectoryIdentity(instanceIdentity)
                return result
              },
            }),
          })
        },
      )
      throwIfCommunityCommandAborted(signal)
      writeResult({
        status: setup.status === 'created'
          ? 'community-server-installed-and-running'
          : 'community-server-refreshed-and-running',
        runtime: 'native',
        profile: setup.state.profile,
        instance: setup.state.instanceName,
        mode: setup.launch.mode,
        pid: setup.launch.process.pid,
        origin: `http://127.0.0.1:${setup.state.server.port}`,
        dataRoot: setup.paths.dataRoot,
        sourceRoot: setup.state.source.root,
        sourceFingerprint: setup.state.source.sourceFingerprint,
        buildFingerprint: setup.state.build.buildFingerprint,
        migration: nativeMigrationSummary(setup.launch.migration),
        applicationUpdateId: setup.applicationUpdate?.prepared.updateId ?? null,
      }, options.json, options)
      if (setup.launch.waitForExit) await setup.launch.waitForExit()
    })
    return
  }

  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const selection = installSelection(options)
    const nativeExisting = inspectNativeFrom(options)
    if (nativeExisting.status !== 'not-installed') {
      throw new Error(`community_instance_runtime_conflict:native_${nativeExisting.status}:run_aops-cli_doctor`)
    }
    const existing = inspectFrom(options)
    if (existing.status === 'partial') {
      throw new Error(`community_install_partial:${existing.error ?? 'unknown'}:run_aops-cli_doctor_or_server_reset`)
    }
    throwIfCommunityCommandAborted(signal)
    const { assertCurrent, descriptorSource, verified } = await releaseBundle(options, runtime, signal)
    throwIfCommunityCommandAborted(signal)
    await requireHealthyPreflight('setup', options, runtime)
    throwIfCommunityCommandAborted(signal)
    const port = contract.server.port
    const paths = resolveCommunityInstallPaths(selection)
    runtime.ensureInstanceDirectory(paths.instanceRoot)
    assertOwnedInstancePaths(paths, 'allow-missing')
    const result = await runtime.withOperationLock({ instanceDirectory: paths.instanceRoot, operation: 'setup', signal }, async ({ receipt }) => {
      assertCurrent()
      assertOwnedInstancePaths(paths, 'create-missing')
      const lockedInspection = inspectFrom(options)
      const lockedNativeInspection = inspectNativeFrom(options)
      if (lockedNativeInspection.status !== 'not-installed') {
        throw new Error(`community_instance_runtime_conflict:native_${lockedNativeInspection.status}:run_aops-cli_doctor`)
      }
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
            releaseDescriptorSource: descriptorSource,
            certificateIdentity: verified.certificateIdentity,
            verifiedArtifactCount: verified.verifiedArtifactCount,
          }
        },
      })
    })
    throwIfCommunityCommandAborted(signal)
    writeResult(result, options.json, options)
  })
}

export async function runCommunityServerStart(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const native = inspectNativeFrom(options)
    if (native.status === 'installed') {
      const launch = await withNativeOperation(options, 'start', runtime, signal, () => startCommunityNativeInstall({
        ...installSelection(options),
        mode: resolveCommunityNativeLaunchMode(options),
        signal,
      }))
      writeResult({
        status: 'community-server-running',
        runtime: 'native',
        profile: launch.state.profile,
        instance: launch.state.instanceName,
        mode: launch.mode,
        pid: launch.process.pid,
        origin: `http://127.0.0.1:${launch.state.server.port}`,
        sourceFingerprint: launch.state.source.sourceFingerprint,
        buildFingerprint: launch.state.build.buildFingerprint,
        migration: nativeMigrationSummary(launch.migration),
      }, options.json, options)
      if (launch.waitForExit) await launch.waitForExit()
      return
    }
    if (native.status !== 'not-installed') {
      throw new Error(`community_native_start_refused:${native.status}:${native.error ?? 'run_doctor'}`)
    }
    if (options.foreground === true || options.detach === true) {
      throw new Error('community_oci_native_options_refused')
    }
    const result = await withInstalledOperation(options, 'start', runtime, signal, async ({ paths, state }, { lifecycle }) => {
      await lifecycle.verifyRelease(state.activeRelease)
      await lifecycle.pull({ paths, state, release: state.activeRelease })
      await lifecycle.start({ paths, state, release: state.activeRelease, postgresVolumeName: state.postgresVolumeName })
      await lifecycle.health({ paths, state })
      await lifecycle.dataSmoke({ paths, state })
      return { status: 'community-server-running', instance: state.instanceName, imageRef: state.activeRelease.imageRef }
    })
    throwIfCommunityCommandAborted(signal)
    writeResult(result, options.json, options)
  })
}

export async function runCommunityServerStop(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const native = inspectNativeFrom(options)
    if (native.status === 'installed') {
      const stopped = await withNativeOperation(options, 'stop', runtime, signal, () => stopCommunityNativeInstall(
        { ...installSelection(options), signal },
      ))
      writeResult({
        status: stopped.status === 'stopped' ? 'community-server-stopped' : 'community-server-already-stopped',
        runtime: 'native',
        profile: stopped.state.profile,
        instance: stopped.state.instanceName,
        processStatus: stopped.process?.status ?? null,
      }, options.json)
      return
    }
    if (native.status !== 'not-installed') {
      throw new Error(`community_native_stop_refused:${native.status}:${native.error ?? 'run_doctor'}`)
    }
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
    const native = inspectNativeFrom(options)
    if (native.status === 'installed') {
      const launch = await withNativeOperation(options, 'restart', runtime, signal, async () => {
        await stopCommunityNativeInstall({ ...installSelection(options), signal })
        return startCommunityNativeInstall({
          ...installSelection(options),
          mode: resolveCommunityNativeLaunchMode(options),
          signal,
        })
      })
      writeResult({
        status: 'community-server-restarted',
        runtime: 'native',
        profile: launch.state.profile,
        instance: launch.state.instanceName,
        mode: launch.mode,
        pid: launch.process.pid,
        hostPid: launch.process.hostPid ?? null,
        origin: `http://127.0.0.1:${launch.state.server.port}`,
        migration: nativeMigrationSummary(launch.migration),
      }, options.json)
      if (launch.waitForExit) await launch.waitForExit()
      return
    }
    if (native.status !== 'not-installed') {
      throw new Error(`community_native_restart_refused:${native.status}:${native.error ?? 'run_doctor'}`)
    }
    if (options.foreground === true || options.detach === true) {
      throw new Error('community_oci_native_options_refused')
    }
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
  const native = inspectNativeFrom(options)
  if (native.status !== 'not-installed') {
    const recoveryErrors: string[] = []
    let applicationRecovery: ReturnType<typeof inspectCommunityNativeApplicationRecoveryStatus> = null
    let databaseRecovery: ReturnType<typeof inspectCommunityNativeDatabaseRecoveryStatus> = null
    try {
      applicationRecovery = inspectCommunityNativeApplicationRecoveryStatus(native.paths)
    } catch (error) {
      recoveryErrors.push(error instanceof Error ? error.message : String(error))
    }
    try {
      databaseRecovery = inspectCommunityNativeDatabaseRecoveryStatus(native.paths)
    } catch (error) {
      recoveryErrors.push(error instanceof Error ? error.message : String(error))
    }
    const runtime = native.status === 'installed'
      ? await inspectCommunityNativeRuntime(installSelection(options))
      : null
    const postgres = native.status === 'installed' && native.state?.postgres.mode === 'container'
      ? await inspectCommunityNativePostgres({
          state: native.state.postgres,
          instanceName: native.state.instanceName,
          instanceRoot: native.paths.instanceRoot,
        })
      : null
    writeResult({
      status: native.status,
      runtime: 'native',
      profile: native.state?.profile ?? null,
      instanceRoot: native.paths.instanceRoot,
      instance: native.state?.instanceName ?? options.instance ?? 'default',
      origin: native.state ? `http://127.0.0.1:${native.state.server.port}` : null,
      processRecord: runtime?.process ? {
        status: runtime.process.status,
        mode: runtime.process.mode,
        pid: runtime.process.pid,
        hostPid: runtime.process.hostPid ?? null,
        startedAt: runtime.process.startedAt,
        logPath: runtime.process.logPath,
      } : null,
      runtimeState: runtime?.runtimeState ?? null,
      postgres,
      migration: native.migration ? nativeMigrationSummary(native.migration) : null,
      applicationRecovery,
      databaseRecovery,
      recoveryErrors,
      liveness: runtime ? {
        supervisor: runtime.supervisorAlive,
        host: runtime.hostAlive,
        health: runtime.health,
        identityBound: runtime.identity !== null,
        recoverable: runtime.recoverable,
      } : null,
      error: recoveryErrors[0] ?? runtime?.reason ?? native.error ?? null,
      presentFiles: native.presentFiles,
      missingFiles: native.missingFiles,
    }, options.json)
    if (
      native.status !== 'installed' ||
      recoveryErrors.length > 0 ||
      (runtime && ['unhealthy', 'crashed', 'identity-conflict', 'orphaned'].includes(runtime.runtimeState))
    ) process.exitCode = 1
    return
  }
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

export async function runCommunityServerHealth(options: CommunityServerOptions): Promise<void> {
  const native = inspectNativeFrom(options)
  if (native.status === 'installed' && native.state) {
    const observed = await inspectCommunityNativeRuntime(installSelection(options))
    const healthy = observed.runtimeState === 'running' && observed.health === 'healthy'
    writeResult({
      status: healthy ? 'healthy' : 'unhealthy',
      runtime: 'native',
      profile: native.state.profile,
      instance: native.state.instanceName,
      origin: `http://127.0.0.1:${native.state.server.port}`,
      runtimeState: observed.runtimeState,
      supervisor: observed.supervisorAlive,
      host: observed.hostAlive,
      health: observed.health,
      identityBound: observed.identity !== null,
      error: observed.reason ?? null,
    }, options.json)
    if (!healthy) process.exitCode = 1
    return
  }
  if (native.status !== 'not-installed') {
    throw new Error(`community_native_health_refused:${native.status}:${native.error ?? 'run_doctor'}`)
  }
  const inspection = requireInstalled(options)
  try {
    const lifecycle = createCommunityDockerAdapter({ verifyRelease: async () => undefined })
    await lifecycle.health({ paths: inspection.paths, state: inspection.state })
    writeResult({
      status: 'healthy',
      runtime: 'oci',
      instance: inspection.state.instanceName,
      releaseVersion: inspection.state.activeRelease.releaseVersion,
    }, options.json)
  } catch (error) {
    writeResult({
      status: 'unhealthy',
      runtime: 'oci',
      instance: inspection.state.instanceName,
      error: error instanceof Error ? error.message : String(error),
    }, options.json)
    process.exitCode = 1
  }
}

export async function runCommunityServerMigrationPlan(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  const runtime = resolveDependencies(dependencies)
  await withCommunityCommandAbortScope(runtime.commandAbortRuntime, async (signal) => {
    throwIfCommunityCommandAborted(signal)
    const result = await runtime.planNativeMigration({ ...installSelection(options), signal })
    throwIfCommunityCommandAborted(signal)
    writeResult({
      surface: 'community-native-migration-plan',
      mutationFree: true,
      ...result,
    }, options.json)
  })
}

export async function runCommunityServerAttestExternalSnapshot(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const result = await runtime.attestNativeExternalSnapshot({
      ...installSelection(options),
      expectedPlanSha256: String(options.expectedPlanSha256 ?? ''),
      provider: String(options.provider ?? ''),
      snapshotRef: String(options.snapshotRef ?? ''),
      snapshotDigest: options.snapshotDigest,
      attestedBy: String(options.attestedBy ?? ''),
      restoreInstructionsRef: String(options.restoreInstructionsRef ?? ''),
      preview: options.preview,
      apply: options.apply,
      confirmExternalRecoveryOwner: options.confirmExternalRecoveryOwner,
      signal,
    })
    throwIfCommunityCommandAborted(signal)
    writeResult({
      surface: 'community-native-external-snapshot-attestation',
      mutationFree: !result.applied,
      ...result,
      next: result.applied
        ? 'Run aops-cli server start; migration will re-plan under the database lock and consume only this exact attestation.'
        : 'Review this exact plan-bound attestation, then re-run with --apply --confirm-external-recovery-owner.',
    }, options.json)
  })
}

export async function runCommunityServerLogs(options: CommunityServerOptions): Promise<void> {
  const native = inspectNativeFrom(options)
  if (native.status === 'installed') {
    const tail = Number(options.tail ?? 100)
    const logs = readCommunityNativeLogs({ ...installSelection(options), tail })
    if (options.json) writeResult({
      status: 'community-native-logs',
      lineCount: logs.lineCount,
      truncated: logs.truncated,
      logPath: logs.logPath,
      content: logs.content,
    }, true)
    else writeResult(logs.content || 'No detached native server logs are available.')
    return
  }
  if (native.status !== 'not-installed') {
    throw new Error(`community_native_logs_refused:${native.status}:${native.error ?? 'run_doctor'}`)
  }
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
    const nativeInitial = inspectNativeFrom(options)
    if (nativeInitial.status === 'installed' && nativeInitial.state) {
      if (!options.sourceRoot) {
        throw new Error('community_native_update_source_root_required')
      }
      const setup = await withNativeOperation(options, 'update', runtime, signal, async (locked) => {
        const state = locked.state!
        const contract = buildCommunityInstanceContract({
          runtime: 'native',
          postgres: state.postgres.mode,
          postgresConfig: state.postgres.mode === 'external' ? state.postgres.configRef : undefined,
          postgresTls: state.postgres.mode === 'external' ? state.postgres.tlsPolicy : undefined,
          instance: state.instanceName,
          port: state.server.port,
        })
        return runtime.setupNativeInstall({
          contract,
          sourceRoot: options.sourceRoot,
          dataRoot: locked.paths.dataRoot,
          mode: resolveCommunityNativeLaunchMode(options),
          requireApplicationUpdate: true,
          signal,
        })
      })
      if (!setup.applicationUpdate) throw new Error('community_native_application_update_record_missing')
      throwIfCommunityCommandAborted(signal)
      writeResult({
        status: 'community-native-application-updated',
        updateId: setup.applicationUpdate.prepared.updateId,
        priorReleaseVersion: setup.applicationUpdate.prepared.prior.content.releaseVersion,
        releaseVersion: setup.applicationUpdate.prepared.target.content.releaseVersion,
        applicationContentSha256: setup.applicationUpdate.prepared.target.content.applicationContentSha256,
        databaseAction: setup.launch.migration.action,
        databasePlanSha256: setup.launch.migration.acceptedPlanSha256,
        databaseRewound: false,
      }, options.json)
      if (setup.launch.waitForExit) await setup.launch.waitForExit()
      return
    }
    if (nativeInitial.status !== 'not-installed') {
      throw new Error(`community_native_update_refused:${nativeInitial.status}:${nativeInitial.error ?? 'run_doctor'}`)
    }
    const initial = requireInstalled(options)
    assertOwnedInstancePaths(initial.paths, 'require-existing')
    const { assertCurrent, descriptorSource, verified } = await releaseBundle(options, runtime, signal)
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
        assertCurrent()
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
      releaseDescriptorSource: descriptorSource,
      certificateIdentity: verified.certificateIdentity,
      verifiedArtifactCount: verified.verifiedArtifactCount,
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

export async function runCommunityServerRollbackApplication(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  if (!options.updateId) throw new Error('community_native_application_rollback_update_id_required')
  if (!options.sourceRoot) throw new Error('community_native_application_rollback_source_root_required')
  if (options.confirmDataRewind === true) {
    throw new Error('community_native_application_rollback_data_rewind_option_refused')
  }
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const result = await withNativeOperation(options, 'rollback', runtime, signal, async (locked) =>
      runtime.rollbackNativeApplication({
        instanceName: locked.state!.instanceName,
        dataRoot: locked.paths.dataRoot,
        updateId: options.updateId!,
        sourceRoot: options.sourceRoot!,
        mode: resolveCommunityNativeLaunchMode(options),
        signal,
      }))
    throwIfCommunityCommandAborted(signal)
    const rollback = result.applicationUpdate.rollbackOutcome
    if (!rollback || rollback.status !== 'community-native-application-rolled-back') {
      throw new Error('community_native_application_rollback_receipt_missing')
    }
    writeResult({
      status: rollback.status,
      updateId: result.applicationUpdate.prepared.updateId,
      rollbackId: rollback.rollbackId,
      releaseVersion: result.state.source.releaseVersion,
      applicationContentSha256:
        result.applicationUpdate.prepared.prior.content.applicationContentSha256,
      databaseAction: rollback.migration?.action,
      databasePlanSha256: rollback.migration?.acceptedPlanSha256,
      databaseRewound: false,
    }, options.json)
    if (result.launch.waitForExit) await result.launch.waitForExit()
  })
}

export async function runCommunityServerRestoreDatabase(
  options: CommunityServerOptions,
  dependencies: CommunityServerDependencies = {},
): Promise<void> {
  if (!options.updateId) throw new Error('community_native_database_restore_update_id_required')
  if (!options.sourceRoot) throw new Error('community_native_database_restore_source_root_required')
  if (options.confirmDataRewind !== true) {
    throw new Error('community_native_database_restore_confirmation_required')
  }
  await withMutatingCommandScope(dependencies, async (runtime, signal) => {
    const result = await withNativeOperation(options, 'restore', runtime, signal, async (locked) => {
      const observed = await inspectCommunityNativeRuntime({
        instanceName: locked.state!.instanceName,
        dataRoot: locked.paths.dataRoot,
      })
      if (observed.runtimeState !== 'stopped' && observed.runtimeState !== 'crashed') {
        throw new Error(`community_native_process_active:${observed.runtimeState}:run_server_stop_before_database_restore`)
      }
      return runtime.restoreNativeDatabase({
        paths: locked.paths,
        state: locked.state!,
        updateId: options.updateId!,
        sourceRoot: path.resolve(options.sourceRoot!),
        confirmDataRewind: true,
        confirmExternalRestoreComplete: options.confirmExternalRestoreComplete === true,
        signal,
      })
    })
    throwIfCommunityCommandAborted(signal)
    if (result.actionRequired) {
      writeResult({
        status: 'community-native-database-restore-external-action-required',
        restoreId: result.prepared.restoreId,
        updateId: result.prepared.updateId,
        recoveryOwner: result.prepared.recoveryOwner,
        evidenceKind: result.prepared.evidenceKind,
        evidenceSha256: result.prepared.evidenceSha256,
        provider: result.externalAction?.provider,
        snapshotRef: result.externalAction?.snapshotRef,
        snapshotDigest: result.externalAction?.snapshotDigest,
        restoreInstructionsRef: result.externalAction?.restoreInstructionsRef,
        nextCommand: 'Repeat server restore db with the same arguments plus --confirm-external-restore-complete after the external restore is complete',
        dataRewound: false,
      }, options.json)
      return
    }
    if (!result.completed) throw new Error('community_native_database_restore_receipt_missing')
    writeResult({
      status: result.completed.status,
      restoreId: result.completed.restoreId,
      updateId: result.completed.updateId,
      recoveryOwner: result.completed.recoveryOwner,
      evidenceKind: result.completed.evidenceKind,
      evidenceSha256: result.completed.evidenceSha256,
      restoredLineageId: result.completed.restoredLineageId,
      restoredStateFingerprintSha256: result.completed.restoredStateFingerprintSha256,
      dataRewound: result.dataRewound,
      applicationChanged: false,
      nextCommand: 'Run server rollback app with the exact update ID and prior source checkout',
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
  'acknowledge-native-runtime-state',
  'restore-source-runtime',
  'acknowledge-artifact-preserved',
  'acknowledge-partial-install-preserved',
  'complete-reset-preserving-volumes',
  'complete-native-reset-preserving-volume',
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
  const basePaths = pathsFrom(options)
  const inspection = inspectCommunityOperationJournalFile(basePaths, options.operationId)
  const paths = journalPathsForMode(options, inspection.record.runtimeMode)
  const currentDigests = captureCommunityOperationDigests(paths)
  writeResult({
    surface: 'community-operation-status',
    instance: options.instance ?? 'default',
    operationId: inspection.record.id,
    operation: inspection.record.operation,
    runtimeMode: inspection.record.runtimeMode,
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
    recoveryCommitPending: inspection.record.runtimeMode === 'oci' && Boolean(tryLstat(paths.recoveryJournalPath)),
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
    if (record.runtimeMode === 'oci') {
      assertNoCommunityRecoveryCommitJournal(paths)
      assertCommunityLedgerHasNoNonterminalOperation(paths)
    }
    return { action, sideEffectAcknowledged: false }
  }
  if (action === 'acknowledge-native-runtime-state') {
    if (record.runtimeMode !== 'native') {
      throw new Error('community_native_operation_reconciliation_mode_mismatch')
    }
    const native = inspectNativeFrom(options)
    if (native.status !== 'installed' || !native.state) {
      throw new Error(`community_native_operation_reconciliation_requires_install:${native.status}`)
    }
    assertCommunityNativePathLayout(native.paths, { requireInstanceRoot: true })
    const observed = await inspectCommunityNativeRuntime({
      ...installSelection(options),
    })
    if (observed.runtimeState === 'identity-conflict' || observed.runtimeState === 'orphaned') {
      throw new Error(`community_native_operation_reconciliation_runtime_unsafe:${observed.runtimeState}`)
    }
    return {
      action,
      nativeProfile: native.state.profile,
      runtimeState: observed.runtimeState,
      health: observed.health,
      statePreserved: true,
    }
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
  if (action === 'complete-native-reset-preserving-volume') {
    const instance = (options.instance ?? 'default').trim().toLowerCase()
    if (record.runtimeMode !== 'native' ||
        options.confirmDataLoss !== true || options.confirmInstance !== instance) {
      throw new Error('community_native_operation_reset_reconciliation_confirmation_required')
    }
    const native = inspectNativeFrom({ ...options, instance })
    if (native.status === 'runtime-conflict') {
      throw new Error('community_native_operation_reset_reconciliation_runtime_conflict')
    }
    if (native.status === 'installed') {
      const observed = await inspectCommunityNativeRuntime({ ...installSelection({ ...options, instance }) })
      if (observed.supervisorAlive || observed.hostAlive) {
        if (observed.runtimeState === 'running' || observed.runtimeState === 'starting' || observed.runtimeState === 'unhealthy') {
          await stopCommunityNativeInstall({ ...installSelection({ ...options, instance }), signal })
        } else {
          throw new Error(`community_native_operation_reset_live_process_refused:${observed.runtimeState}`)
        }
      }
    }
    throwIfCommunityCommandAborted(signal)
    const hasManagedPostgres =
      (native.status === 'installed' && native.state?.profile === 'native-container-postgres') ||
      existsSync(path.join(paths.runtimeRoot, 'native-postgres.env'))
    const postgres = hasManagedPostgres
      ? await runtime.removeNativePostgresContainerForReset({
          instanceName: instance,
          instanceRoot: paths.instanceRoot,
          signal,
        })
      : null
    throwIfCommunityCommandAborted(signal)
    removeNativeInstanceContentsPreservingPostgres(paths.instanceRoot)
    return {
      action,
      instance,
      rootPreserved: true,
      postgresContainerPreserved: false,
      postgresContainer: postgres?.container ?? 'not-managed',
      postgresContainerName: postgres?.containerName ?? null,
      postgresVolumePreserved: true,
      postgresVolumeName: postgres?.volumeName ?? null,
      postgresSecretPreserved: hasManagedPostgres,
    }
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
    const basePaths = pathsFrom(options)
    assertInstanceDirectory(basePaths.instanceRoot)
    const initial = inspectCommunityOperationJournalFile(basePaths, selection.operationId)
    const paths = journalPathsForMode(options, initial.record.runtimeMode)
    if (initial.record.operation !== selection.expectedOperation ||
        !initial.record.permittedActions.includes(selection.action) ||
        ['succeeded', 'reconciled'].includes(initial.record.status)) {
      throw new Error('community_operation_reconciliation_identity_mismatch')
    }
    const output = await runtime.withOperationLock(
      { instanceDirectory: paths.instanceRoot, operation: selection.expectedOperation, signal },
      async () => {
        const lockedPaths = journalPathsForMode(options, initial.record.runtimeMode)
        assertSameInstancePaths(paths, lockedPaths)
        if (initial.record.runtimeMode === 'oci') assertNoCommunityRecoveryCommitJournal(lockedPaths)
        else assertCommunityNativePathLayout(resolveCommunityNativePaths(installSelection(options)), { requireInstanceRoot: true })
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
    const native = inspectNativeFrom(resetOptions)
    if (native.status === 'installed' && native.state) {
      if (native.state.profile === 'native-container-postgres' && options.removeManagedPostgres !== true) {
        throw new Error('community_native_container_reset_refused:use_--remove-managed-postgres_to_delete_the_label_verified_database')
      }
      const expectedRoot = pathsFrom(resetOptions).instanceRoot
      if (!isSamePhysicalPath(path.resolve(expectedRoot), path.resolve(native.paths.instanceRoot))) {
        throw new Error('community_reset_path_mismatch')
      }
      assertInstanceDirectory(expectedRoot)
      const output = await runtime.withOperationLock(
        { instanceDirectory: expectedRoot, operation: 'reset', signal },
        async () => {
          const lockedNative = inspectNativeFrom(resetOptions)
          if (lockedNative.status !== 'installed' || !lockedNative.state) {
            throw new Error(`community_native_install_changed:${lockedNative.status}:${lockedNative.error ?? 'unknown'}`)
          }
          if (
            lockedNative.state.profile === 'native-container-postgres' &&
            options.removeManagedPostgres !== true
          ) {
            throw new Error('community_native_container_reset_refused:use_--remove-managed-postgres_to_delete_the_label_verified_database')
          }
          if (
            lockedNative.state.profile !== 'native-external-postgres' &&
            lockedNative.state.profile !== 'native-container-postgres'
          ) {
            throw new Error('community_native_reset_profile_invalid')
          }
          const lockedOci = inspectFrom(resetOptions)
          if (lockedOci.status !== 'not-installed') {
            throw new Error(`community_instance_runtime_conflict:oci_${lockedOci.status}:run_aops-cli_doctor`)
          }
          await stopCommunityNativeInstall({ ...installSelection(resetOptions), signal })
          throwIfCommunityCommandAborted(signal)
          const postgres = lockedNative.state.profile === 'native-container-postgres'
            ? await runtime.removeNativeManagedPostgres({
                instanceName: instance,
                instanceRoot: expectedRoot,
                signal,
              })
            : null
          throwIfCommunityCommandAborted(signal)
          removeInstanceContentsExceptLock(expectedRoot)
          return {
            status: 'community-install-reset',
            runtime: 'native',
            instance,
            instanceRoot: expectedRoot,
            rootPreserved: true,
            managedPostgresRemoved: postgres !== null,
            postgres,
          }
        },
      )
      writeResult(output, options.json)
      return
    }
    if (native.status !== 'not-installed') {
      throw new Error(`community_native_reset_refused:${native.status}:${native.error ?? 'run_doctor'}`)
    }
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

function mergeCommunityCommandOptions(
  options: CommunityServerOptions,
  command: Command,
): CommunityServerOptions {
  return {
    ...(typeof command.optsWithGlobals === 'function' ? command.optsWithGlobals() : {}),
    ...options,
  }
}

function releaseOptions(command: Command): Command {
  return command
    .option('--repo <path>', 'Local tagged aops-community clone override; default is the exact published CLI version tag')
    .option('--release-dir <path>', 'Local complete signed release-bundle override')
    .option('--release-descriptor <path>', 'Offline release.json path; verifies only adjacent signature and Compose files without fetching release metadata')
    .option('--certificate-identity <identity>', 'Trusted GitHub Actions certificate identity')
    .option('--certificate-oidc-issuer <url>', 'Trusted certificate OIDC issuer')
}

export type CommunityServerCommandIdentity = Readonly<Pick<CommunityServerDependencies, 'cliVersion'>>

export function makeCommunityServerCommand(identity: CommunityServerCommandIdentity = {}): Command {
  const dependencies: CommunityServerDependencies = { cliVersion: identity.cliVersion }
  const command = new Command('server').description('Configure and operate a named AOPS Community server instance')
  common(releaseOptions(command.command('setup').description('Configure and start an npm-package, source-checkout, or OCI server profile')))
    .requiredOption('--runtime <native|oci>', 'Application runtime; no implicit default')
    .option('--postgres <external|container>', 'PostgreSQL owner for --runtime native')
    .option('--postgres-config <path>', 'Explicit external PostgreSQL env-file override; default: ~/.aops/aops.server.env (or AOPS_CLI_CONFIG_PATH directory)')
    .option('--postgres-tls <disable|require|verify-full>', 'Explicit external PostgreSQL TLS policy')
    .option('--source-root <path>', 'Optional public aops-community checkout root; defaults to the installed @aopslab/aops-server package')
    .option('--port <number>', 'Host port', '5900')
    .option('--foreground', 'Keep the native server attached to this terminal')
    .option('--detach', 'Start the native server in the background (default)')
    .option('--preview', 'Validate and print the setup contract without mutation')
    .option('--apply', 'Apply the selected setup contract')
    .action((options) => runCommunityServerSetup(options, dependencies))
  common(command.command('start').alias('up').description('Start the installed native npm/source host or OCI stack'))
    .option('--foreground', 'Keep the native server attached to this terminal')
    .option('--detach', 'Start the native server in the background (default)')
    .action((options) => runCommunityServerStart(options, dependencies))
  common(command.command('stop').alias('down').description('Stop the server without deleting data'))
    .action((options) => runCommunityServerStop(options, dependencies))
  common(command.command('restart').description('Restart the installed server'))
    .option('--foreground', 'Keep the restarted native server attached to this terminal')
    .option('--detach', 'Restart the native server in the background (default)')
    .action((options) => runCommunityServerRestart(options, dependencies))
  common(command.command('status').description('Show install and runtime status')).action(runCommunityServerStatus)
  common(command.command('health').description('Check the installed server health without mutation')).action(runCommunityServerHealth)
  common(command.command('migration-plan').description('Read the exact pending native database migration plan without mutation'))
    .action((options) => runCommunityServerMigrationPlan(options, dependencies))
  common(command.command('attest-external-snapshot').description('Bind an operator-owned external PostgreSQL snapshot to one exact migration plan'))
    .requiredOption('--expected-plan-sha256 <digest>', 'Exact raw plan SHA-256 returned by server migration-plan')
    .requiredOption('--provider <name>', 'External snapshot provider or platform')
    .requiredOption('--snapshot-ref <reference>', 'Immutable external snapshot reference')
    .option('--snapshot-digest <sha256:digest>', 'Optional immutable snapshot content digest')
    .requiredOption('--attested-by <identity>', 'Operator identity accepting external recovery ownership')
    .requiredOption('--restore-instructions-ref <reference>', 'Durable runbook or restore-instructions reference')
    .option('--preview', 'Validate and print the exact attestation without writing it')
    .option('--apply', 'Write the immutable plan-bound attestation')
    .option('--confirm-external-recovery-owner', 'Confirm that restore execution remains externally owned')
    .action((options) => runCommunityServerAttestExternalSnapshot(options, dependencies))
  common(command.command('logs').description('Show recent server logs'))
    .option('--tail <number>', 'Number of log lines', '100')
    .action(runCommunityServerLogs)
  common(releaseOptions(command.command('update').description('Update an installed native application or OCI stack')))
    .option('--source-root <path>', 'Distinct exact public checkout for a native application update')
    .option('--foreground', 'Keep the updated native server attached to this terminal')
    .option('--detach', 'Start the updated native server in the background (default)')
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
  const rollback = common(command.command('rollback').description('Rollback application code; legacy flat form remains OCI-only until P4'))
    .option('--confirm-data-rewind', 'Confirm that data will be rewound to the pre-update backup')
    .action((options) => runCommunityServerRollback(options, dependencies))
  common(rollback.command('app').description('Rollback only native application code; never restore or rewind PostgreSQL'))
    .requiredOption('--update-id <id>', 'Exact native application update ID')
    .requiredOption('--source-root <path>', 'Exact prior public release checkout; the CLI never downloads or changes it')
    .option('--foreground', 'Keep the rolled-back native server attached to this terminal')
    .option('--detach', 'Start the rolled-back native server in the background (default)')
    .action((options: CommunityServerOptions, child: Command) =>
      runCommunityServerRollbackApplication(mergeCommunityCommandOptions(options, child), dependencies))
  common(command.command('backup').description('Create and verify a custom-format PostgreSQL backup plus receipt'))
    .action((options) => runCommunityServerBackup(options, dependencies))
  const restore = common(command.command('restore').description('Restore database data; legacy flat form remains OCI-only until P4'))
    .option('--backup <path>', 'Backup dump path; its JSON receipt must exist beside it')
    .option('--confirm-data-rewind', 'Confirm that data will be rewound to the selected backup')
    .action((options) => runCommunityServerRestore(options, dependencies))
  common(restore.command('db').description('Restore only PostgreSQL for one exact native application update'))
    .requiredOption('--update-id <id>', 'Exact native application update ID whose snapshot evidence will be used')
    .requiredOption('--source-root <path>', 'Exact prior public release checkout used to verify the restored database')
    .option('--confirm-data-rewind', 'Confirm that PostgreSQL data may rewind to the exact pre-update snapshot')
    .option('--confirm-external-restore-complete', 'Confirm an externally owned restore is complete and request strict verification')
    .action((options: CommunityServerOptions, child: Command) =>
      runCommunityServerRestoreDatabase(mergeCommunityCommandOptions(options, child), dependencies))
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
  common(command.command('reset').description('Remove local installation state; managed PostgreSQL is deleted only when explicitly requested'))
    .requiredOption('--confirm-instance <name>', 'Repeat the instance name')
    .option('--confirm-data-loss', 'Confirm removal of the installation state and its active data pointer')
    .option('--remove-managed-postgres', 'Also delete the exact ownership-label-verified managed PostgreSQL container and volume')
    .action((options) => runCommunityServerReset(options, dependencies))
  return command
}
