import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  existsSync,
  createReadStream,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { throwIfCommunityCommandAborted } from './community-command-abort.js'
import { assertCommunityOperationJournalFence } from './community-operation-journal.js'
import {
  runCommunityJournaledPromotion,
  type CommunityOperationJournalHandle,
} from './community-operation-journal.js'
import type { CommunityOperation, CommunityOperationLockReceipt } from './community-operation-lock.js'

const SHA256 = /^sha256:[a-f0-9]{64}$/
const INSTANCE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export type CommunityRelease = {
  schemaVersion: 1
  releaseVersion: string
  image: {
    repository: string
    tag: string
    indexDigest: string
  }
  compose: {
    ref: string
    sha256: string
  }
  migrations: {
    setDigest: string
    tags: string[]
  }
}

export type CommunityReleaseIdentity = {
  releaseVersion: string
  imageRef: string
  imageIndexDigest: string
  migrationSetDigest: string
  migrationTags: string[]
  manifestSha256: string
  composeSha256: string
}

export type CommunityInstalledRelease = CommunityReleaseIdentity & {
  manifestPath: string
  composePath: string
}

export type CommunityBackupRecord = {
  path: string
  sha256: string
  byteLength: number
  verified: true
  createdAt: string
  sourceRelease: CommunityInstalledRelease
}

export type CommunityUpdateRecord = {
  id: string
  status: 'started' | 'succeeded' | 'failed' | 'recovery-started' | 'recovery-failed' | 'recovered' | 'rolled-back'
  startedAt: string
  finishedAt?: string
  priorRelease: CommunityInstalledRelease
  targetRelease: CommunityInstalledRelease
  backup: CommunityBackupRecord
  sourcePostgresVolumeName: string
  failure?: string
  migrationMayHaveStarted?: boolean
  replacementVolumeName?: string
  recoveredUpdateId?: string
  volumeClaimSha256?: string
}

export type CommunityPostgresVolumeClaim = {
  schemaVersion: 1
  name: string
  installId: string
  operationId: string
  claimTokenSha256: string
}

export type CommunityVerifiedBackupSnapshot = {
  path: string
  sourcePath: string
  sha256: string
  byteLength: number
  fd: number
  device: string
  inode: string
}

export type CommunityBackupSnapshotRuntime = Readonly<{
  /** Narrow race-injection seam for path-identity tests. Normal callers must not provide it. */
  beforeFinalVerification?: (snapshotPath: string) => void
  /** Narrow post-verification race seam. Normal callers must not provide it. */
  afterFinalVerification?: (snapshotPath: string) => void
}>

export type CommunityRecoveryCommitRuntime = {
  writeEnv?: (filePath: string, content: string) => void
  writeState?: (filePath: string, content: string) => void
  writeLedger?: (filePath: string, content: string) => void
}

export type CommunityInstallState = {
  schemaVersion: 1
  instanceName: string
  installId: string
  composeProjectName: string
  postgresVolumeName: string
  createdAt: string
  updatedAt: string
  activeRelease: CommunityInstalledRelease
  previousRelease: CommunityInstalledRelease | null
  lastSuccessfulUpdateId: string | null
}

export type CommunityInstallPaths = {
  dataRoot: string
  instanceRoot: string
  runtimeRoot: string
  releaseCacheRoot: string
  backupRoot: string
  statePath: string
  envPath: string
  composePath: string
  releasePath: string
  ledgerPath: string
  recoveryJournalPath: string
  operationJournalRoot: string
}

export type CommunityLifecycleAdapter = {
  verifyRelease: (release: CommunityInstalledRelease) => Promise<void>
  createBackup: (params: {
    paths: CommunityInstallPaths
    state: CommunityInstallState
  }) => Promise<CommunityBackupRecord>
  stop: (params: { paths: CommunityInstallPaths; state: CommunityInstallState }) => Promise<void>
  pull: (params: {
    paths: CommunityInstallPaths
    state: CommunityInstallState
    release: CommunityInstalledRelease
  }) => Promise<void>
  start: (params: {
    paths: CommunityInstallPaths
    state: CommunityInstallState
    release: CommunityInstalledRelease
    postgresVolumeName: string
  }) => Promise<void>
  health: (params: { paths: CommunityInstallPaths; state: CommunityInstallState }) => Promise<void>
  dataSmoke: (params: { paths: CommunityInstallPaths; state: CommunityInstallState }) => Promise<void>
  claimFreshPostgresVolume: (params: {
    paths: CommunityInstallPaths
    state: CommunityInstallState
    claim: CommunityPostgresVolumeClaim
  }) => Promise<void>
  restoreBackup: (params: {
    paths: CommunityInstallPaths
    state: CommunityInstallState
    backup: CommunityBackupRecord
    snapshot: CommunityVerifiedBackupSnapshot
    volumeClaim: CommunityPostgresVolumeClaim
  }) => Promise<void>
}

async function runLifecyclePromotion<T>(params: {
  journal?: CommunityOperationJournalHandle
  signal?: AbortSignal
  step: string
  promote: () => Promise<T> | T
}): Promise<T> {
  if (params.journal) {
    return runCommunityJournaledPromotion({
      handle: params.journal,
      step: params.step,
      signal: params.signal,
      promote: params.promote,
    })
  }
  throwIfCommunityCommandAborted(params.signal)
  const result = await params.promote()
  throwIfCommunityCommandAborted(params.signal)
  return result
}

export type CommunityComposeInvocation = {
  command: 'docker'
  args: string[]
  env: Record<string, string>
}

function sha256(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function redactCommunityDiagnostic(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw
    .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@')
    .replace(/((?:password|passwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/(--(?:password|passwd|secret|token|api[_-]?key)\s+)[^\s]+/gi, '$1[REDACTED]')
    .replace(/(\bBearer\s+)[A-Za-z0-9._~+/-]+/gi, '$1[REDACTED]')
    .replace(/("(?:password|passwd|secret|token|apiKey|authorization)"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2')
    .slice(0, 1000)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function assertCommunityPostgresVolumeName(
  state: CommunityInstallState,
  volumeName: string,
): void {
  if (typeof volumeName !== 'string' || volumeName.length > 180) {
    throw new Error('community_postgres_volume_identity_invalid')
  }
  const project = escapeRegex(state.composeProjectName)
  const allowed = new RegExp(
    `^${project}-pg-(?:1|restore-[a-f0-9]{32}|(?:recover|rollback)-[a-f0-9]{32}-[a-f0-9]{32})$`,
  )
  if (!allowed.test(volumeName)) throw new Error('community_postgres_volume_identity_invalid')
}

function assertCommunityPostgresVolumeClaim(
  state: CommunityInstallState,
  claim: CommunityPostgresVolumeClaim,
): void {
  if (claim?.schemaVersion !== 1 || claim.installId !== state.installId || !UUID.test(claim.operationId)) {
    throw new Error('community_postgres_volume_claim_invalid')
  }
  assertDigest(claim.claimTokenSha256, 'community_postgres_volume_claim_invalid')
  assertCommunityPostgresVolumeName(state, claim.name)
}

function createPostgresVolumeClaim(
  state: CommunityInstallState,
  name: string,
  operationId: string,
): CommunityPostgresVolumeClaim {
  if (!UUID.test(operationId)) throw new Error('community_postgres_volume_claim_invalid')
  const claim: CommunityPostgresVolumeClaim = {
    schemaVersion: 1,
    name,
    installId: state.installId,
    operationId,
    claimTokenSha256: sha256(randomBytes(32)),
  }
  assertCommunityPostgresVolumeClaim(state, claim)
  return claim
}

function nowIso(now: () => Date): string {
  return now().toISOString()
}

function assertAbsolute(value: string, code: string): string {
  if (!path.isAbsolute(value)) throw new Error(code)
  return path.resolve(value)
}

function isErrno(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === code
}

function isSamePhysicalPath(left: string, right: string): boolean {
  return path.relative(left, right) === '' && path.relative(right, left) === ''
}

function tryLstat(candidate: string) {
  try {
    return lstatSync(candidate)
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return undefined
    throw error
  }
}

function assertCanonicalDirectory(directoryPath: string, code: string): string {
  const resolved = path.resolve(directoryPath)
  const stat = tryLstat(resolved)
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(code)
  const canonical = realpathSync.native(resolved)
  if (!isSamePhysicalPath(resolved, canonical)) throw new Error(code)
  return canonical
}

function ensureCanonicalDirectoryChain(directoryPath: string, code: string): string {
  const resolvedTarget = path.resolve(directoryPath)
  const missingSegments: string[] = []
  let existingAncestor = resolvedTarget
  let stat = tryLstat(existingAncestor)
  while (!stat) {
    const parent = path.dirname(existingAncestor)
    if (isSamePhysicalPath(parent, existingAncestor)) throw new Error(code)
    missingSegments.unshift(path.basename(existingAncestor))
    existingAncestor = parent
    stat = tryLstat(existingAncestor)
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(code)
  let canonicalParent = realpathSync.native(existingAncestor)
  if (!isSamePhysicalPath(existingAncestor, canonicalParent)) throw new Error(code)
  for (const segment of missingSegments) {
    const child = path.join(canonicalParent, segment)
    if (!isSamePhysicalPath(path.dirname(child), canonicalParent)) throw new Error(code)
    try {
      mkdirSync(child, { mode: 0o700 })
    } catch (error) {
      if (!isErrno(error, 'EEXIST')) throw error
    }
    const childStat = tryLstat(child)
    if (!childStat || childStat.isSymbolicLink() || !childStat.isDirectory()) throw new Error(code)
    const canonicalChild = realpathSync.native(child)
    if (!isSamePhysicalPath(child, canonicalChild) ||
        !isSamePhysicalPath(path.dirname(canonicalChild), canonicalParent)) {
      throw new Error(code)
    }
    canonicalParent = canonicalChild
  }
  if (!isSamePhysicalPath(canonicalParent, resolvedTarget)) throw new Error(code)
  return canonicalParent
}

function ensureCanonicalDirectChildDirectory(parentPath: string, childPath: string, code: string): string {
  const canonicalParent = assertCanonicalDirectory(parentPath, code)
  const resolvedChild = path.resolve(childPath)
  if (!isSamePhysicalPath(path.dirname(resolvedChild), canonicalParent)) throw new Error(code)
  let stat = tryLstat(resolvedChild)
  if (!stat) {
    try {
      mkdirSync(resolvedChild, { mode: 0o700 })
    } catch (error) {
      if (!isErrno(error, 'EEXIST')) throw error
    }
    stat = tryLstat(resolvedChild)
  }
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(code)
  const canonicalChild = realpathSync.native(resolvedChild)
  if (!isSamePhysicalPath(resolvedChild, canonicalChild) ||
      !isSamePhysicalPath(path.dirname(canonicalChild), canonicalParent)) {
    throw new Error(code)
  }
  return canonicalChild
}

function assertCanonicalDirectChildRegularFile(parentPath: string, filePath: string, code: string): string {
  const canonicalParent = assertCanonicalDirectory(parentPath, code)
  const resolvedFile = path.resolve(filePath)
  if (!isSamePhysicalPath(path.dirname(resolvedFile), canonicalParent)) throw new Error(code)
  const stat = tryLstat(resolvedFile)
  if (!stat || stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw new Error(code)
  const canonicalFile = realpathSync.native(resolvedFile)
  if (!isSamePhysicalPath(resolvedFile, canonicalFile) ||
      !isSamePhysicalPath(path.dirname(canonicalFile), canonicalParent)) {
    throw new Error(code)
  }
  return canonicalFile
}

function writeCanonicalDirectChildFileCreateOnce(
  parentPath: string,
  filePath: string,
  content: string,
  mode: number | undefined,
  code: string,
): void {
  const canonicalParent = assertCanonicalDirectory(parentPath, code)
  const resolvedFile = path.resolve(filePath)
  if (!isSamePhysicalPath(path.dirname(resolvedFile), canonicalParent)) throw new Error(code)
  writeFileSync(resolvedFile, content, { encoding: 'utf8', flag: 'wx', mode })
  assertCanonicalDirectChildRegularFile(canonicalParent, resolvedFile, code)
}

function assertOwnedBackupFile(paths: CommunityInstallPaths, filePath: string): string {
  const absolute = assertAbsolute(filePath, 'community_backup_absolute_path_required')
  const canonicalRoot = assertCanonicalDirectory(paths.backupRoot, 'community_backup_root_unsafe')
  if (!isSamePhysicalPath(path.dirname(absolute), canonicalRoot)) {
    throw new Error('community_backup_outside_instance')
  }
  return assertCanonicalDirectChildRegularFile(canonicalRoot, absolute, 'community_backup_file_invalid')
}

type StableFileIdentity = {
  device: string
  inode: string
  byteLength: number
  modifiedNs: string
  changedNs: string
}

function fileDescriptorIdentity(fd: number): StableFileIdentity {
  const stat = fstatSync(fd, { bigint: true })
  if (!stat.isFile() || stat.nlink !== 1n || stat.size <= 0n || stat.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('community_backup_file_invalid')
  }
  return {
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    byteLength: Number(stat.size),
    modifiedNs: stat.mtimeNs.toString(),
    changedNs: stat.ctimeNs.toString(),
  }
}

function pathIdentity(filePath: string): StableFileIdentity {
  const stat = lstatSync(filePath, { bigint: true })
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1n ||
      stat.size <= 0n || stat.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('community_backup_file_invalid')
  }
  return {
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    byteLength: Number(stat.size),
    modifiedNs: stat.mtimeNs.toString(),
    changedNs: stat.ctimeNs.toString(),
  }
}

function sameStableFileIdentity(left: StableFileIdentity, right: StableFileIdentity): boolean {
  return left.device === right.device
    && left.inode === right.inode
    && left.byteLength === right.byteLength
    && left.modifiedNs === right.modifiedNs
    && left.changedNs === right.changedNs
}

function createVerifiedBackupSnapshot(
  paths: CommunityInstallPaths,
  backup: CommunityBackupRecord,
  operationId: string,
  runtime: CommunityBackupSnapshotRuntime = {},
): CommunityVerifiedBackupSnapshot {
  const sourcePath = assertOwnedBackupFile(paths, backup.path)
  if (!UUID.test(operationId)) throw new Error('community_backup_snapshot_operation_id_invalid')
  const snapshotPath = path.join(paths.backupRoot, `.restore-${operationId.replace(/-/g, '')}.snapshot`)
  const sourceFd = openSync(sourcePath, constants.O_RDONLY)
  let destinationFd: number | undefined
  let createdSnapshotNode: { device: string; inode: string } | undefined
  try {
    const sourceBefore = fileDescriptorIdentity(sourceFd)
    if (!sameStableFileIdentity(sourceBefore, pathIdentity(sourcePath))) {
      throw new Error('community_backup_path_identity_changed')
    }
    destinationFd = openSync(
      snapshotPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR,
      0o600,
    )
    const createdStat = fstatSync(destinationFd, { bigint: true })
    createdSnapshotNode = { device: createdStat.dev.toString(), inode: createdStat.ino.toString() }
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(64 * 1024)
    let readPosition = 0
    while (true) {
      const readLength = readSync(sourceFd, buffer, 0, buffer.length, readPosition)
      if (readLength === 0) break
      hash.update(buffer.subarray(0, readLength))
      let written = 0
      while (written < readLength) {
        written += writeSync(destinationFd, buffer, written, readLength - written, readPosition + written)
      }
      readPosition += readLength
    }
    fsyncSync(destinationFd)

    const sourceAfter = fileDescriptorIdentity(sourceFd)
    const sourceAtPath = pathIdentity(sourcePath)
    if (!sameStableFileIdentity(sourceBefore, sourceAfter) ||
        !sameStableFileIdentity(sourceAfter, sourceAtPath)) {
      throw new Error('community_backup_path_identity_changed')
    }
    const observedDigest = `sha256:${hash.digest('hex')}`
    if (readPosition !== backup.byteLength || sourceAfter.byteLength !== backup.byteLength) {
      throw new Error('community_backup_snapshot_length_mismatch')
    }
    if (observedDigest !== backup.sha256) throw new Error('community_backup_snapshot_digest_mismatch')

    const snapshotIdentity = fileDescriptorIdentity(destinationFd)
    if (snapshotIdentity.device !== createdSnapshotNode.device ||
        snapshotIdentity.inode !== createdSnapshotNode.inode ||
        snapshotIdentity.byteLength !== backup.byteLength) {
      throw new Error('community_backup_snapshot_identity_changed')
    }
    const snapshotHash = createHash('sha256')
    let snapshotLength = 0
    while (true) {
      const readLength = readSync(destinationFd, buffer, 0, buffer.length, snapshotLength)
      if (readLength === 0) break
      snapshotHash.update(buffer.subarray(0, readLength))
      snapshotLength += readLength
    }
    const snapshotAfterRead = fileDescriptorIdentity(destinationFd)
    if (!sameStableFileIdentity(snapshotIdentity, snapshotAfterRead) ||
        snapshotLength !== backup.byteLength ||
        `sha256:${snapshotHash.digest('hex')}` !== backup.sha256) {
      throw new Error('community_backup_snapshot_digest_mismatch')
    }
    runtime.beforeFinalVerification?.(snapshotPath)
    if (!sameStableFileIdentity(snapshotAfterRead, pathIdentity(snapshotPath))) {
      throw new Error('community_backup_snapshot_identity_changed')
    }
    runtime.afterFinalVerification?.(snapshotPath)
    const snapshotFd = destinationFd
    destinationFd = undefined
    return {
      path: snapshotPath,
      sourcePath,
      sha256: observedDigest,
      byteLength: readPosition,
      fd: snapshotFd,
      device: snapshotIdentity.device,
      inode: snapshotIdentity.inode,
    }
  } catch (error) {
    if (destinationFd !== undefined) closeSync(destinationFd)
    // Never unlink by pathname here. A replacement can win between any identity
    // check and unlink; preserving the private snapshot/evidence is fail-closed.
    throw error
  } finally {
    closeSync(sourceFd)
  }
}

function closeVerifiedBackupSnapshot(snapshot: CommunityVerifiedBackupSnapshot): void {
  // The held FD is the authority. Portable Node APIs cannot atomically unlink a
  // pathname only if it still names that FD's inode, so automatic deletion is
  // intentionally forbidden. Exact-identity orphan cleanup is a separate P2.
  closeSync(snapshot.fd)
}

function assertInstanceName(value: string): string {
  const normalized = value.trim().toLowerCase()
  if (!INSTANCE_NAME.test(normalized)) throw new Error('community_instance_name_invalid')
  return normalized
}

function assertDigest(value: unknown, code: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(code)
}

function assertReleaseIdentity(value: unknown): asserts value is CommunityReleaseIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community_installed_release_invalid')
  }
  const release = value as Partial<CommunityInstalledRelease>
  if (typeof release.releaseVersion !== 'string' || !release.releaseVersion) {
    throw new Error('community_installed_release_version_invalid')
  }
  assertDigest(release.imageIndexDigest, 'community_installed_release_index_digest_invalid')
  assertDigest(release.migrationSetDigest, 'community_installed_release_migration_digest_invalid')
  assertDigest(release.manifestSha256, 'community_installed_release_manifest_digest_invalid')
  assertDigest(release.composeSha256, 'community_installed_release_compose_digest_invalid')
  const expectedImageRef = `${String(release.imageRef).split('@')[0]}@${release.imageIndexDigest}`
  if (release.imageRef !== expectedImageRef || !release.imageRef.startsWith('ghcr.io/')) {
    throw new Error('community_installed_release_image_ref_invalid')
  }
  if (!Array.isArray(release.migrationTags) || release.migrationTags.some((tag) => typeof tag !== 'string' || !tag)) {
    throw new Error('community_installed_release_migration_tags_invalid')
  }
}

function assertInstalledRelease(value: unknown): asserts value is CommunityInstalledRelease {
  assertReleaseIdentity(value)
  const release = value as CommunityInstalledRelease
  if (!isSamePhysicalPath(path.dirname(release.manifestPath), path.dirname(release.composePath))) {
    throw new Error('community_installed_release_cache_layout_invalid')
  }
  for (const [filePath, expectedDigest, code] of [
    [release.manifestPath, release.manifestSha256, 'community_installed_release_manifest_file_invalid'],
    [release.composePath, release.composeSha256, 'community_installed_release_compose_file_invalid'],
  ] as const) {
    if (!path.isAbsolute(filePath)) throw new Error(code)
    assertCanonicalDirectChildRegularFile(path.dirname(filePath), filePath, code)
    if (sha256(readFileSync(filePath)) !== expectedDigest) throw new Error(`${code}_digest_mismatch`)
  }
}

function assertInstalledReleaseLineage(
  paths: CommunityInstallPaths,
  value: unknown,
): asserts value is CommunityInstalledRelease {
  assertReleaseIdentity(value)
  const release = value as CommunityInstalledRelease
  if (typeof release.manifestPath !== 'string' || typeof release.composePath !== 'string' ||
      !path.isAbsolute(release.manifestPath) || !path.isAbsolute(release.composePath)) {
    throw new Error('community_installed_release_lineage_invalid')
  }

  const instanceRoot = assertCanonicalDirectory(paths.instanceRoot, 'community_instance_root_unsafe')
  const releaseCacheRoot = assertCanonicalDirectory(
    paths.releaseCacheRoot,
    'community_release_cache_root_unsafe',
  )
  const expectedReleaseCacheRoot = path.join(instanceRoot, 'releases')
  if (!isSamePhysicalPath(releaseCacheRoot, expectedReleaseCacheRoot) ||
      !isSamePhysicalPath(path.dirname(releaseCacheRoot), instanceRoot)) {
    throw new Error('community_release_cache_root_lineage_invalid')
  }

  const expectedReleaseRoot = path.join(
    releaseCacheRoot,
    release.manifestSha256.slice('sha256:'.length),
  )
  const releaseRoot = assertCanonicalDirectory(
    expectedReleaseRoot,
    'community_installed_release_cache_slot_invalid',
  )
  if (!isSamePhysicalPath(path.dirname(releaseRoot), releaseCacheRoot)) {
    throw new Error('community_installed_release_cache_slot_invalid')
  }

  const expectedManifestPath = path.join(releaseRoot, 'release.json')
  const expectedComposePath = path.join(releaseRoot, 'compose.yaml')
  if (release.manifestPath !== expectedManifestPath || release.composePath !== expectedComposePath) {
    throw new Error('community_installed_release_lineage_invalid')
  }

  for (const [filePath, expectedDigest, code] of [
    [expectedManifestPath, release.manifestSha256, 'community_installed_release_manifest_file_invalid'],
    [expectedComposePath, release.composeSha256, 'community_installed_release_compose_file_invalid'],
  ] as const) {
    assertCanonicalDirectChildRegularFile(releaseRoot, filePath, code)
    if (sha256(readFileSync(filePath)) !== expectedDigest) throw new Error(`${code}_digest_mismatch`)
  }
}

function assertInstallStateLineage(paths: CommunityInstallPaths, state: CommunityInstallState): void {
  const instanceRoot = assertCanonicalDirectory(paths.instanceRoot, 'community_instance_root_unsafe')
  const selectedInstanceName = path.basename(instanceRoot)
  if (!INSTANCE_NAME.test(selectedInstanceName) || state.instanceName !== selectedInstanceName) {
    throw new Error('community_install_state_instance_mismatch')
  }
  assertInstalledReleaseLineage(paths, state.activeRelease)
  if (state.previousRelease !== null) assertInstalledReleaseLineage(paths, state.previousRelease)
}

function assertUpdateRecordLineage(paths: CommunityInstallPaths, record: CommunityUpdateRecord): void {
  if (!record || typeof record !== 'object' || !UUID.test(record.id)) {
    throw new Error('community_update_record_id_invalid')
  }
  if (!['started', 'succeeded', 'failed', 'recovery-started', 'recovery-failed', 'recovered', 'rolled-back'].includes(record.status)) {
    throw new Error('community_update_record_status_invalid')
  }
  assertInstalledReleaseLineage(paths, record.priorRelease)
  assertInstalledReleaseLineage(paths, record.targetRelease)
  assertInstalledReleaseLineage(paths, record.backup?.sourceRelease)
  if (record.backup.sourceRelease.manifestSha256 !== record.priorRelease.manifestSha256) {
    throw new Error('community_update_backup_source_release_mismatch')
  }
  if (typeof record.sourcePostgresVolumeName !== 'string' || !record.sourcePostgresVolumeName) {
    throw new Error('community_update_source_volume_invalid')
  }
  if (record.replacementVolumeName !== undefined && !/^[a-z0-9][a-z0-9-]{0,179}$/.test(record.replacementVolumeName)) {
    throw new Error('community_update_replacement_volume_invalid')
  }
  if (record.recoveredUpdateId !== undefined && !UUID.test(record.recoveredUpdateId)) {
    throw new Error('community_update_recovered_id_invalid')
  }
  if (record.volumeClaimSha256 !== undefined) {
    assertDigest(record.volumeClaimSha256, 'community_update_volume_claim_invalid')
  }
  if (record.replacementVolumeName !== undefined) {
    const expectedSuffix = `${record.recoveredUpdateId?.replace(/-/g, '')}-${record.id.replace(/-/g, '')}`
    if (!record.recoveredUpdateId || !record.volumeClaimSha256 ||
        !new RegExp(`-pg-(?:recover|rollback)-${expectedSuffix}$`).test(record.replacementVolumeName)) {
      throw new Error('community_update_replacement_volume_lineage_invalid')
    }
  } else if (record.volumeClaimSha256 !== undefined) {
    throw new Error('community_update_volume_claim_lineage_invalid')
  }
}

function atomicWrite(filePath: string, content: string, mode?: number): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}-${randomUUID()}.tmp`
  try {
    writeFileSync(tempPath, content, { encoding: 'utf8', flag: 'wx', mode })
    let lastError: unknown
    for (let attempt = 0; attempt < 7; attempt += 1) {
      try {
        renameSync(tempPath, filePath)
        lastError = undefined
        break
      } catch (error) {
        lastError = error
        const code = (error as NodeJS.ErrnoException)?.code
        if (process.platform !== 'win32' || !['EACCES', 'EBUSY', 'EPERM'].includes(String(code)) || attempt === 6) {
          throw error
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1))
      }
    }
    if (lastError) throw lastError
  } finally {
    rmSync(tempPath, { force: true })
  }
}

function writeCreateOnce(filePath: string, content: string, mode?: number): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx', mode })
}

function parseJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw new Error(`community_json_read_failed:${filePath}`, { cause: error })
  }
}

export function resolveCommunityDataRoot(options: {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  homeDir?: string
} = {}): string {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const pathImpl = platform === 'win32' ? path.win32 : path.posix
  const homeDir = pathImpl.resolve(options.homeDir ?? os.homedir())
  if (env.AOPS_COMMUNITY_HOME) {
    if (!pathImpl.isAbsolute(env.AOPS_COMMUNITY_HOME)) throw new Error('community_home_absolute_required')
    return pathImpl.resolve(env.AOPS_COMMUNITY_HOME)
  }
  if (platform === 'win32') {
    return pathImpl.join(pathImpl.resolve(env.LOCALAPPDATA ?? pathImpl.join(homeDir, 'AppData', 'Local')), 'AOPS', 'Community')
  }
  if (platform === 'darwin') {
    return pathImpl.join(homeDir, 'Library', 'Application Support', 'AOPS', 'Community')
  }
  return pathImpl.join(pathImpl.resolve(env.XDG_DATA_HOME ?? pathImpl.join(homeDir, '.local', 'share')), 'aops', 'community')
}

export function resolveCommunityInstallPaths(options: {
  instanceName?: string
  dataRoot?: string
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  homeDir?: string
} = {}): CommunityInstallPaths {
  const dataRoot = options.dataRoot
    ? assertAbsolute(options.dataRoot, 'community_data_root_absolute_required')
    : resolveCommunityDataRoot(options)
  const instanceName = assertInstanceName(options.instanceName ?? 'default')
  const instanceRoot = path.join(dataRoot, 'instances', instanceName)
  const runtimeRoot = path.join(instanceRoot, 'runtime')
  return {
    dataRoot,
    instanceRoot,
    runtimeRoot,
    releaseCacheRoot: path.join(instanceRoot, 'releases'),
    backupRoot: path.join(instanceRoot, 'backups'),
    statePath: path.join(instanceRoot, 'install-state.json'),
    envPath: path.join(instanceRoot, 'runtime.env'),
    composePath: path.join(runtimeRoot, 'compose.yaml'),
    releasePath: path.join(runtimeRoot, 'release.json'),
    ledgerPath: path.join(instanceRoot, 'update-ledger.json'),
    recoveryJournalPath: path.join(instanceRoot, 'recovery-commit.json'),
    operationJournalRoot: path.join(dataRoot, 'operation-journals', instanceName),
  }
}

export function parseCommunityRelease(manifestContent: string, composeContent: string): CommunityReleaseIdentity {
  let manifest: CommunityRelease
  try {
    manifest = JSON.parse(manifestContent) as CommunityRelease
  } catch (error) {
    throw new Error('community_release_manifest_json_invalid', { cause: error })
  }
  if (manifest?.schemaVersion !== 1 || typeof manifest.releaseVersion !== 'string' || !manifest.releaseVersion) {
    throw new Error('community_release_manifest_invalid')
  }
  assertDigest(manifest.image?.indexDigest, 'community_release_index_digest_invalid')
  assertDigest(manifest.compose?.sha256, 'community_release_compose_digest_invalid')
  assertDigest(manifest.migrations?.setDigest, 'community_release_migration_digest_invalid')
  if (!Array.isArray(manifest.migrations?.tags) || manifest.migrations.tags.some((tag) => typeof tag !== 'string' || !tag)) {
    throw new Error('community_release_migration_tags_invalid')
  }
  if (sha256(composeContent) !== manifest.compose.sha256) {
    throw new Error('community_release_compose_digest_mismatch')
  }
  const release: CommunityReleaseIdentity = {
    releaseVersion: manifest.releaseVersion,
    imageRef: `${manifest.image.repository}@${manifest.image.indexDigest}`,
    imageIndexDigest: manifest.image.indexDigest,
    migrationSetDigest: manifest.migrations.setDigest,
    migrationTags: [...manifest.migrations.tags],
    manifestSha256: sha256(manifestContent),
    composeSha256: manifest.compose.sha256,
  }
  assertReleaseIdentity(release)
  return release
}

export function verifyStagedCommunityRelease(release: CommunityInstalledRelease): void {
  assertInstalledRelease(release)
  const observed = parseCommunityRelease(
    readFileSync(release.manifestPath, 'utf8'),
    readFileSync(release.composePath, 'utf8'),
  )
  for (const key of [
    'releaseVersion',
    'imageRef',
    'imageIndexDigest',
    'migrationSetDigest',
    'manifestSha256',
    'composeSha256',
  ] as const) {
    if (observed[key] !== release[key]) throw new Error(`community_staged_release_identity_mismatch:${key}`)
  }
  if (JSON.stringify(observed.migrationTags) !== JSON.stringify(release.migrationTags)) {
    throw new Error('community_staged_release_identity_mismatch:migrationTags')
  }
}

export function stageCommunityRelease(options: {
  paths: CommunityInstallPaths
  manifestContent: string
  composeContent: string
  manifestVerified: boolean
}): CommunityInstalledRelease {
  if (options.manifestVerified !== true) throw new Error('community_release_verification_required')
  const identity = parseCommunityRelease(options.manifestContent, options.composeContent)
  const releaseCacheRoot = assertCanonicalDirectory(
    options.paths.releaseCacheRoot,
    'community_release_cache_root_unsafe',
  )
  const releaseRoot = ensureCanonicalDirectChildDirectory(
    releaseCacheRoot,
    path.join(releaseCacheRoot, identity.manifestSha256.slice('sha256:'.length)),
    'community_release_cache_slot_unsafe',
  )
  const manifestPath = path.join(releaseRoot, 'release.json')
  const composePath = path.join(releaseRoot, 'compose.yaml')
  for (const [name, filePath, content, expectedDigest] of [
    ['release.json', manifestPath, options.manifestContent, identity.manifestSha256],
    ['compose.yaml', composePath, options.composeContent, identity.composeSha256],
  ] as const) {
    if (!tryLstat(filePath)) {
      writeCanonicalDirectChildFileCreateOnce(
        releaseRoot,
        filePath,
        content,
        0o600,
        `community_release_cache_file_unsafe:${name}`,
      )
    }
    assertCanonicalDirectChildRegularFile(
      releaseRoot,
      filePath,
      `community_release_cache_file_unsafe:${name}`,
    )
    if (sha256(readFileSync(filePath)) !== expectedDigest) throw new Error('community_release_cache_digest_mismatch')
  }
  const release = { ...identity, manifestPath, composePath }
  assertInstalledReleaseLineage(options.paths, release)
  return release
}

export function readCommunityInstallState(paths: CommunityInstallPaths): CommunityInstallState {
  const value = parseJsonFile(paths.statePath)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community_install_state_invalid')
  }
  const state = value as CommunityInstallState
  if (state.schemaVersion !== 1 || !INSTANCE_NAME.test(state.instanceName)) {
    throw new Error('community_install_state_schema_invalid')
  }
  if (!/^[0-9a-f-]{36}$/.test(state.installId)) throw new Error('community_install_id_invalid')
  if (state.composeProjectName !== `aops-community-${state.installId.replace(/-/g, '').slice(0, 12)}`) {
    throw new Error('community_compose_project_identity_invalid')
  }
  assertCommunityPostgresVolumeName(state, state.postgresVolumeName)
  assertInstallStateLineage(paths, state)
  return state
}

export type CommunityInstallInspection = {
  status: 'not-installed' | 'partial' | 'installed'
  paths: CommunityInstallPaths
  presentFiles: string[]
  missingFiles: string[]
  state?: CommunityInstallState
  error?: string
}

export function inspectCommunityInstall(options: {
  instanceName?: string
  dataRoot?: string
} = {}): CommunityInstallInspection {
  const paths = resolveCommunityInstallPaths(options)
  const required = [paths.statePath, paths.envPath, paths.composePath, paths.releasePath, paths.ledgerPath]
  const presentFiles = required.filter((filePath) => existsSync(filePath))
  const missingFiles = required.filter((filePath) => !existsSync(filePath))
  if (presentFiles.length === 0) return { status: 'not-installed', paths, presentFiles, missingFiles }
  if (!existsSync(paths.statePath)) {
    return { status: 'partial', paths, presentFiles, missingFiles, error: 'community_install_state_missing' }
  }
  try {
    const state = readCommunityInstallState(paths)
    if (missingFiles.length > 0) {
      return { status: 'partial', paths, presentFiles, missingFiles, state, error: 'community_install_files_missing' }
    }
    return { status: 'installed', paths, presentFiles, missingFiles, state }
  } catch (error) {
    return {
      status: 'partial',
      paths,
      presentFiles,
      missingFiles,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function readCommunityRuntimePort(paths: CommunityInstallPaths): number {
  const content = readFileSync(paths.envPath, 'utf8')
  const value = /^AOPS_PORT=(\d+)\s*$/m.exec(content)?.[1]
  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('community_runtime_port_invalid')
  return port
}

function renderRuntimeEnv(params: {
  state: CommunityInstallState
  postgresPassword: string
  chatv3ServerKey: string
  port: number
}): string {
  return [
    '# Managed by aops-cli Community lifecycle. Keep this file private.',
    `COMPOSE_PROJECT_NAME=${params.state.composeProjectName}`,
    `AOPS_INSTALL_ID=${params.state.installId}`,
    `AOPS_IMAGE_REF=${params.state.activeRelease.imageRef}`,
    `AOPS_POSTGRES_VOLUME_NAME=${params.state.postgresVolumeName}`,
    'AOPS_POSTGRES_DB=aops',
    'AOPS_POSTGRES_USER=aops',
    `AOPS_POSTGRES_PASSWORD=${params.postgresPassword}`,
    'CHATV3_SERVER_KEY_ID=k1',
    `CHATV3_SERVER_KEY_SECRET=${params.chatv3ServerKey}`,
    `AOPS_PORT=${params.port}`,
    '',
  ].join('\n')
}

function renderUpdatedRuntimeEnvBindings(content: string, state: CommunityInstallState): string {
  const managed = new Map([
    ['COMPOSE_PROJECT_NAME', state.composeProjectName],
    ['AOPS_INSTALL_ID', state.installId],
    ['AOPS_IMAGE_REF', state.activeRelease.imageRef],
    ['AOPS_POSTGRES_VOLUME_NAME', state.postgresVolumeName],
  ])
  const seen = new Set<string>()
  const lines = content.split(/\r?\n/).map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line)
    const key = match?.[1]
    if (!key || !managed.has(key)) return line
    seen.add(key)
    return `${key}=${managed.get(key)}`
  })
  for (const [key, value] of managed) {
    if (!seen.has(key)) lines.push(`${key}=${value}`)
  }
  return `${lines.join('\n').replace(/\n+$/g, '')}\n`
}

function updateRuntimeEnvBindings(paths: CommunityInstallPaths, state: CommunityInstallState): void {
  atomicWrite(
    paths.envPath,
    renderUpdatedRuntimeEnvBindings(readFileSync(paths.envPath, 'utf8'), state),
    0o600,
  )
}

export function setupCommunityInstall(options: {
  manifestContent: string
  composeContent: string
  manifestVerified: boolean
  instanceName?: string
  dataRoot?: string
  port?: number
  now?: () => Date
  createInstallId?: () => string
  createSecret?: () => string
  operationJournal?: CommunityOperationJournalHandle
  operationReceipt?: CommunityOperationLockReceipt
}): { status: 'created' | 'existing'; paths: CommunityInstallPaths; state: CommunityInstallState } {
  if (options.manifestVerified !== true) throw new Error('community_release_verification_required')
  const paths = resolveCommunityInstallPaths({ instanceName: options.instanceName, dataRoot: options.dataRoot })
  const instanceRoot = ensureCanonicalDirectoryChain(paths.instanceRoot, 'community_instance_root_unsafe')
  ensureCanonicalDirectChildDirectory(instanceRoot, paths.runtimeRoot, 'community_runtime_root_unsafe')
  ensureCanonicalDirectChildDirectory(instanceRoot, paths.releaseCacheRoot, 'community_release_cache_root_unsafe')
  ensureCanonicalDirectChildDirectory(instanceRoot, paths.backupRoot, 'community_backup_root_unsafe')
  assertCommunityRecoveryMutationFence(paths, options.operationJournal && options.operationReceipt
    ? { handle: options.operationJournal, operation: 'setup', receipt: options.operationReceipt }
    : undefined)
  if (existsSync(paths.statePath)) {
    return { status: 'existing', paths, state: readCommunityInstallState(paths) }
  }
  const now = options.now ?? (() => new Date())
  const installId = (options.createInstallId ?? randomUUID)()
  if (!/^[0-9a-f-]{36}$/.test(installId)) throw new Error('community_install_id_invalid')
  const port = options.port ?? 5900
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error('community_port_invalid')
  const composeProjectName = `aops-community-${installId.replace(/-/g, '').slice(0, 12)}`
  const createdAt = nowIso(now)
  const release = stageCommunityRelease({
    paths,
    manifestContent: options.manifestContent,
    composeContent: options.composeContent,
    manifestVerified: true,
  })
  const state: CommunityInstallState = {
    schemaVersion: 1,
    instanceName: assertInstanceName(options.instanceName ?? 'default'),
    installId,
    composeProjectName,
    postgresVolumeName: `${composeProjectName}-pg-1`,
    createdAt,
    updatedAt: createdAt,
    activeRelease: release,
    previousRelease: null,
    lastSuccessfulUpdateId: null,
  }
  const secret = options.createSecret ?? (() => randomBytes(32).toString('base64url'))
  writeCreateOnce(paths.composePath, options.composeContent)
  writeCreateOnce(paths.releasePath, options.manifestContent)
  writeCreateOnce(paths.envPath, renderRuntimeEnv({
    state,
    postgresPassword: secret(),
    chatv3ServerKey: secret(),
    port,
  }), 0o600)
  writeCreateOnce(paths.ledgerPath, '[]\n', 0o600)
  writeCreateOnce(paths.statePath, `${JSON.stringify(state, null, 2)}\n`, 0o600)
  return { status: 'created', paths, state }
}

function readLedger(paths: CommunityInstallPaths): CommunityUpdateRecord[] {
  const value = parseJsonFile(paths.ledgerPath)
  if (!Array.isArray(value)) throw new Error('community_update_ledger_invalid')
  const records = value as CommunityUpdateRecord[]
  for (const record of records) assertUpdateRecordLineage(paths, record)
  return records
}

const ABANDONED_RUNTIME_RECONCILIATION_MARKER = 'operator_reconciled_interrupted_attempt_volume_preserved'
const SOURCE_RUNTIME_RECONCILIATION_MARKER = 'operator_reconciled_source_runtime_restored'

export function assertNoCommunityRecoveryCommitJournal(paths: CommunityInstallPaths): void {
  assertNoRecoveryCommitJournal(paths)
}

export function assertCommunityLedgerHasNoNonterminalOperation(paths: CommunityInstallPaths): void {
  if (!tryLstat(paths.ledgerPath)) return
  for (const record of readLedger(paths)) {
    if (record.status === 'started' || record.status === 'recovery-started' ||
        (record.status === 'recovery-failed' && record.failure === ABANDONED_RUNTIME_RECONCILIATION_MARKER)) {
      throw new Error(`community_operation_ledger_reconciliation_required:record_id=${record.id}:status=${record.status}`)
    }
  }
}

export function assertCommunityRecoveryMutationFence(
  paths: CommunityInstallPaths,
  active?: Readonly<{
    handle: CommunityOperationJournalHandle
    operation: CommunityOperation
    receipt: CommunityOperationLockReceipt
  }>,
): void {
  assertCommunityOperationJournalFence(paths, active)
  if (tryLstat(paths.recoveryJournalPath)) {
    throw new Error('community_recovery_reconciliation_required:recovery_commit_journal_present')
  }
  if (!tryLstat(paths.ledgerPath)) return
  const ledger = readLedger(paths)
  for (let index = ledger.length - 1; index >= 0; index -= 1) {
    const record = ledger[index]!
    if (record.status === 'recovery-started') {
      throw new Error(`community_recovery_reconciliation_required:recovery_id=${record.id}`)
    }
    if (record.status === 'recovery-failed' && record.failure === ABANDONED_RUNTIME_RECONCILIATION_MARKER) {
      throw new Error(`community_recovery_runtime_reconciliation_required:recovery_id=${record.id}`)
    }
  }
}

function serializeLedger(paths: CommunityInstallPaths, records: CommunityUpdateRecord[]): string {
  for (const record of records) assertUpdateRecordLineage(paths, record)
  return `${JSON.stringify(records, null, 2)}\n`
}

function writeLedger(paths: CommunityInstallPaths, records: CommunityUpdateRecord[]): void {
  atomicWrite(paths.ledgerPath, serializeLedger(paths, records), 0o600)
}

function serializeState(paths: CommunityInstallPaths, state: CommunityInstallState): string {
  assertInstallStateLineage(paths, state)
  return `${JSON.stringify(state, null, 2)}\n`
}

function persistState(paths: CommunityInstallPaths, state: CommunityInstallState): void {
  atomicWrite(paths.statePath, serializeState(paths, state), 0o600)
}

type CommunityRecoveryCommitJournal = {
  schemaVersion: 1
  updateId: string
  recoveryId: string
  phase: 'prepared' | 'env-written' | 'state-written' | 'rollback-failed'
  createdAt: string
  priorSha256: { env: string; state: string; ledger: string }
  nextSha256: { env: string; state: string; ledger: string }
  nextState: CommunityInstallState
  nextLedger: CommunityUpdateRecord[]
}

function writeRecoveryCommitJournal(
  paths: CommunityInstallPaths,
  journal: CommunityRecoveryCommitJournal,
  createOnce = false,
): void {
  const content = `${JSON.stringify(journal, null, 2)}\n`
  if (createOnce) {
    writeCanonicalDirectChildFileCreateOnce(
      paths.instanceRoot,
      paths.recoveryJournalPath,
      content,
      0o600,
      'community_recovery_journal_invalid',
    )
    return
  }
  assertCanonicalDirectChildRegularFile(
    paths.instanceRoot,
    paths.recoveryJournalPath,
    'community_recovery_journal_invalid',
  )
  atomicWrite(paths.recoveryJournalPath, content, 0o600)
}

function removeRecoveryCommitJournal(paths: CommunityInstallPaths): void {
  assertCanonicalDirectChildRegularFile(
    paths.instanceRoot,
    paths.recoveryJournalPath,
    'community_recovery_journal_invalid',
  )
  rmSync(paths.recoveryJournalPath)
}

function assertNoRecoveryCommitJournal(paths: CommunityInstallPaths): void {
  if (tryLstat(paths.recoveryJournalPath)) {
    throw new Error('community_recovery_reconciliation_required:recovery_commit_journal_present')
  }
}

function commitRecoveredInstallState(params: {
  paths: CommunityInstallPaths
  updateId: string
  recoveryId: string
  createdAt: string
  priorEnvContent: string
  priorStateContent: string
  priorLedgerContent: string
  nextEnvContent: string
  nextStateContent: string
  nextLedgerContent: string
  nextState: CommunityInstallState
  nextLedger: CommunityUpdateRecord[]
  runtime?: CommunityRecoveryCommitRuntime
}): void {
  const journal: CommunityRecoveryCommitJournal = {
    schemaVersion: 1,
    updateId: params.updateId,
    recoveryId: params.recoveryId,
    phase: 'prepared',
    createdAt: params.createdAt,
    priorSha256: {
      env: sha256(params.priorEnvContent),
      state: sha256(params.priorStateContent),
      ledger: sha256(params.priorLedgerContent),
    },
    nextSha256: {
      env: sha256(params.nextEnvContent),
      state: sha256(params.nextStateContent),
      ledger: sha256(params.nextLedgerContent),
    },
    nextState: params.nextState,
    nextLedger: params.nextLedger,
  }
  writeRecoveryCommitJournal(params.paths, journal, true)
  const writeEnv = params.runtime?.writeEnv ?? ((filePath: string, content: string) => atomicWrite(filePath, content, 0o600))
  const writeState = params.runtime?.writeState ?? ((filePath: string, content: string) => atomicWrite(filePath, content, 0o600))
  const writeLedgerContent = params.runtime?.writeLedger ?? ((filePath: string, content: string) => atomicWrite(filePath, content, 0o600))
  try {
    writeEnv(params.paths.envPath, params.nextEnvContent)
    journal.phase = 'env-written'
    writeRecoveryCommitJournal(params.paths, journal)
    writeState(params.paths.statePath, params.nextStateContent)
    journal.phase = 'state-written'
    writeRecoveryCommitJournal(params.paths, journal)
    writeLedgerContent(params.paths.ledgerPath, params.nextLedgerContent)
    removeRecoveryCommitJournal(params.paths)
  } catch (error) {
    const rollbackErrors: string[] = []
    for (const [filePath, content] of [
      [params.paths.envPath, params.priorEnvContent],
      [params.paths.statePath, params.priorStateContent],
      [params.paths.ledgerPath, params.priorLedgerContent],
    ] as const) {
      try {
        atomicWrite(filePath, content, 0o600)
      } catch (rollbackError) {
        rollbackErrors.push(redactCommunityDiagnostic(rollbackError))
      }
    }
    if (rollbackErrors.length === 0) {
      removeRecoveryCommitJournal(params.paths)
      throw new Error(`community_recovery_commit_failed:${redactCommunityDiagnostic(error)}`, { cause: error })
    }
    journal.phase = 'rollback-failed'
    try {
      writeRecoveryCommitJournal(params.paths, journal)
    } catch {
      // The existing journal remains the fail-closed recovery signal.
    }
    throw new Error(
      `community_recovery_reconciliation_required:commit=${redactCommunityDiagnostic(error)}:rollback=${rollbackErrors.join('|')}`,
      { cause: error },
    )
  }
}

function readRecoveryCommitJournal(paths: CommunityInstallPaths): CommunityRecoveryCommitJournal {
  assertCanonicalDirectChildRegularFile(
    paths.instanceRoot,
    paths.recoveryJournalPath,
    'community_recovery_journal_invalid',
  )
  const value = parseJsonFile(paths.recoveryJournalPath) as Partial<CommunityRecoveryCommitJournal>
  if (value.schemaVersion !== 1 || !UUID.test(String(value.updateId)) || !UUID.test(String(value.recoveryId)) ||
      !['prepared', 'env-written', 'state-written', 'rollback-failed'].includes(String(value.phase)) ||
      typeof value.createdAt !== 'string' || new Date(value.createdAt).toISOString() !== value.createdAt ||
      !value.priorSha256 || !value.nextSha256 || !value.nextState || !Array.isArray(value.nextLedger)) {
    throw new Error('community_recovery_journal_invalid')
  }
  for (const digestValue of [
    value.priorSha256.env,
    value.priorSha256.state,
    value.priorSha256.ledger,
    value.nextSha256.env,
    value.nextSha256.state,
    value.nextSha256.ledger,
  ]) {
    assertDigest(digestValue, 'community_recovery_journal_invalid')
  }
  const journal = value as CommunityRecoveryCommitJournal
  if (sha256(serializeState(paths, journal.nextState)) !== journal.nextSha256.state ||
      sha256(serializeLedger(paths, journal.nextLedger)) !== journal.nextSha256.ledger) {
    throw new Error('community_recovery_journal_payload_mismatch')
  }
  const recovery = journal.nextLedger.find((record) => record.id === journal.recoveryId)
  if (!recovery || recovery.recoveredUpdateId !== journal.updateId ||
      (recovery.status !== 'recovered' && recovery.status !== 'rolled-back')) {
    throw new Error('community_recovery_journal_payload_mismatch')
  }
  return journal
}

export function reconcileCommunityRecoveryCommit(options: {
  paths: CommunityInstallPaths
  updateId: string
  recoveryId: string
  confirm: boolean
}): CommunityUpdateRecord {
  if (options.confirm !== true) throw new Error('community_recovery_reconciliation_confirmation_required')
  if (!UUID.test(options.updateId) || !UUID.test(options.recoveryId)) {
    throw new Error('community_recovery_reconciliation_id_invalid')
  }
  const journal = readRecoveryCommitJournal(options.paths)
  if (journal.updateId !== options.updateId || journal.recoveryId !== options.recoveryId) {
    throw new Error('community_recovery_reconciliation_record_mismatch')
  }
  const currentEnv = readFileSync(options.paths.envPath, 'utf8')
  const currentState = readFileSync(options.paths.statePath, 'utf8')
  const currentLedger = readFileSync(options.paths.ledgerPath, 'utf8')
  for (const [name, content] of [
    ['env', currentEnv],
    ['state', currentState],
    ['ledger', currentLedger],
  ] as const) {
    const observed = sha256(content)
    if (observed !== journal.priorSha256[name] && observed !== journal.nextSha256[name]) {
      throw new Error(`community_recovery_reconciliation_drift:${name}`)
    }
  }
  const nextEnvContent = renderUpdatedRuntimeEnvBindings(currentEnv, journal.nextState)
  if (sha256(nextEnvContent) !== journal.nextSha256.env) {
    throw new Error('community_recovery_reconciliation_env_mismatch')
  }
  try {
    atomicWrite(options.paths.envPath, nextEnvContent, 0o600)
    journal.phase = 'env-written'
    writeRecoveryCommitJournal(options.paths, journal)
    persistState(options.paths, journal.nextState)
    journal.phase = 'state-written'
    writeRecoveryCommitJournal(options.paths, journal)
    writeLedger(options.paths, journal.nextLedger)
    removeRecoveryCommitJournal(options.paths)
  } catch (error) {
    throw new Error(`community_recovery_reconciliation_failed:${redactCommunityDiagnostic(error)}`, { cause: error })
  }
  return journal.nextLedger.find((record) => record.id === journal.recoveryId)!
}

export function abandonInterruptedCommunityRecovery(options: {
  paths: CommunityInstallPaths
  updateId: string
  recoveryId: string
  confirm: boolean
  now?: () => Date
}): CommunityUpdateRecord {
  if (options.confirm !== true) throw new Error('community_recovery_reconciliation_confirmation_required')
  if (!UUID.test(options.updateId) || !UUID.test(options.recoveryId)) {
    throw new Error('community_recovery_reconciliation_id_invalid')
  }
  assertNoRecoveryCommitJournal(options.paths)
  const state = readCommunityInstallState(options.paths)
  const ledger = readLedger(options.paths)
  const interrupted = ledger.at(-1)
  const update = ledger.find((record) => record.id === options.updateId)
  if (!interrupted || interrupted.id !== options.recoveryId || interrupted.status !== 'recovery-started' ||
      interrupted.recoveredUpdateId !== options.updateId || !update ||
      (update.status !== 'failed' && update.status !== 'succeeded')) {
    throw new Error('community_recovery_reconciliation_record_mismatch')
  }
  if (state.postgresVolumeName !== update.sourcePostgresVolumeName) {
    throw new Error('community_recovery_reconciliation_state_drift')
  }
  if (update.status === 'failed' && !sameInstalledRelease(state.activeRelease, update.priorRelease)) {
    throw new Error('community_recovery_reconciliation_state_drift')
  }
  if (update.status === 'succeeded' && (
    !sameInstalledRelease(state.activeRelease, update.targetRelease)
    || !sameInstalledRelease(state.previousRelease, update.priorRelease)
    || state.lastSuccessfulUpdateId !== update.id
  )) {
    throw new Error('community_recovery_reconciliation_state_drift')
  }
  const reconciled: CommunityUpdateRecord = {
    ...interrupted,
    status: 'recovery-failed',
    finishedAt: nowIso(options.now ?? (() => new Date())),
    failure: ABANDONED_RUNTIME_RECONCILIATION_MARKER,
  }
  writeLedger(options.paths, [...ledger.slice(0, -1), reconciled])
  return reconciled
}

export async function verifyCommunityBackupRecord(record: CommunityBackupRecord): Promise<void> {
  if (!record || typeof record !== 'object' || typeof record.path !== 'string' ||
      record.verified !== true || !path.isAbsolute(record.path) || !existsSync(record.path)) {
    throw new Error('community_backup_verification_required')
  }
  const resolved = path.resolve(record.path)
  const stat = tryLstat(resolved)
  if (!stat || stat.isSymbolicLink() || !stat.isFile() ||
      stat.nlink !== 1 ||
      !isSamePhysicalPath(resolved, realpathSync.native(resolved)) ||
      stat.size <= 0 || stat.size !== record.byteLength) {
    throw new Error('community_backup_file_invalid')
  }
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(resolved)) hash.update(chunk)
  if (`sha256:${hash.digest('hex')}` !== record.sha256) {
    throw new Error('community_backup_digest_mismatch')
  }
  assertInstalledRelease(record.sourceRelease)
}

export function writeCommunityBackupReceipt(paths: CommunityInstallPaths, record: CommunityBackupRecord): string {
  const backupPath = assertOwnedBackupFile(paths, record.path)
  assertInstalledReleaseLineage(paths, record.sourceRelease)
  const receiptPath = `${backupPath}.json`
  if (tryLstat(receiptPath)) throw new Error('community_backup_receipt_already_exists')
  writeCanonicalDirectChildFileCreateOnce(
    paths.backupRoot,
    receiptPath,
    `${JSON.stringify(record, null, 2)}\n`,
    0o600,
    'community_backup_receipt_invalid',
  )
  return receiptPath
}

export async function readCommunityBackupReceipt(
  paths: CommunityInstallPaths,
  backupPath: string,
): Promise<CommunityBackupRecord> {
  const absolute = assertAbsolute(backupPath, 'community_backup_absolute_path_required')
  const ownedBackupPath = assertOwnedBackupFile(paths, absolute)
  const receiptPath = `${ownedBackupPath}.json`
  assertCanonicalDirectChildRegularFile(paths.backupRoot, receiptPath, 'community_backup_receipt_invalid')
  const record = parseJsonFile(receiptPath) as CommunityBackupRecord
  if (!record || typeof record !== 'object' || typeof record.path !== 'string') {
    throw new Error('community_backup_receipt_invalid')
  }
  if (!isSamePhysicalPath(path.resolve(record.path), ownedBackupPath)) {
    throw new Error('community_backup_receipt_path_mismatch')
  }
  assertOwnedBackupFile(paths, record.path)
  assertInstalledReleaseLineage(paths, record.sourceRelease)
  await verifyCommunityBackupRecord(record)
  return record
}

export async function restoreCommunityBackup(options: {
  paths: CommunityInstallPaths
  backup: CommunityBackupRecord
  adapter: CommunityLifecycleAdapter
  confirmDataRewind: boolean
  now?: () => Date
  createId?: () => string
  snapshotRuntime?: CommunityBackupSnapshotRuntime
  signal?: AbortSignal
  operationJournal?: CommunityOperationJournalHandle
  operationReceipt?: CommunityOperationLockReceipt
}): Promise<{ status: 'restored'; backup: CommunityBackupRecord; replacementVolumeName: string }> {
  if (options.confirmDataRewind !== true) throw new Error('community_restore_data_rewind_confirmation_required')
  assertCommunityRecoveryMutationFence(options.paths, options.operationJournal && options.operationReceipt
    ? { handle: options.operationJournal, operation: 'restore', receipt: options.operationReceipt }
    : undefined)
  const state = readCommunityInstallState(options.paths)
  assertOwnedBackupFile(options.paths, options.backup.path)
  assertInstalledReleaseLineage(options.paths, options.backup.sourceRelease)
  await verifyCommunityBackupRecord(options.backup)
  if (options.backup.sourceRelease.manifestSha256 !== state.activeRelease.manifestSha256) {
    throw new Error('community_restore_source_release_mismatch')
  }
  await options.adapter.verifyRelease(state.activeRelease)
  const operationId = (options.createId ?? randomUUID)()
  if (!UUID.test(operationId)) throw new Error('community_restore_operation_id_invalid')
  const suffix = operationId.replace(/-/g, '')
  const replacementVolumeName = `${state.composeProjectName}-pg-restore-${suffix}`
  const volumeClaim = createPostgresVolumeClaim(state, replacementVolumeName, operationId)
  const snapshot = createVerifiedBackupSnapshot(options.paths, options.backup, operationId, options.snapshotRuntime)
  try {
    throwIfCommunityCommandAborted(options.signal)
    await options.adapter.claimFreshPostgresVolume({ paths: options.paths, state, claim: volumeClaim })
    throwIfCommunityCommandAborted(options.signal)
    await options.adapter.stop({ paths: options.paths, state })
    throwIfCommunityCommandAborted(options.signal)
    await options.adapter.restoreBackup({
      paths: options.paths,
      state,
      backup: options.backup,
      snapshot,
      volumeClaim,
    })
    await options.adapter.pull({ paths: options.paths, state, release: state.activeRelease })
    throwIfCommunityCommandAborted(options.signal)
    await options.adapter.start({
      paths: options.paths,
      state,
      release: state.activeRelease,
      postgresVolumeName: replacementVolumeName,
    })
    const validationState = { ...state, postgresVolumeName: replacementVolumeName }
    await options.adapter.health({ paths: options.paths, state: validationState })
    await options.adapter.dataSmoke({ paths: options.paths, state: validationState })
    throwIfCommunityCommandAborted(options.signal)
    await runLifecyclePromotion({
      journal: options.operationJournal,
      signal: options.signal,
      step: 'promote-restored-state',
      promote: () => {
        state.postgresVolumeName = replacementVolumeName
        state.updatedAt = nowIso(options.now ?? (() => new Date()))
        updateRuntimeEnvBindings(options.paths, state)
        persistState(options.paths, state)
      },
    })
    return { status: 'restored', backup: options.backup, replacementVolumeName }
  } finally {
    closeVerifiedBackupSnapshot(snapshot)
  }
}

export function buildCommunityComposeInvocation(params: {
  paths: CommunityInstallPaths
  state: CommunityInstallState
  action: 'pull' | 'up' | 'down' | 'stop' | 'restart' | 'status' | 'logs'
  release?: CommunityInstalledRelease
  postgresVolumeName?: string
  logsTail?: number
}): CommunityComposeInvocation {
  const release = params.release ?? params.state.activeRelease
  const prefix = buildCommunityComposeBaseInvocation({
    paths: params.paths,
    state: params.state,
    release,
    postgresVolumeName: params.postgresVolumeName,
  })
  const actionArgs: Record<typeof params.action, string[]> = {
    pull: ['pull'],
    up: ['up', '--no-build', '--detach', '--wait'],
    down: ['down'],
    stop: ['stop'],
    restart: ['restart'],
    status: ['ps'],
    logs: ['logs', '--tail', String(params.logsTail ?? 100)],
  }
  return { ...prefix, args: [...prefix.args, ...actionArgs[params.action]] }
}

export function buildCommunityComposeBaseInvocation(params: {
  paths: CommunityInstallPaths
  state: CommunityInstallState
  release?: CommunityInstalledRelease
  postgresVolumeName?: string
}): CommunityComposeInvocation {
  assertInstallStateLineage(params.paths, params.state)
  const release = params.release ?? params.state.activeRelease
  assertInstalledReleaseLineage(params.paths, release)
  const postgresVolumeName = params.postgresVolumeName ?? params.state.postgresVolumeName
  assertCommunityPostgresVolumeName(params.state, postgresVolumeName)
  const args = [
    'compose',
    '--project-name', params.state.composeProjectName,
    '--env-file', params.paths.envPath,
    '--file', release.composePath,
  ]
  return {
    command: 'docker',
    args,
    env: {
      AOPS_IMAGE_REF: release.imageRef,
      AOPS_POSTGRES_VOLUME_NAME: postgresVolumeName,
      COMPOSE_PROJECT_NAME: params.state.composeProjectName,
    },
  }
}

export async function updateCommunityInstall(options: {
  paths: CommunityInstallPaths
  targetRelease: CommunityInstalledRelease
  adapter: CommunityLifecycleAdapter
  now?: () => Date
  createId?: () => string
  signal?: AbortSignal
  operationJournal?: CommunityOperationJournalHandle
  operationReceipt?: CommunityOperationLockReceipt
}): Promise<CommunityUpdateRecord> {
  assertCommunityRecoveryMutationFence(options.paths, options.operationJournal && options.operationReceipt
    ? { handle: options.operationJournal, operation: 'update', receipt: options.operationReceipt }
    : undefined)
  const now = options.now ?? (() => new Date())
  const state = readCommunityInstallState(options.paths)
  assertInstalledReleaseLineage(options.paths, options.targetRelease)
  throwIfCommunityCommandAborted(options.signal)
  await options.adapter.verifyRelease(options.targetRelease)
  throwIfCommunityCommandAborted(options.signal)
  const backup = await options.adapter.createBackup({ paths: options.paths, state })
  throwIfCommunityCommandAborted(options.signal)
  assertOwnedBackupFile(options.paths, backup.path)
  assertInstalledReleaseLineage(options.paths, backup.sourceRelease)
  await verifyCommunityBackupRecord(backup)
  if (backup.sourceRelease.manifestSha256 !== state.activeRelease.manifestSha256) {
    throw new Error('community_backup_source_release_mismatch')
  }
  await runLifecyclePromotion({
    journal: options.operationJournal,
    signal: options.signal,
    step: 'write-backup-receipt',
    promote: () => writeCommunityBackupReceipt(options.paths, backup),
  })
  const updateId = (options.createId ?? randomUUID)()
  if (!UUID.test(updateId)) throw new Error('community_update_id_invalid')
  const record: CommunityUpdateRecord = {
    id: updateId,
    status: 'started',
    startedAt: nowIso(now),
    priorRelease: state.activeRelease,
    targetRelease: options.targetRelease,
    backup,
    sourcePostgresVolumeName: state.postgresVolumeName,
  }
  const ledger = readLedger(options.paths)
  if (ledger.some((entry) => entry.id === record.id)) throw new Error('community_update_id_conflict')
  await runLifecyclePromotion({
    journal: options.operationJournal,
    signal: options.signal,
    step: 'record-update-started',
    promote: () => writeLedger(options.paths, [...ledger, record]),
  })
  let migrationMayHaveStarted = false
  try {
    await options.adapter.stop({ paths: options.paths, state })
    throwIfCommunityCommandAborted(options.signal)
    await options.adapter.pull({ paths: options.paths, state, release: options.targetRelease })
    throwIfCommunityCommandAborted(options.signal)
    migrationMayHaveStarted = true
    await options.adapter.start({
      paths: options.paths,
      state,
      release: options.targetRelease,
      postgresVolumeName: state.postgresVolumeName,
    })
    const validationState = { ...state, activeRelease: options.targetRelease }
    await options.adapter.health({ paths: options.paths, state: validationState })
    await options.adapter.dataSmoke({ paths: options.paths, state: validationState })
    throwIfCommunityCommandAborted(options.signal)
    record.status = 'succeeded'
    record.finishedAt = nowIso(now)
    const nextState: CommunityInstallState = {
      ...state,
      updatedAt: record.finishedAt,
      activeRelease: options.targetRelease,
      previousRelease: state.activeRelease,
      lastSuccessfulUpdateId: record.id,
    }
    await runLifecyclePromotion({
      journal: options.operationJournal,
      signal: options.signal,
      step: 'promote-update-success',
      promote: () => {
        updateRuntimeEnvBindings(options.paths, nextState)
        persistState(options.paths, nextState)
        writeLedger(options.paths, [...ledger, record])
      },
    })
    return record
  } catch (error) {
    if (options.signal?.aborted) throw new Error('community_operation_aborted', { cause: error })
    record.status = 'failed'
    record.finishedAt = nowIso(now)
    record.failure = redactCommunityDiagnostic(error)
    record.migrationMayHaveStarted = migrationMayHaveStarted
    await runLifecyclePromotion({
      journal: options.operationJournal,
      step: 'record-update-failure',
      promote: () => writeLedger(options.paths, [...ledger, record]),
    })
    const suffix = migrationMayHaveStarted ? 'restore_from_backup_required' : 'pre_migration_failure'
    throw new Error(
      `community_update_failed:${suffix}:update_id=${record.id}:recover_with=aops-cli_server_recover:${record.failure}`,
      { cause: error },
    )
  }
}

function sameInstalledRelease(
  left: CommunityInstalledRelease | null,
  right: CommunityInstalledRelease,
): boolean {
  return left?.manifestSha256 === right.manifestSha256
    && left.manifestPath === right.manifestPath
    && left.composePath === right.composePath
}

function sameBackupRecord(left: CommunityBackupRecord, right: CommunityBackupRecord): boolean {
  return left.path === right.path
    && left.sha256 === right.sha256
    && left.byteLength === right.byteLength
    && left.verified === right.verified
    && left.createdAt === right.createdAt
    && sameInstalledRelease(left.sourceRelease, right.sourceRelease)
}

function reconcileLedgerForSourceRuntime(params: {
  paths: CommunityInstallPaths
  operation: CommunityOperation
  operationStartedAt: string
  expectedUpdateId?: string
  expectedRecoveryId?: string
  now: () => Date
}): { records: CommunityUpdateRecord[]; reconciledRecord?: CommunityUpdateRecord } {
  const ledger = readLedger(params.paths)
  const startedAt = Date.parse(params.operationStartedAt)
  if (!Number.isFinite(startedAt)) throw new Error('community_source_runtime_reconciliation_started_at_invalid')

  let candidateIndex = -1
  if (params.operation === 'update') {
    const candidates = ledger
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => !record.recoveredUpdateId && Date.parse(record.startedAt) >= startedAt)
    if (params.expectedUpdateId) {
      const exact = candidates.filter(({ record }) => record.id === params.expectedUpdateId)
      if (exact.length !== 1) throw new Error('community_source_runtime_reconciliation_update_mismatch')
      candidateIndex = exact[0]!.index
    } else if (candidates.length > 1) {
      throw new Error('community_source_runtime_reconciliation_update_ambiguous')
    } else if (candidates.length === 1) {
      candidateIndex = candidates[0]!.index
    }
  } else if (params.operation === 'recover' || params.operation === 'rollback') {
    const candidates = ledger
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => Boolean(record.recoveredUpdateId) && Date.parse(record.startedAt) >= startedAt)
    const exact = params.expectedRecoveryId
      ? candidates.filter(({ record }) => record.id === params.expectedRecoveryId && record.recoveredUpdateId === params.expectedUpdateId)
      : candidates
    if (exact.length > 1) throw new Error('community_source_runtime_reconciliation_recovery_ambiguous')
    if (params.expectedRecoveryId && exact.length !== 1) {
      throw new Error('community_source_runtime_reconciliation_recovery_mismatch')
    }
    if (exact.length === 1) candidateIndex = exact[0]!.index
  }

  if (candidateIndex < 0) {
    assertCommunityLedgerHasNoNonterminalOperation(params.paths)
    return { records: ledger }
  }
  if (candidateIndex !== ledger.length - 1) {
    throw new Error('community_source_runtime_reconciliation_record_not_latest')
  }
  const candidate = ledger[candidateIndex]!
  if (params.operation === 'update') {
    if (!['started', 'failed', 'succeeded'].includes(candidate.status)) {
      throw new Error('community_source_runtime_reconciliation_update_status_invalid')
    }
    const reconciledRecord: CommunityUpdateRecord = {
      ...candidate,
      status: 'failed',
      finishedAt: nowIso(params.now),
      failure: SOURCE_RUNTIME_RECONCILIATION_MARKER,
      migrationMayHaveStarted: true,
    }
    return { records: [...ledger.slice(0, candidateIndex), reconciledRecord], reconciledRecord }
  }
  if (!['recovery-started', 'recovery-failed', 'recovered', 'rolled-back'].includes(candidate.status) ||
      !candidate.recoveredUpdateId) {
    throw new Error('community_source_runtime_reconciliation_recovery_status_invalid')
  }
  const update = ledger.find((record) => record.id === candidate.recoveredUpdateId)
  if (!update || (update.status !== 'failed' && update.status !== 'succeeded')) {
    throw new Error('community_source_runtime_reconciliation_update_mismatch')
  }
  const reconciledRecord: CommunityUpdateRecord = {
    ...candidate,
    status: 'recovery-failed',
    finishedAt: nowIso(params.now),
    failure: SOURCE_RUNTIME_RECONCILIATION_MARKER,
  }
  return { records: [...ledger.slice(0, candidateIndex), reconciledRecord], reconciledRecord }
}

function commitRestoredCommunitySourceMetadata(params: {
  paths: CommunityInstallPaths
  sourceState: CommunityInstallState
  nextLedger: CommunityUpdateRecord[]
}): void {
  const priorEnv = readFileSync(params.paths.envPath, 'utf8')
  const priorState = readFileSync(params.paths.statePath, 'utf8')
  const priorLedger = readFileSync(params.paths.ledgerPath, 'utf8')
  const nextEnv = renderUpdatedRuntimeEnvBindings(priorEnv, params.sourceState)
  const nextState = serializeState(params.paths, params.sourceState)
  const nextLedger = serializeLedger(params.paths, params.nextLedger)
  try {
    atomicWrite(params.paths.envPath, nextEnv, 0o600)
    persistState(params.paths, params.sourceState)
    writeLedger(params.paths, params.nextLedger)
  } catch (error) {
    const rollbackErrors: string[] = []
    for (const [filePath, content] of [
      [params.paths.envPath, priorEnv],
      [params.paths.statePath, priorState],
      [params.paths.ledgerPath, priorLedger],
    ] as const) {
      try {
        atomicWrite(filePath, content, 0o600)
      } catch (rollbackError) {
        rollbackErrors.push(redactCommunityDiagnostic(rollbackError))
      }
    }
    if (rollbackErrors.length > 0) {
      throw new Error(
        `community_source_runtime_metadata_reconciliation_required:commit=${redactCommunityDiagnostic(error)}:rollback=${rollbackErrors.join('|')}`,
        { cause: error },
      )
    }
    throw new Error(`community_source_runtime_metadata_commit_failed:${redactCommunityDiagnostic(error)}`, { cause: error })
  }
  // The three promoted files must be exactly the content that was validated above.
  if (readFileSync(params.paths.envPath, 'utf8') !== nextEnv ||
      readFileSync(params.paths.statePath, 'utf8') !== nextState ||
      readFileSync(params.paths.ledgerPath, 'utf8') !== nextLedger) {
    throw new Error('community_source_runtime_metadata_postcondition_failed')
  }
}

export async function restoreCommunitySourceRuntime(options: {
  paths: CommunityInstallPaths
  sourceState: CommunityInstallState
  operation: CommunityOperation
  operationStartedAt: string
  adapter: CommunityLifecycleAdapter
  confirmDataRewind: boolean
  expectedUpdateId?: string
  expectedRecoveryId?: string
  signal?: AbortSignal
  now?: () => Date
}): Promise<{ state: CommunityInstallState; reconciledRecord?: CommunityUpdateRecord }> {
  if (options.confirmDataRewind !== true) {
    throw new Error('community_source_runtime_data_rewind_confirmation_required')
  }
  if ((options.expectedUpdateId && !UUID.test(options.expectedUpdateId)) ||
      (options.expectedRecoveryId && !UUID.test(options.expectedRecoveryId))) {
    throw new Error('community_source_runtime_reconciliation_id_invalid')
  }
  assertNoRecoveryCommitJournal(options.paths)
  assertInstallStateLineage(options.paths, options.sourceState)
  const next = reconcileLedgerForSourceRuntime({
    paths: options.paths,
    operation: options.operation,
    operationStartedAt: options.operationStartedAt,
    expectedUpdateId: options.expectedUpdateId,
    expectedRecoveryId: options.expectedRecoveryId,
    now: options.now ?? (() => new Date()),
  })
  throwIfCommunityCommandAborted(options.signal)
  // Down the exact compose project first so a half-switched target cannot keep running.
  await options.adapter.stop({ paths: options.paths, state: options.sourceState })
  throwIfCommunityCommandAborted(options.signal)
  await options.adapter.verifyRelease(options.sourceState.activeRelease)
  throwIfCommunityCommandAborted(options.signal)
  await options.adapter.pull({ paths: options.paths, state: options.sourceState, release: options.sourceState.activeRelease })
  throwIfCommunityCommandAborted(options.signal)
  await options.adapter.start({
    paths: options.paths,
    state: options.sourceState,
    release: options.sourceState.activeRelease,
    postgresVolumeName: options.sourceState.postgresVolumeName,
  })
  await options.adapter.health({ paths: options.paths, state: options.sourceState })
  await options.adapter.dataSmoke({ paths: options.paths, state: options.sourceState })
  throwIfCommunityCommandAborted(options.signal)
  commitRestoredCommunitySourceMetadata({
    paths: options.paths,
    sourceState: options.sourceState,
    nextLedger: next.records,
  })
  throwIfCommunityCommandAborted(options.signal)
  assertCommunityLedgerHasNoNonterminalOperation(options.paths)
  return { state: options.sourceState, reconciledRecord: next.reconciledRecord }
}

export async function recoverCommunityUpdate(options: {
  paths: CommunityInstallPaths
  updateId: string
  adapter: CommunityLifecycleAdapter
  confirmDataRewind: boolean
  retryRecoveryId?: string
  mode?: 'recover' | 'rollback'
  now?: () => Date
  createId?: () => string
  commitRuntime?: CommunityRecoveryCommitRuntime
  snapshotRuntime?: CommunityBackupSnapshotRuntime
  signal?: AbortSignal
  operationJournal?: CommunityOperationJournalHandle
  operationReceipt?: CommunityOperationLockReceipt
}): Promise<CommunityUpdateRecord> {
  const mode = options.mode ?? 'recover'
  if (options.confirmDataRewind !== true) throw new Error('community_recover_data_rewind_confirmation_required')
  if (!UUID.test(options.updateId)) throw new Error('community_recover_update_id_invalid')
  assertCommunityRecoveryMutationFence(options.paths, options.operationJournal && options.operationReceipt
    ? { handle: options.operationJournal, operation: options.mode === 'rollback' ? 'rollback' : 'recover', receipt: options.operationReceipt }
    : undefined)
  const now = options.now ?? (() => new Date())
  const state = readCommunityInstallState(options.paths)
  const ledger = readLedger(options.paths)
  const priorAttempts = ledger.filter((entry) => entry.recoveredUpdateId === options.updateId)
  const priorAttempt = priorAttempts.at(-1)
  if (priorAttempt?.status === 'recovery-failed') {
    if (options.retryRecoveryId !== priorAttempt.id) {
      throw new Error(`community_recover_retry_confirmation_required:retry_recovery_id=${priorAttempt.id}`)
    }
  } else if (priorAttempt?.status === 'recovery-started') {
    throw new Error(`community_recovery_reconciliation_required:recovery_id=${priorAttempt.id}`)
  } else if (priorAttempt) {
    throw new Error(`community_recover_attempt_already_recorded:${priorAttempt.status}:recovery_id=${priorAttempt.id}`)
  }
  const matches = ledger.filter((entry) => entry.id === options.updateId)
  if (matches.length !== 1) throw new Error('community_recover_update_record_missing_or_ambiguous')
  const update = matches[0]!
  if (update.status !== 'failed' && update.status !== 'succeeded') {
    throw new Error(`community_recover_update_status_invalid:${update.status}`)
  }
  if (mode === 'rollback' && update.status !== 'succeeded') {
    throw new Error('community_rollback_update_record_missing')
  }
  const expectedLatestId = priorAttempt?.status === 'recovery-failed' ? priorAttempt.id : update.id
  if (update.status === 'failed' && ledger.at(-1)?.id !== expectedLatestId) {
    throw new Error('community_recover_failed_update_not_latest')
  }
  assertUpdateRecordLineage(options.paths, update)
  if (state.postgresVolumeName !== update.sourcePostgresVolumeName) {
    throw new Error('community_recover_source_volume_mismatch')
  }
  if (update.status === 'failed') {
    if (!sameInstalledRelease(state.activeRelease, update.priorRelease) || state.lastSuccessfulUpdateId === update.id) {
      throw new Error('community_recover_failed_update_state_mismatch')
    }
    if (typeof update.migrationMayHaveStarted !== 'boolean') {
      throw new Error('community_recover_failed_update_phase_unknown')
    }
  } else if (
    !sameInstalledRelease(state.activeRelease, update.targetRelease)
    || !sameInstalledRelease(state.previousRelease, update.priorRelease)
    || state.lastSuccessfulUpdateId !== update.id
  ) {
    throw new Error('community_recover_succeeded_update_state_mismatch')
  }

  const receipt = await readCommunityBackupReceipt(options.paths, update.backup.path)
  if (!sameBackupRecord(receipt, update.backup)) {
    throw new Error('community_recover_backup_receipt_mismatch')
  }
  if (!sameInstalledRelease(receipt.sourceRelease, update.priorRelease)) {
    throw new Error('community_recover_backup_release_mismatch')
  }

  const requiresRestore = update.status === 'succeeded' || update.migrationMayHaveStarted === true
  const createId = options.createId ?? randomUUID
  const purpose = mode === 'rollback' ? 'rollback' : 'recover'
  const updateSuffix = update.id.replace(/-/g, '')
  const recoveryId = createId()
  if (!UUID.test(recoveryId) || ledger.some((entry) => entry.id === recoveryId)) {
    throw new Error('community_recover_record_id_invalid')
  }
  const recoverySuffix = recoveryId.replace(/-/g, '')
  const replacementVolumeName = requiresRestore
    ? `${state.composeProjectName}-pg-${purpose}-${updateSuffix}-${recoverySuffix}`
    : state.postgresVolumeName
  const volumeClaim = requiresRestore
    ? createPostgresVolumeClaim(state, replacementVolumeName, recoveryId)
    : undefined
  const startedAt = nowIso(now)
  const recoveryRecord: CommunityUpdateRecord = {
    ...update,
    id: recoveryId,
    status: 'recovery-started',
    startedAt,
    finishedAt: undefined,
    recoveredUpdateId: update.id,
    ...(requiresRestore ? { replacementVolumeName } : {}),
    ...(volumeClaim ? { volumeClaimSha256: volumeClaim.claimTokenSha256 } : {}),
  }

  let snapshot: CommunityVerifiedBackupSnapshot | undefined
  try {
    throwIfCommunityCommandAborted(options.signal)
    await options.adapter.verifyRelease(update.priorRelease)
    throwIfCommunityCommandAborted(options.signal)
    if (requiresRestore) {
      snapshot = createVerifiedBackupSnapshot(options.paths, receipt, recoveryId, options.snapshotRuntime)
      await options.adapter.claimFreshPostgresVolume({
        paths: options.paths,
        state,
        claim: volumeClaim!,
      })
      throwIfCommunityCommandAborted(options.signal)
    }
    // Publish the claim receipt only after Docker proved this process created and owns the volume.
    // Keeping the random claim digest private until then makes a create race distinguishable.
    await runLifecyclePromotion({
      journal: options.operationJournal,
      signal: options.signal,
      step: 'record-recovery-started',
      promote: () => writeLedger(options.paths, [...ledger, recoveryRecord]),
    })
    await options.adapter.stop({ paths: options.paths, state })
    throwIfCommunityCommandAborted(options.signal)
    if (requiresRestore) {
      await options.adapter.restoreBackup({
        paths: options.paths,
        state,
        backup: receipt,
        snapshot: snapshot!,
        volumeClaim: volumeClaim!,
      })
    }
    await options.adapter.pull({ paths: options.paths, state, release: update.priorRelease })
    throwIfCommunityCommandAborted(options.signal)
    await options.adapter.start({
      paths: options.paths,
      state,
      release: update.priorRelease,
      postgresVolumeName: replacementVolumeName,
    })
    const validationState = {
      ...state,
      activeRelease: update.priorRelease,
      postgresVolumeName: replacementVolumeName,
    }
    await options.adapter.health({ paths: options.paths, state: validationState })
    await options.adapter.dataSmoke({ paths: options.paths, state: validationState })
    throwIfCommunityCommandAborted(options.signal)

    const finishedAt = nowIso(now)
    recoveryRecord.status = mode === 'rollback' ? 'rolled-back' : 'recovered'
    recoveryRecord.finishedAt = finishedAt
    const nextState: CommunityInstallState = {
      ...state,
      postgresVolumeName: replacementVolumeName,
      updatedAt: finishedAt,
      activeRelease: update.priorRelease,
      previousRelease: update.status === 'succeeded' ? update.targetRelease : state.previousRelease,
      lastSuccessfulUpdateId: update.status === 'succeeded' ? null : state.lastSuccessfulUpdateId,
    }
    const priorEnvContent = readFileSync(options.paths.envPath, 'utf8')
    const priorStateContent = readFileSync(options.paths.statePath, 'utf8')
    const priorLedgerContent = readFileSync(options.paths.ledgerPath, 'utf8')
    const nextLedger = [...ledger, recoveryRecord]
    await runLifecyclePromotion({
      journal: options.operationJournal,
      signal: options.signal,
      step: 'promote-recovery-success',
      promote: () => commitRecoveredInstallState({
        paths: options.paths,
        updateId: update.id,
        recoveryId: recoveryRecord.id,
        createdAt: finishedAt,
        priorEnvContent,
        priorStateContent,
        priorLedgerContent,
        nextEnvContent: renderUpdatedRuntimeEnvBindings(priorEnvContent, nextState),
        nextStateContent: serializeState(options.paths, nextState),
        nextLedgerContent: serializeLedger(options.paths, nextLedger),
        nextState,
        nextLedger,
        runtime: options.commitRuntime,
      }),
    })
    return recoveryRecord
  } catch (error) {
    if (options.signal?.aborted) throw new Error('community_operation_aborted', { cause: error })
    if (tryLstat(options.paths.recoveryJournalPath)) {
      throw new Error(redactCommunityDiagnostic(error), { cause: error })
    }
    recoveryRecord.status = 'recovery-failed'
    recoveryRecord.finishedAt = nowIso(now)
    recoveryRecord.failure = redactCommunityDiagnostic(error)
    await runLifecyclePromotion({
      journal: options.operationJournal,
      step: 'record-recovery-failure',
      promote: () => writeLedger(options.paths, [...ledger, recoveryRecord]),
    })
    throw new Error(
      `community_recover_failed:update_id=${update.id}:recovery_id=${recoveryRecord.id}:target_volume=${replacementVolumeName}:${recoveryRecord.failure}`,
      { cause: error },
    )
  } finally {
    if (snapshot) closeVerifiedBackupSnapshot(snapshot)
  }
}

export async function rollbackCommunityInstall(options: {
  paths: CommunityInstallPaths
  adapter: CommunityLifecycleAdapter
  confirmDataRewind: boolean
  now?: () => Date
  createId?: () => string
  signal?: AbortSignal
  operationJournal?: CommunityOperationJournalHandle
  operationReceipt?: CommunityOperationLockReceipt
}): Promise<CommunityUpdateRecord> {
  if (options.confirmDataRewind !== true) throw new Error('community_rollback_data_rewind_confirmation_required')
  const state = readCommunityInstallState(options.paths)
  if (!state.previousRelease || !state.lastSuccessfulUpdateId) {
    throw new Error('community_rollback_prior_release_missing')
  }
  return recoverCommunityUpdate({
    ...options,
    updateId: state.lastSuccessfulUpdateId,
    confirmDataRewind: true,
    mode: 'rollback',
  })
}
