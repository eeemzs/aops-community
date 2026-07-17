import { createHash, randomBytes } from 'node:crypto'
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

import type {
  CommunityNativeBuildIdentity,
  CommunityNativeInstallState,
  CommunityNativePaths,
  CommunityNativeSourceIdentity,
} from './community-native-lifecycle.js'
import type { CommunityNativeMigrationReceiptV1 } from './community-native-migration.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256 = /^sha256:[a-f0-9]{64}$/
const RAW_SHA256 = /^[a-f0-9]{64}$/
const INSTANCE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const MAX_RECORD_BYTES = 1024 * 1024

export type CommunityNativeApplicationContentV1 = Readonly<{
  schemaVersion: 1
  releaseVersion: string
  packageSha256: string
  lockfileSha256: string
  sourceFileCount: number
  sourceInventorySha256: string
  hostEntrySha256: string
  handlerEntrySha256: string
  cockpitIndexSha256: string
  runtimeFileCount: number
  runtimeInventorySha256: string
  applicationContentSha256: string
}>

export type CommunityNativeApplicationReferenceV1 = Readonly<{
  sourceRoot: string
  sourceFingerprint: string
  buildFingerprint: string
  content: CommunityNativeApplicationContentV1
}>

export type CommunityNativeApplicationUpdatePreparedV1 = Readonly<{
  schemaVersion: 1
  status: 'community-native-application-update-prepared'
  updateId: string
  instanceName: string
  installId: string
  createdAt: string
  prior: CommunityNativeApplicationReferenceV1
  target: CommunityNativeApplicationReferenceV1
}>

export type CommunityNativeApplicationUpdateOutcomeV1 = Readonly<{
  schemaVersion: 1
  status: 'community-native-application-update-succeeded' | 'community-native-application-update-failed'
  updateId: string
  completedAt: string
  migration: Readonly<{
    action: 'migrate' | 'verify-only'
    acceptedPlanSha256: string
    sourceMigrationStateFingerprintSha256: string
    resultMigrationStateFingerprintSha256: string
    snapshotEvidenceKind: 'managed-verified-backup' | 'external-snapshot-attestation' | null
    snapshotEvidenceSha256: string | null
  }> | null
  failure: string | null
}>

export type CommunityNativeApplicationRollbackPreparedV1 = Readonly<{
  schemaVersion: 1
  status: 'community-native-application-rollback-prepared'
  updateId: string
  rollbackId: string
  createdAt: string
  candidate: CommunityNativeApplicationReferenceV1
  databasePlan: Readonly<{
    action: 'verify-only'
    acceptedPlanSha256: string
    sourceMigrationStateFingerprintSha256: string
    stateFingerprintSha256: string
  }>
}>

export type CommunityNativeApplicationRollbackOutcomeV1 = Readonly<{
  schemaVersion: 1
  status: 'community-native-application-rolled-back' | 'community-native-application-rollback-failed'
  updateId: string
  rollbackId: string
  completedAt: string
  migration: CommunityNativeApplicationUpdateOutcomeV1['migration']
  failure: string | null
}>

export type CommunityNativeApplicationUpdateRecordV1 = Readonly<{
  prepared: CommunityNativeApplicationUpdatePreparedV1
  outcome: CommunityNativeApplicationUpdateOutcomeV1 | null
  rollbackPrepared: CommunityNativeApplicationRollbackPreparedV1 | null
  rollbackOutcome: CommunityNativeApplicationRollbackOutcomeV1 | null
}>

export type CommunityNativeApplicationRecoveryStatusV1 = Readonly<{
  updateId: string
  preparedAt: string
  updateStatus: CommunityNativeApplicationUpdatePreparedV1['status'] | CommunityNativeApplicationUpdateOutcomeV1['status']
  updateCompletedAt: string | null
  rollbackId: string | null
  rollbackStatus: CommunityNativeApplicationRollbackPreparedV1['status'] | CommunityNativeApplicationRollbackOutcomeV1['status'] | null
  rollbackCompletedAt: string | null
}>

function sha256Json(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

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
    const code = String((error as NodeJS.ErrnoException)?.code ?? '')
    if (process.platform !== 'win32' || !['EACCES', 'EBADF', 'EINVAL', 'EISDIR', 'EPERM'].includes(code)) throw error
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function ensureRecordRoot(paths: CommunityNativePaths): string {
  const root = path.resolve(paths.applicationUpdateRoot)
  if (!samePath(path.dirname(root), paths.runtimeRoot)) {
    throw new Error('community_native_application_update_root_unsafe')
  }
  const existed = existsSync(root)
  mkdirSync(root, { recursive: true, mode: 0o700 })
  const stats = lstatSync(root)
  if (!stats.isDirectory() || stats.isSymbolicLink() || !samePath(realpathSync.native(root), root)) {
    throw new Error('community_native_application_update_root_unsafe')
  }
  if (!existed) fsyncDirectoryBestEffortOnWindows(paths.runtimeRoot)
  return root
}

function writeExclusive(paths: CommunityNativePaths, fileName: string, value: unknown): string {
  const root = ensureRecordRoot(paths)
  const target = path.join(root, fileName)
  if (!samePath(path.dirname(target), root) || existsSync(target)) {
    throw new Error('community_native_application_recovery_record_already_exists')
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
        throw new Error('community_native_application_recovery_record_already_exists')
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
  const root = ensureRecordRoot(paths)
  const target = path.join(root, fileName)
  if (!existsSync(target)) return null
  const stats = lstatSync(target, { bigint: true })
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1n || stats.size > BigInt(MAX_RECORD_BYTES) ||
      !samePath(realpathSync.native(target), target) || !samePath(path.dirname(target), root)) {
    throw new Error('community_native_application_recovery_record_unsafe')
  }
  let descriptor: number | undefined
  try {
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
    descriptor = openSync(target, constants.O_RDONLY | noFollow)
    const before = fstatSync(descriptor, { bigint: true })
    if (before.dev !== stats.dev || before.ino !== stats.ino || before.size !== stats.size || before.nlink !== 1n) {
      throw new Error('community_native_application_recovery_record_unsafe')
    }
    const value = JSON.parse(readFileSync(descriptor, 'utf8')) as unknown
    const after = fstatSync(descriptor, { bigint: true })
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size ||
        after.nlink !== before.nlink || after.mtimeNs !== before.mtimeNs) {
      throw new Error('community_native_application_recovery_record_unsafe')
    }
    return value
  } catch {
    throw new Error('community_native_application_recovery_record_invalid')
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const keys = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) throw new Error(code)
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertReference(value: unknown): CommunityNativeApplicationReferenceV1 {
  if (!isRecord(value)) throw new Error('community_native_application_reference_invalid')
  exactKeys(value, ['sourceRoot', 'sourceFingerprint', 'buildFingerprint', 'content'], 'community_native_application_reference_invalid')
  if (!path.isAbsolute(String(value.sourceRoot)) || !SHA256.test(String(value.sourceFingerprint)) ||
      !SHA256.test(String(value.buildFingerprint)) || !isRecord(value.content)) {
    throw new Error('community_native_application_reference_invalid')
  }
  exactKeys(value.content, [
    'schemaVersion', 'releaseVersion', 'packageSha256', 'lockfileSha256', 'sourceFileCount',
    'sourceInventorySha256', 'hostEntrySha256', 'handlerEntrySha256', 'cockpitIndexSha256',
    'runtimeFileCount', 'runtimeInventorySha256', 'applicationContentSha256',
  ], 'community_native_application_content_invalid')
  if (value.content.schemaVersion !== 1 || typeof value.content.releaseVersion !== 'string' ||
      !Number.isSafeInteger(value.content.sourceFileCount) || value.content.sourceFileCount < 1 ||
      !Number.isSafeInteger(value.content.runtimeFileCount) || value.content.runtimeFileCount < 1 ||
      ![
        value.content.packageSha256, value.content.lockfileSha256, value.content.sourceInventorySha256,
        value.content.hostEntrySha256, value.content.handlerEntrySha256, value.content.cockpitIndexSha256,
        value.content.runtimeInventorySha256, value.content.applicationContentSha256,
      ].every((item) => SHA256.test(String(item)))) {
    throw new Error('community_native_application_content_invalid')
  }
  const content = { ...value.content }
  const claimed = content.applicationContentSha256
  delete content.applicationContentSha256
  if (sha256Json(content) !== claimed) throw new Error('community_native_application_content_hash_mismatch')
  return value as CommunityNativeApplicationReferenceV1
}

function migrationSummary(receipt: CommunityNativeMigrationReceiptV1): NonNullable<CommunityNativeApplicationUpdateOutcomeV1['migration']> {
  return {
    action: receipt.action,
    acceptedPlanSha256: receipt.acceptedPlanSha256,
    sourceMigrationStateFingerprintSha256: receipt.sourceMigrationStateFingerprintSha256,
    resultMigrationStateFingerprintSha256: receipt.resultMigrationStateFingerprintSha256,
    snapshotEvidenceKind: receipt.snapshotEvidenceKind,
    snapshotEvidenceSha256: receipt.snapshotEvidenceSha256,
  }
}

function assertMigrationSummary(value: unknown): NonNullable<CommunityNativeApplicationUpdateOutcomeV1['migration']> {
  if (!isRecord(value)) throw new Error('community_native_application_migration_summary_invalid')
  exactKeys(value, [
    'action', 'acceptedPlanSha256', 'sourceMigrationStateFingerprintSha256',
    'resultMigrationStateFingerprintSha256', 'snapshotEvidenceKind', 'snapshotEvidenceSha256',
  ], 'community_native_application_migration_summary_invalid')
  if (!['migrate', 'verify-only'].includes(String(value.action)) ||
      ![value.acceptedPlanSha256, value.sourceMigrationStateFingerprintSha256,
        value.resultMigrationStateFingerprintSha256].every((item) => RAW_SHA256.test(String(item))) ||
      !['managed-verified-backup', 'external-snapshot-attestation', null].includes(value.snapshotEvidenceKind) ||
      (value.snapshotEvidenceSha256 !== null && !RAW_SHA256.test(String(value.snapshotEvidenceSha256))) ||
      (value.snapshotEvidenceKind === null) !== (value.snapshotEvidenceSha256 === null)) {
    throw new Error('community_native_application_migration_summary_invalid')
  }
  return value as NonNullable<CommunityNativeApplicationUpdateOutcomeV1['migration']>
}

function assertUpdateOutcome(value: unknown, updateId: string): CommunityNativeApplicationUpdateOutcomeV1 {
  if (!isRecord(value)) throw new Error('community_native_application_update_outcome_invalid')
  exactKeys(value, ['schemaVersion', 'status', 'updateId', 'completedAt', 'migration', 'failure'],
    'community_native_application_update_outcome_invalid')
  if (value.schemaVersion !== 1 || value.updateId !== updateId ||
      !['community-native-application-update-succeeded', 'community-native-application-update-failed'].includes(String(value.status)) ||
      Number.isNaN(Date.parse(String(value.completedAt)))) {
    throw new Error('community_native_application_update_outcome_invalid')
  }
  if (value.status === 'community-native-application-update-succeeded') {
    if (value.failure !== null) throw new Error('community_native_application_update_outcome_invalid')
    return { ...value, migration: assertMigrationSummary(value.migration) } as CommunityNativeApplicationUpdateOutcomeV1
  }
  if (typeof value.failure !== 'string' || value.failure.length < 1 || value.failure.length > 300) {
    throw new Error('community_native_application_update_outcome_invalid')
  }
  return {
    ...value,
    migration: value.migration === null ? null : assertMigrationSummary(value.migration),
  } as CommunityNativeApplicationUpdateOutcomeV1
}

function assertRollbackPrepared(
  value: unknown,
  updateId: string,
): CommunityNativeApplicationRollbackPreparedV1 {
  if (!isRecord(value)) throw new Error('community_native_application_rollback_prepared_invalid')
  exactKeys(value, ['schemaVersion', 'status', 'updateId', 'rollbackId', 'createdAt', 'candidate', 'databasePlan'],
    'community_native_application_rollback_prepared_invalid')
  if (value.schemaVersion !== 1 || value.status !== 'community-native-application-rollback-prepared' ||
      value.updateId !== updateId || !UUID.test(String(value.rollbackId)) ||
      Number.isNaN(Date.parse(String(value.createdAt))) || !isRecord(value.databasePlan)) {
    throw new Error('community_native_application_rollback_prepared_invalid')
  }
  exactKeys(value.databasePlan, [
    'action', 'acceptedPlanSha256', 'sourceMigrationStateFingerprintSha256', 'stateFingerprintSha256',
  ], 'community_native_application_rollback_prepared_invalid')
  if (value.databasePlan.action !== 'verify-only' ||
      ![value.databasePlan.acceptedPlanSha256, value.databasePlan.sourceMigrationStateFingerprintSha256,
        value.databasePlan.stateFingerprintSha256].every((item) => RAW_SHA256.test(String(item)))) {
    throw new Error('community_native_application_rollback_prepared_invalid')
  }
  return {
    ...value,
    candidate: assertReference(value.candidate),
  } as CommunityNativeApplicationRollbackPreparedV1
}

function assertRollbackOutcome(
  value: unknown,
  updateId: string,
  rollbackId: string,
): CommunityNativeApplicationRollbackOutcomeV1 {
  if (!isRecord(value)) throw new Error('community_native_application_rollback_outcome_invalid')
  exactKeys(value, ['schemaVersion', 'status', 'updateId', 'rollbackId', 'completedAt', 'migration', 'failure'],
    'community_native_application_rollback_outcome_invalid')
  if (value.schemaVersion !== 1 || value.updateId !== updateId || value.rollbackId !== rollbackId ||
      !['community-native-application-rolled-back', 'community-native-application-rollback-failed'].includes(String(value.status)) ||
      Number.isNaN(Date.parse(String(value.completedAt)))) {
    throw new Error('community_native_application_rollback_outcome_invalid')
  }
  if (value.status === 'community-native-application-rolled-back') {
    if (value.failure !== null) throw new Error('community_native_application_rollback_outcome_invalid')
    return { ...value, migration: assertMigrationSummary(value.migration) } as CommunityNativeApplicationRollbackOutcomeV1
  }
  if (typeof value.failure !== 'string' || value.failure.length < 1 || value.failure.length > 300) {
    throw new Error('community_native_application_rollback_outcome_invalid')
  }
  return {
    ...value,
    migration: value.migration === null ? null : assertMigrationSummary(value.migration),
  } as CommunityNativeApplicationRollbackOutcomeV1
}

export function createCommunityNativeApplicationReferenceV1(input: {
  source: CommunityNativeSourceIdentity
  build: CommunityNativeBuildIdentity
}): CommunityNativeApplicationReferenceV1 {
  const contentBase = {
    schemaVersion: 1 as const,
    releaseVersion: input.source.releaseVersion,
    packageSha256: input.source.packageSha256,
    lockfileSha256: input.source.lockfileSha256,
    sourceFileCount: input.source.sourceFileCount,
    sourceInventorySha256: input.source.sourceInventorySha256,
    hostEntrySha256: input.build.hostEntrySha256,
    handlerEntrySha256: input.build.handlerEntrySha256,
    cockpitIndexSha256: input.build.cockpitIndexSha256,
    runtimeFileCount: input.build.runtimeFileCount,
    runtimeInventorySha256: input.build.runtimeInventorySha256,
  }
  return assertReference({
    sourceRoot: input.source.root,
    sourceFingerprint: input.source.sourceFingerprint,
    buildFingerprint: input.build.buildFingerprint,
    content: { ...contentBase, applicationContentSha256: sha256Json(contentBase) },
  })
}

export function sameCommunityNativeApplicationContent(
  left: CommunityNativeApplicationReferenceV1,
  right: CommunityNativeApplicationReferenceV1,
): boolean {
  return left.content.applicationContentSha256 === right.content.applicationContentSha256
}

export function writeCommunityNativeApplicationUpdatePrepared(params: {
  paths: CommunityNativePaths
  updateId: string
  prior: CommunityNativeInstallState
  target: CommunityNativeInstallState
  now?: () => Date
}): CommunityNativeApplicationUpdatePreparedV1 {
  if (!UUID.test(params.updateId) || params.prior.instanceName !== params.target.instanceName ||
      params.prior.installId !== params.target.installId) {
    throw new Error('community_native_application_update_identity_invalid')
  }
  const prepared: CommunityNativeApplicationUpdatePreparedV1 = {
    schemaVersion: 1,
    status: 'community-native-application-update-prepared',
    updateId: params.updateId,
    instanceName: params.target.instanceName,
    installId: params.target.installId,
    createdAt: (params.now ?? (() => new Date()))().toISOString(),
    prior: createCommunityNativeApplicationReferenceV1(params.prior),
    target: createCommunityNativeApplicationReferenceV1(params.target),
  }
  if (sameCommunityNativeApplicationContent(prepared.prior, prepared.target)) {
    throw new Error('community_native_application_update_content_unchanged')
  }
  writeExclusive(params.paths, `${params.updateId}.prepared.json`, prepared)
  return prepared
}

export function writeCommunityNativeApplicationUpdateOutcome(params: {
  paths: CommunityNativePaths
  updateId: string
  receipt?: CommunityNativeMigrationReceiptV1
  error?: unknown
  now?: () => Date
}): CommunityNativeApplicationUpdateOutcomeV1 {
  const succeeded = params.error === undefined
  if (!UUID.test(params.updateId) || (succeeded && !params.receipt) || (!succeeded && params.error === undefined)) {
    throw new Error('community_native_application_update_outcome_invalid')
  }
  const outcome: CommunityNativeApplicationUpdateOutcomeV1 = {
    schemaVersion: 1,
    status: succeeded
      ? 'community-native-application-update-succeeded'
      : 'community-native-application-update-failed',
    updateId: params.updateId,
    completedAt: (params.now ?? (() => new Date()))().toISOString(),
    migration: params.receipt ? migrationSummary(params.receipt) : null,
    failure: succeeded ? null :
      (String(params.error instanceof Error ? params.error.message : params.error).slice(0, 300) ||
        'community_native_application_update_failed'),
  }
  writeExclusive(params.paths, `${params.updateId}.${succeeded ? 'succeeded' : 'failed'}.json`, outcome)
  return outcome
}

export function writeCommunityNativeApplicationRollbackPrepared(params: {
  paths: CommunityNativePaths
  updateId: string
  rollbackId: string
  candidate: CommunityNativeApplicationReferenceV1
  databasePlan: CommunityNativeApplicationRollbackPreparedV1['databasePlan']
  now?: () => Date
}): CommunityNativeApplicationRollbackPreparedV1 {
  if (!UUID.test(params.updateId) || !UUID.test(params.rollbackId) || params.databasePlan.action !== 'verify-only' ||
      ![params.databasePlan.acceptedPlanSha256, params.databasePlan.sourceMigrationStateFingerprintSha256,
        params.databasePlan.stateFingerprintSha256].every((value) => RAW_SHA256.test(value))) {
    throw new Error('community_native_application_rollback_prepared_invalid')
  }
  const prepared: CommunityNativeApplicationRollbackPreparedV1 = {
    schemaVersion: 1,
    status: 'community-native-application-rollback-prepared',
    updateId: params.updateId,
    rollbackId: params.rollbackId,
    createdAt: (params.now ?? (() => new Date()))().toISOString(),
    candidate: assertReference(params.candidate),
    databasePlan: params.databasePlan,
  }
  writeExclusive(params.paths, `${params.updateId}.${params.rollbackId}.rollback-prepared.json`, prepared)
  return prepared
}

export function writeCommunityNativeApplicationRollbackOutcome(params: {
  paths: CommunityNativePaths
  updateId: string
  rollbackId: string
  receipt?: CommunityNativeMigrationReceiptV1
  error?: unknown
  now?: () => Date
}): CommunityNativeApplicationRollbackOutcomeV1 {
  const succeeded = params.error === undefined
  if (!UUID.test(params.updateId) || !UUID.test(params.rollbackId) ||
      (succeeded && !params.receipt) || (!succeeded && params.error === undefined)) {
    throw new Error('community_native_application_rollback_outcome_invalid')
  }
  const outcome: CommunityNativeApplicationRollbackOutcomeV1 = {
    schemaVersion: 1,
    status: succeeded
      ? 'community-native-application-rolled-back'
      : 'community-native-application-rollback-failed',
    updateId: params.updateId,
    rollbackId: params.rollbackId,
    completedAt: (params.now ?? (() => new Date()))().toISOString(),
    migration: params.receipt ? migrationSummary(params.receipt) : null,
    failure: succeeded ? null :
      (String(params.error instanceof Error ? params.error.message : params.error).slice(0, 300) ||
        'community_native_application_rollback_failed'),
  }
  writeExclusive(params.paths, `${params.updateId}.${params.rollbackId}.${succeeded ? 'rolled-back' : 'rollback-failed'}.json`, outcome)
  return outcome
}

export function readCommunityNativeApplicationUpdate(
  paths: CommunityNativePaths,
  updateId: string,
): CommunityNativeApplicationUpdateRecordV1 {
  if (!UUID.test(updateId)) throw new Error('community_native_application_update_id_invalid')
  const rawPrepared = readRecord(paths, `${updateId}.prepared.json`)
  if (!isRecord(rawPrepared)) throw new Error('community_native_application_update_not_found')
  exactKeys(rawPrepared, ['schemaVersion', 'status', 'updateId', 'instanceName', 'installId', 'createdAt', 'prior', 'target'],
    'community_native_application_update_record_invalid')
  if (rawPrepared.schemaVersion !== 1 || rawPrepared.status !== 'community-native-application-update-prepared' ||
      rawPrepared.updateId !== updateId || !INSTANCE_NAME.test(String(rawPrepared.instanceName)) ||
      !UUID.test(String(rawPrepared.installId)) ||
      Number.isNaN(Date.parse(String(rawPrepared.createdAt)))) {
    throw new Error('community_native_application_update_record_invalid')
  }
  const prepared = { ...rawPrepared, prior: assertReference(rawPrepared.prior), target: assertReference(rawPrepared.target) } as CommunityNativeApplicationUpdatePreparedV1
  if (sameCommunityNativeApplicationContent(prepared.prior, prepared.target)) {
    throw new Error('community_native_application_update_content_unchanged')
  }
  const succeeded = readRecord(paths, `${updateId}.succeeded.json`)
  const failed = readRecord(paths, `${updateId}.failed.json`)
  if (succeeded && failed) throw new Error('community_native_application_update_outcome_conflict')
  const rawOutcome = succeeded ?? failed
  const outcome = rawOutcome === null ? null : assertUpdateOutcome(rawOutcome, updateId)
  const rollbackCandidates = existsSync(paths.applicationUpdateRoot)
    ? readdirSync(paths.applicationUpdateRoot)
      .filter((name) => name.startsWith(`${updateId}.`) && name.endsWith('.rollback-prepared.json'))
    : []
  if (rollbackCandidates.length > 1) throw new Error('community_native_application_rollback_ambiguous')
  const rollbackPrepared = rollbackCandidates[0]
    ? assertRollbackPrepared(readRecord(paths, rollbackCandidates[0]), updateId)
    : null
  if (rollbackPrepared && !sameCommunityNativeApplicationContent(rollbackPrepared.candidate, prepared.prior)) {
    throw new Error('community_native_application_rollback_candidate_mismatch')
  }
  let rollbackOutcome: CommunityNativeApplicationRollbackOutcomeV1 | null = null
  if (rollbackPrepared) {
    const rolledBack = readRecord(paths, `${updateId}.${rollbackPrepared.rollbackId}.rolled-back.json`)
    const rollbackFailed = readRecord(paths, `${updateId}.${rollbackPrepared.rollbackId}.rollback-failed.json`)
    if (rolledBack && rollbackFailed) throw new Error('community_native_application_rollback_outcome_conflict')
    const rawRollbackOutcome = rolledBack ?? rollbackFailed
    rollbackOutcome = rawRollbackOutcome === null
      ? null
      : assertRollbackOutcome(rawRollbackOutcome, updateId, rollbackPrepared.rollbackId)
  }
  return { prepared, outcome, rollbackPrepared, rollbackOutcome }
}

export function inspectCommunityNativeApplicationRecoveryStatus(
  paths: CommunityNativePaths,
): CommunityNativeApplicationRecoveryStatusV1 | null {
  if (!existsSync(paths.applicationUpdateRoot)) return null
  const root = ensureRecordRoot(paths)
  const records = readdirSync(root)
    .filter((name) => UUID.test(name.slice(0, -'.prepared.json'.length)) && name.endsWith('.prepared.json'))
    .map((name) => readCommunityNativeApplicationUpdate(paths, name.slice(0, -'.prepared.json'.length)))
    .sort((left, right) => {
      const byTime = Date.parse(right.prepared.createdAt) - Date.parse(left.prepared.createdAt)
      return byTime === 0 ? right.prepared.updateId.localeCompare(left.prepared.updateId) : byTime
    })
  const latest = records[0]
  if (!latest) return null
  return {
    updateId: latest.prepared.updateId,
    preparedAt: latest.prepared.createdAt,
    updateStatus: latest.outcome?.status ?? latest.prepared.status,
    updateCompletedAt: latest.outcome?.completedAt ?? null,
    rollbackId: latest.rollbackPrepared?.rollbackId ?? null,
    rollbackStatus: latest.rollbackOutcome?.status ?? latest.rollbackPrepared?.status ?? null,
    rollbackCompletedAt: latest.rollbackOutcome?.completedAt ?? null,
  }
}
