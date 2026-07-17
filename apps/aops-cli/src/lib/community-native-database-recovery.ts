import { createHash, randomBytes, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import {
  planCommunityStrictPgSchema,
  type CommunityStrictSnapshotEvidenceV1,
} from '@aops/pg-bootstrap'

import {
  createCommunityNativeApplicationReferenceV1,
  readCommunityNativeApplicationUpdate,
  sameCommunityNativeApplicationContent,
} from './community-native-application-recovery.js'
import {
  assertCommunityNativeRestoredSnapshotStateV1,
  cleanupCommunityNativeManagedRestoreRescueV1,
  readCommunityNativeSnapshotEvidenceV1,
  restoreCommunityNativeManagedSnapshotV1,
  type CommunityNativeManagedRestorePhaseV1,
} from './community-migration-snapshot.js'
import {
  inspectCommunityNativeSource,
  loadExternalPostgresUrl,
  type CommunityNativeInstallState,
  type CommunityNativePaths,
} from './community-native-lifecycle.js'
import { planCommunityNativeMigration } from './community-native-migration.js'
import type { CommunityNativePostgresRuntime } from './community-native-postgres.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RAW_SHA256 = /^[a-f0-9]{64}$/
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/
const MAX_RECORD_BYTES = 1024 * 1024

function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export type CommunityNativeDatabaseRestorePreparedV1 = Readonly<{
  schemaVersion: 1
  status: 'community-native-database-restore-prepared'
  restoreId: string
  updateId: string
  instanceName: string
  installId: string
  createdAt: string
  recoveryOwner: 'managed' | 'external'
  evidenceKind: CommunityStrictSnapshotEvidenceV1['kind']
  evidencePath: string
  evidenceSha256: string
  sourceApplicationContentSha256: string
  targetApplicationContentSha256: string
  sourceMigrationStateFingerprintSha256: string
}>

export type CommunityNativeDatabaseRestoreCompletedV1 = Readonly<{
  schemaVersion: 1
  status: 'community-native-database-restored'
  restoreId: string
  updateId: string
  instanceName: string
  completedAt: string
  recoveryOwner: 'managed' | 'external'
  evidenceKind: CommunityStrictSnapshotEvidenceV1['kind']
  evidenceSha256: string
  restoredLineageId: string
  restoredMigrationStateFingerprintSha256: string
  restoredSchemaFingerprintSha256: string
  restoredReceiptFingerprintSha256: string
  restoredDataFingerprintSha256: string
  restoredStateFingerprintSha256: string
  rescueDatabase: string | null
}>

export type CommunityNativeDatabaseRestoreResultV1 = Readonly<{
  prepared: CommunityNativeDatabaseRestorePreparedV1
  completed: CommunityNativeDatabaseRestoreCompletedV1 | null
  actionRequired: boolean
  dataRewound: boolean
  externalAction: null | Readonly<{
    provider: string
    snapshotRef: string
    snapshotDigest: string | null
    restoreInstructionsRef: string
  }>
}>

export type CommunityNativeDatabaseRecoveryStatusV1 = Readonly<{
  restoreId: string
  updateId: string
  recoveryOwner: CommunityNativeDatabaseRestorePreparedV1['recoveryOwner']
  evidenceKind: CommunityNativeDatabaseRestorePreparedV1['evidenceKind']
  status: CommunityNativeDatabaseRestorePreparedV1['status'] | CommunityNativeDatabaseRestoreCompletedV1['status']
  preparedAt: string
  completedAt: string | null
  actionRequired: boolean
}>

export type CommunityNativeDatabaseRecoveryDependencies = Readonly<{
  postgresRuntime?: CommunityNativePostgresRuntime
  planNativeMigration?: typeof planCommunityNativeMigration
  planStrictPgSchema?: typeof planCommunityStrictPgSchema
  restoreManagedSnapshot?: typeof restoreCommunityNativeManagedSnapshotV1
  cleanupManagedRescue?: typeof cleanupCommunityNativeManagedRestoreRescueV1
  now?: () => Date
  createId?: () => string
}>

function samePath(left: string, right: string): boolean {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function fsyncDirectoryBestEffortOnWindows(directory: string): void {
  let descriptor: number | undefined
  try {
    descriptor = openSync(directory, 'r')
    fsyncSync(descriptor)
  } catch (error) {
    const code = String((error as NodeJS.ErrnoException).code)
    if (process.platform !== 'win32' || !['EACCES', 'EBADF', 'EINVAL', 'EISDIR', 'EPERM'].includes(code)) throw error
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function ensureRestoreRoot(paths: CommunityNativePaths): string {
  const root = path.resolve(paths.databaseRestoreRoot)
  if (!samePath(path.dirname(root), paths.runtimeRoot)) {
    throw new Error('community_native_database_restore_root_unsafe')
  }
  const existed = existsSync(root)
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const stats = lstatSync(root)
  if (!stats.isDirectory() || stats.isSymbolicLink() || !samePath(realpathSync.native(root), root)) {
    throw new Error('community_native_database_restore_root_unsafe')
  }
  if (!existed) fsyncDirectoryBestEffortOnWindows(paths.runtimeRoot)
  return root
}

function writeExclusive(paths: CommunityNativePaths, fileName: string, value: unknown): string {
  const root = ensureRestoreRoot(paths)
  const target = path.join(root, fileName)
  if (!samePath(path.dirname(target), root) || existsSync(target)) {
    throw new Error('community_native_database_restore_record_already_exists')
  }
  const temp = path.join(root, `.${fileName}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`)
  let descriptor: number | undefined
  try {
    descriptor = openSync(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8' })
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    try {
      linkSync(temp, target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error('community_native_database_restore_record_already_exists')
      }
      throw error
    }
    fsyncDirectoryBestEffortOnWindows(root)
    rmSync(temp, { force: true })
    fsyncDirectoryBestEffortOnWindows(root)
    return target
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    rmSync(temp, { force: true })
  }
}

function readRecord(paths: CommunityNativePaths, fileName: string): unknown | null {
  const root = ensureRestoreRoot(paths)
  const target = path.join(root, fileName)
  if (!existsSync(target)) return null
  const stats = lstatSync(target, { bigint: true })
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1n || stats.size > BigInt(MAX_RECORD_BYTES) ||
      !samePath(realpathSync.native(target), target) || !samePath(path.dirname(target), root)) {
    throw new Error('community_native_database_restore_record_unsafe')
  }
  let descriptor: number | undefined
  try {
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
    descriptor = openSync(target, constants.O_RDONLY | noFollow)
    const before = fstatSync(descriptor, { bigint: true })
    if (before.dev !== stats.dev || before.ino !== stats.ino || before.size !== stats.size || before.nlink !== 1n) {
      throw new Error('community_native_database_restore_record_unsafe')
    }
    const value = JSON.parse(readFileSync(descriptor, 'utf8')) as unknown
    const after = fstatSync(descriptor, { bigint: true })
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size ||
        after.nlink !== before.nlink || after.mtimeNs !== before.mtimeNs) {
      throw new Error('community_native_database_restore_record_unsafe')
    }
    return value
  } catch {
    throw new Error('community_native_database_restore_record_invalid')
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) throw new Error(code)
}

function assertPrepared(value: unknown): CommunityNativeDatabaseRestorePreparedV1 {
  if (!isRecord(value)) throw new Error('community_native_database_restore_prepared_invalid')
  exactKeys(value, [
    'schemaVersion', 'status', 'restoreId', 'updateId', 'instanceName', 'installId', 'createdAt',
    'recoveryOwner', 'evidenceKind', 'evidencePath', 'evidenceSha256',
    'sourceApplicationContentSha256', 'targetApplicationContentSha256',
    'sourceMigrationStateFingerprintSha256',
  ], 'community_native_database_restore_prepared_invalid')
  if (value.schemaVersion !== 1 || value.status !== 'community-native-database-restore-prepared' ||
      !UUID.test(String(value.restoreId)) || !UUID.test(String(value.updateId)) || !UUID.test(String(value.installId)) ||
      typeof value.instanceName !== 'string' || value.instanceName.length < 1 || Number.isNaN(Date.parse(String(value.createdAt))) ||
      !['managed', 'external'].includes(String(value.recoveryOwner)) ||
      !['managed-verified-backup', 'external-snapshot-attestation'].includes(String(value.evidenceKind)) ||
      !path.isAbsolute(String(value.evidencePath)) ||
      ![value.evidenceSha256, value.sourceMigrationStateFingerprintSha256].every((item) => RAW_SHA256.test(String(item))) ||
      ![value.sourceApplicationContentSha256, value.targetApplicationContentSha256]
        .every((item) => PREFIXED_SHA256.test(String(item)))) {
    throw new Error('community_native_database_restore_prepared_invalid')
  }
  if ((value.recoveryOwner === 'managed') !== (value.evidenceKind === 'managed-verified-backup')) {
    throw new Error('community_native_database_restore_prepared_invalid')
  }
  return value as CommunityNativeDatabaseRestorePreparedV1
}

function assertCompleted(value: unknown): CommunityNativeDatabaseRestoreCompletedV1 {
  if (!isRecord(value)) throw new Error('community_native_database_restore_completed_invalid')
  exactKeys(value, [
    'schemaVersion', 'status', 'restoreId', 'updateId', 'instanceName', 'completedAt', 'recoveryOwner',
    'evidenceKind', 'evidenceSha256', 'restoredLineageId', 'restoredMigrationStateFingerprintSha256',
    'restoredSchemaFingerprintSha256', 'restoredReceiptFingerprintSha256', 'restoredDataFingerprintSha256',
    'restoredStateFingerprintSha256', 'rescueDatabase',
  ], 'community_native_database_restore_completed_invalid')
  if (value.schemaVersion !== 1 || value.status !== 'community-native-database-restored' ||
      !UUID.test(String(value.restoreId)) || !UUID.test(String(value.updateId)) ||
      typeof value.instanceName !== 'string' || value.instanceName.length < 1 ||
      Number.isNaN(Date.parse(String(value.completedAt))) ||
      !['managed', 'external'].includes(String(value.recoveryOwner)) ||
      !['managed-verified-backup', 'external-snapshot-attestation'].includes(String(value.evidenceKind)) ||
      !RAW_SHA256.test(String(value.evidenceSha256)) || typeof value.restoredLineageId !== 'string' ||
      value.restoredLineageId.length < 1 ||
      ![
        value.restoredMigrationStateFingerprintSha256, value.restoredSchemaFingerprintSha256,
        value.restoredReceiptFingerprintSha256, value.restoredDataFingerprintSha256,
        value.restoredStateFingerprintSha256,
      ].every((item) => RAW_SHA256.test(String(item))) ||
      (value.rescueDatabase !== null && typeof value.rescueDatabase !== 'string')) {
    throw new Error('community_native_database_restore_completed_invalid')
  }
  return value as CommunityNativeDatabaseRestoreCompletedV1
}

function findPrepared(paths: CommunityNativePaths, updateId: string): CommunityNativeDatabaseRestorePreparedV1 | null {
  const root = ensureRestoreRoot(paths)
  const matches = readdirSync(root)
    .filter((name) => name.endsWith('.prepared.json'))
    .map((name) => assertPrepared(readRecord(paths, name)))
    .filter((record) => record.updateId === updateId)
  if (matches.length > 1) throw new Error('community_native_database_restore_prepared_ambiguous')
  return matches[0] ?? null
}

export function inspectCommunityNativeDatabaseRecoveryStatus(
  paths: CommunityNativePaths,
): CommunityNativeDatabaseRecoveryStatusV1 | null {
  if (!existsSync(paths.databaseRestoreRoot)) return null
  const root = ensureRestoreRoot(paths)
  const preparedRecords = readdirSync(root)
    .filter((name) => name.endsWith('.prepared.json'))
    .map((name) => assertPrepared(readRecord(paths, name)))
    .sort((left, right) => {
      const byTime = Date.parse(right.createdAt) - Date.parse(left.createdAt)
      return byTime === 0 ? right.restoreId.localeCompare(left.restoreId) : byTime
    })
  const prepared = preparedRecords[0]
  if (!prepared) return null
  const completedRaw = readRecord(paths, `${prepared.restoreId}.completed.json`)
  const completed = completedRaw === null ? null : assertCompleted(completedRaw)
  if (completed && (
    completed.restoreId !== prepared.restoreId ||
    completed.updateId !== prepared.updateId ||
    completed.instanceName !== prepared.instanceName ||
    completed.recoveryOwner !== prepared.recoveryOwner ||
    completed.evidenceKind !== prepared.evidenceKind ||
    completed.evidenceSha256 !== prepared.evidenceSha256
  )) {
    throw new Error('community_native_database_restore_completed_conflict')
  }
  return {
    restoreId: prepared.restoreId,
    updateId: prepared.updateId,
    recoveryOwner: prepared.recoveryOwner,
    evidenceKind: prepared.evidenceKind,
    status: completed?.status ?? prepared.status,
    preparedAt: prepared.createdAt,
    completedAt: completed?.completedAt ?? null,
    actionRequired: completed === null,
  }
}

function writePhase(params: {
  paths: CommunityNativePaths
  prepared: CommunityNativeDatabaseRestorePreparedV1
  phase: CommunityNativeManagedRestorePhaseV1
  now: () => Date
}): void {
  const fileName = `${params.prepared.restoreId}.${params.phase}.json`
  const existing = readRecord(params.paths, fileName)
  if (existing !== null) {
    if (!isRecord(existing) || existing.schemaVersion !== 1 || existing.status !== 'community-native-database-restore-phase' ||
        existing.restoreId !== params.prepared.restoreId || existing.updateId !== params.prepared.updateId ||
        existing.phase !== params.phase) {
      throw new Error('community_native_database_restore_phase_conflict')
    }
    return
  }
  writeExclusive(params.paths, fileName, {
    schemaVersion: 1,
    status: 'community-native-database-restore-phase',
    restoreId: params.prepared.restoreId,
    updateId: params.prepared.updateId,
    phase: params.phase,
    recordedAt: params.now().toISOString(),
  })
}

function assertPriorSource(params: {
  sourceRoot: string
  prepared: ReturnType<typeof readCommunityNativeApplicationUpdate>['prepared']
}): void {
  const source = inspectCommunityNativeSource(params.sourceRoot)
  const expected = params.prepared.prior.content
  if (source.releaseVersion !== expected.releaseVersion || source.packageSha256 !== expected.packageSha256 ||
      source.lockfileSha256 !== expected.lockfileSha256 || source.sourceFileCount !== expected.sourceFileCount ||
      source.sourceInventorySha256 !== expected.sourceInventorySha256) {
    throw new Error('community_native_database_restore_prior_source_mismatch')
  }
}

function evidenceFileName(kind: CommunityStrictSnapshotEvidenceV1['kind'], planSha256: string): string {
  return `${kind === 'managed-verified-backup' ? 'managed' : 'external'}-${planSha256}.json`
}

function completedResult(
  prepared: CommunityNativeDatabaseRestorePreparedV1,
  completed: CommunityNativeDatabaseRestoreCompletedV1,
): CommunityNativeDatabaseRestoreResultV1 {
  return { prepared, completed, actionRequired: false, dataRewound: true, externalAction: null }
}

export async function restoreCommunityNativeDatabaseForUpdate(params: {
  paths: CommunityNativePaths
  state: CommunityNativeInstallState
  updateId: string
  sourceRoot: string
  confirmDataRewind: boolean
  confirmExternalRestoreComplete?: boolean
  signal?: AbortSignal
}, dependencies: CommunityNativeDatabaseRecoveryDependencies = {}): Promise<CommunityNativeDatabaseRestoreResultV1> {
  if (!UUID.test(params.updateId) || !path.isAbsolute(params.sourceRoot) || params.confirmDataRewind !== true) {
    throw new Error('community_native_database_restore_confirmation_required')
  }
  if (params.signal?.aborted) throw new Error('community_operation_aborted')
  const now = dependencies.now ?? (() => new Date())
  const update = readCommunityNativeApplicationUpdate(params.paths, params.updateId)
  if (update.prepared.instanceName !== params.state.instanceName || update.prepared.installId !== params.state.installId) {
    throw new Error('community_native_database_restore_update_instance_mismatch')
  }
  if (!update.outcome || !update.outcome.migration || update.outcome.migration.action !== 'migrate' ||
      !update.outcome.migration.snapshotEvidenceKind ||
      !update.outcome.migration.snapshotEvidenceSha256) {
    throw new Error('community_native_database_restore_migrating_update_required')
  }
  assertPriorSource({ sourceRoot: params.sourceRoot, prepared: update.prepared })
  const migration = update.outcome.migration
  const evidenceKind = migration.snapshotEvidenceKind
  const evidenceSha256 = migration.snapshotEvidenceSha256
  if (evidenceKind === null || evidenceSha256 === null) {
    throw new Error('community_native_database_restore_migrating_update_required')
  }
  const evidencePath = path.join(
    params.paths.migrationEvidenceRoot,
    evidenceFileName(evidenceKind, migration.acceptedPlanSha256),
  )
  const evidenceRead = readCommunityNativeSnapshotEvidenceV1({
    evidenceRoot: params.paths.migrationEvidenceRoot,
    evidencePath,
    expectedEvidenceSha256: evidenceSha256,
    expectedKind: evidenceKind,
  })
  if (evidenceRead.evidence.acceptedPlanSha256 !== migration.acceptedPlanSha256 ||
      evidenceRead.evidence.sourceMigrationStateFingerprintSha256 !== migration.sourceMigrationStateFingerprintSha256) {
    throw new Error('community_native_database_restore_evidence_update_mismatch')
  }
  const recoveryOwner = evidenceRead.evidence.kind === 'managed-verified-backup' ? 'managed' : 'external'
  let prepared = findPrepared(params.paths, params.updateId)
  if (!prepared) {
    const restoreId = (dependencies.createId ?? randomUUID)()
    prepared = assertPrepared({
      schemaVersion: 1,
      status: 'community-native-database-restore-prepared',
      restoreId,
      updateId: params.updateId,
      instanceName: params.state.instanceName,
      installId: params.state.installId,
      createdAt: now().toISOString(),
      recoveryOwner,
      evidenceKind: evidenceRead.evidence.kind,
      evidencePath: evidenceRead.evidencePath,
      evidenceSha256: evidenceRead.evidenceSha256,
      sourceApplicationContentSha256: update.prepared.prior.content.applicationContentSha256,
      targetApplicationContentSha256: update.prepared.target.content.applicationContentSha256,
      sourceMigrationStateFingerprintSha256: migration.sourceMigrationStateFingerprintSha256,
    })
    writeExclusive(params.paths, `${prepared.restoreId}.prepared.json`, prepared)
  }
  if (prepared.updateId !== params.updateId || prepared.evidenceSha256 !== evidenceRead.evidenceSha256 ||
      prepared.evidenceKind !== evidenceRead.evidence.kind || !samePath(prepared.evidencePath, evidenceRead.evidencePath) ||
      prepared.recoveryOwner !== recoveryOwner) {
    throw new Error('community_native_database_restore_prepared_conflict')
  }
  const completedRaw = readRecord(params.paths, `${prepared.restoreId}.completed.json`)
  if (completedRaw !== null) {
    const completed = assertCompleted(completedRaw)
    if (completed.restoreId !== prepared.restoreId || completed.updateId !== prepared.updateId ||
        completed.evidenceSha256 !== prepared.evidenceSha256) {
      throw new Error('community_native_database_restore_completed_conflict')
    }
    if (completed.recoveryOwner === 'managed' && params.state.profile === 'native-container-postgres') {
      await (dependencies.cleanupManagedRescue ?? cleanupCommunityNativeManagedRestoreRescueV1)({
        restoreId: prepared.restoreId,
        receiptRoot: params.paths.databaseRestoreRoot,
        completedReceiptPath: path.join(params.paths.databaseRestoreRoot, `${prepared.restoreId}.completed.json`),
        expectedCompletedReceiptSha256: sha256Json(completed),
        evidenceRoot: params.paths.migrationEvidenceRoot,
        evidencePath: prepared.evidencePath,
        expectedEvidenceSha256: prepared.evidenceSha256,
        sourceRoot: path.resolve(params.sourceRoot),
        state: params.state.postgres,
        instanceName: params.state.instanceName,
        instanceRoot: params.paths.instanceRoot,
        runtime: dependencies.postgresRuntime,
        planStrictPgSchema: dependencies.planStrictPgSchema,
        signal: params.signal,
      })
    }
    return completedResult(prepared, completed)
  }

  const active = createCommunityNativeApplicationReferenceV1(params.state)
  if (!sameCommunityNativeApplicationContent(active, update.prepared.target)) {
    throw new Error('community_native_database_restore_update_target_not_active')
  }

  if (evidenceRead.evidence.kind === 'external-snapshot-attestation') {
    if (params.state.profile !== 'native-external-postgres') {
      throw new Error('community_native_database_restore_external_profile_mismatch')
    }
    if (params.confirmExternalRestoreComplete !== true) {
      return {
        prepared,
        completed: null,
        actionRequired: true,
        dataRewound: false,
        externalAction: {
          provider: evidenceRead.evidence.provider,
          snapshotRef: evidenceRead.evidence.snapshotRef,
          snapshotDigest: evidenceRead.evidence.snapshotDigest,
          restoreInstructionsRef: evidenceRead.evidence.restoreInstructionsRef,
        },
      }
    }
    const repoUrl = loadExternalPostgresUrl(params.state.postgres.configRef, params.state.postgres.tlsPolicy)
    const planned = await (dependencies.planNativeMigration ?? planCommunityNativeMigration)({
      sourceRoot: path.resolve(params.sourceRoot),
      repoUrl,
      signal: params.signal,
    })
    assertCommunityNativeRestoredSnapshotStateV1(evidenceRead.evidence, planned.planning)
    const completed = assertCompleted({
      schemaVersion: 1,
      status: 'community-native-database-restored',
      restoreId: prepared.restoreId,
      updateId: prepared.updateId,
      instanceName: prepared.instanceName,
      completedAt: now().toISOString(),
      recoveryOwner: 'external',
      evidenceKind: evidenceRead.evidence.kind,
      evidenceSha256: evidenceRead.evidenceSha256,
      restoredLineageId: planned.planning.lineageId,
      restoredMigrationStateFingerprintSha256: planned.planning.sourceFingerprintSha256,
      restoredSchemaFingerprintSha256: planned.planning.schemaFingerprintSha256,
      restoredReceiptFingerprintSha256: planned.planning.receiptFingerprintSha256,
      restoredDataFingerprintSha256: evidenceRead.evidence.sourceDataFingerprintSha256,
      restoredStateFingerprintSha256: planned.planning.stateFingerprintSha256,
      rescueDatabase: null,
    })
    writeExclusive(params.paths, `${prepared.restoreId}.completed.json`, completed)
    return completedResult(prepared, completed)
  }

  if (params.confirmExternalRestoreComplete === true) {
    throw new Error('community_native_database_restore_external_confirmation_unexpected')
  }
  if (params.state.profile !== 'native-container-postgres') {
    throw new Error('community_native_database_restore_managed_profile_mismatch')
  }
  const restored = await (dependencies.restoreManagedSnapshot ?? restoreCommunityNativeManagedSnapshotV1)({
    restoreId: prepared.restoreId,
    evidenceRoot: params.paths.migrationEvidenceRoot,
    evidencePath: prepared.evidencePath,
    expectedEvidenceSha256: prepared.evidenceSha256,
    backupRoot: params.paths.backupRoot,
    sourceRoot: path.resolve(params.sourceRoot),
    state: params.state.postgres,
    instanceName: params.state.instanceName,
    instanceRoot: params.paths.instanceRoot,
    runtime: dependencies.postgresRuntime,
    planStrictPgSchema: dependencies.planStrictPgSchema,
    onPhase: ({ phase }) => writePhase({ paths: params.paths, prepared: prepared!, phase, now }),
    signal: params.signal,
  })
  const completed = assertCompleted({
    schemaVersion: 1,
    status: 'community-native-database-restored',
    restoreId: prepared.restoreId,
    updateId: prepared.updateId,
    instanceName: prepared.instanceName,
    completedAt: now().toISOString(),
    recoveryOwner: 'managed',
    evidenceKind: evidenceRead.evidence.kind,
    evidenceSha256: evidenceRead.evidenceSha256,
    restoredLineageId: restored.restoredLineageId,
    restoredMigrationStateFingerprintSha256: restored.restoredMigrationStateFingerprintSha256,
    restoredSchemaFingerprintSha256: restored.restoredSchemaFingerprintSha256,
    restoredReceiptFingerprintSha256: restored.restoredReceiptFingerprintSha256,
    restoredDataFingerprintSha256: restored.restoredDataFingerprintSha256,
    restoredStateFingerprintSha256: restored.restoredStateFingerprintSha256,
    rescueDatabase: restored.rescueDatabase,
  })
  const completedReceiptPath = writeExclusive(params.paths, `${prepared.restoreId}.completed.json`, completed)
  await (dependencies.cleanupManagedRescue ?? cleanupCommunityNativeManagedRestoreRescueV1)({
    restoreId: prepared.restoreId,
    receiptRoot: params.paths.databaseRestoreRoot,
    completedReceiptPath,
    expectedCompletedReceiptSha256: sha256Json(completed),
    evidenceRoot: params.paths.migrationEvidenceRoot,
    evidencePath: prepared.evidencePath,
    expectedEvidenceSha256: prepared.evidenceSha256,
    sourceRoot: path.resolve(params.sourceRoot),
    state: params.state.postgres,
    instanceName: params.state.instanceName,
    instanceRoot: params.paths.instanceRoot,
    runtime: dependencies.postgresRuntime,
    planStrictPgSchema: dependencies.planStrictPgSchema,
    signal: params.signal,
  })
  return completedResult(prepared, completed)
}
