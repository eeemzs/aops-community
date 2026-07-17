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
  readSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import {
  planCommunityStrictPgSchema,
  type CommunityStrictExternalSnapshotEvidenceV1,
  type CommunityStrictMigrationPlanningResultV1,
  type CommunityStrictMigrationPolicyV1,
  type CommunityStrictSnapshotEvidenceV1,
  type CommunityStrictVerifiedBackupEvidenceV1,
} from '@aops/pg-bootstrap'

import {
  assertCommunityNativePostgresInstanceState,
  buildCommunityNativePostgresUrl,
  communityNativePostgresRuntime,
  type CommunityNativePostgresRuntime,
  type CommunityNativePostgresState,
} from './community-native-postgres.js'
import { readCommunityNativeMigrationPolicy } from './community-native-migration.js'

const RAW_SHA256 = /^[a-f0-9]{64}$/
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]+$/
const BUFFER_BYTES = 1024 * 1024
const MAX_EVIDENCE_BYTES = 1024 * 1024
const SAFE_DATABASE_NAME = /^[a-z][a-z0-9_]{0,62}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type CommunityNativeManagedSnapshotResult = Readonly<{
  evidencePath: string
  backupPath: string
  evidence: CommunityStrictVerifiedBackupEvidenceV1
}>

export type CommunityNativeSnapshotEvidenceReadV1 = Readonly<{
  evidencePath: string
  evidenceSha256: string
  evidence: CommunityStrictSnapshotEvidenceV1
}>

export type CommunityNativeManagedRestorePhaseV1 =
  | 'candidate-restored'
  | 'candidate-verified'
  | 'source-preserved'
  | 'target-promoted'
  | 'target-verified'

export type CommunityNativeManagedRestorePhaseContextV1 = Readonly<{
  restoreId: string
  phase: CommunityNativeManagedRestorePhaseV1
  candidateDatabase: string
  rescueDatabase: string
}>

export type CommunityNativeManagedRestoreResultV1 = Readonly<{
  restoreId: string
  evidencePath: string
  evidenceSha256: string
  backupPath: string
  backupSha256: string
  backupByteLength: number
  candidateDatabase: string
  rescueDatabase: string
  restoredLineageId: string
  restoredMigrationStateFingerprintSha256: string
  restoredSchemaFingerprintSha256: string
  restoredReceiptFingerprintSha256: string
  restoredDataFingerprintSha256: string
  restoredStateFingerprintSha256: string
  resumed: boolean
}>

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function samePath(left: string, right: string): boolean {
  const a = path.resolve(left)
  const b = path.resolve(right)
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function ensureCanonicalDirectory(directory: string, code: string): string {
  const resolved = path.resolve(directory)
  const existed = existsSync(resolved)
  mkdirSync(resolved, { recursive: true, mode: 0o700 })
  if (!existed) fsyncDirectoryBestEffortOnWindows(path.dirname(resolved))
  const stats = lstatSync(resolved)
  if (!stats.isDirectory() || stats.isSymbolicLink() || !samePath(realpathSync.native(resolved), resolved)) {
    throw new Error(code)
  }
  return resolved
}

function assertFreshDirectChild(root: string, candidate: string, code: string): string {
  const resolved = path.resolve(candidate)
  if (!samePath(path.dirname(resolved), root) || existsSync(resolved)) throw new Error(code)
  return resolved
}

function writeJsonExclusive(targetPath: string, value: unknown): void {
  const root = ensureCanonicalDirectory(path.dirname(targetPath), 'community_snapshot_evidence_root_unsafe')
  const target = assertFreshDirectChild(root, targetPath, 'community_snapshot_evidence_already_exists')
  const temp = path.join(
    root,
    `.${path.basename(target)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
  )
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
        throw new Error('community_snapshot_evidence_already_exists')
      }
      throw error
    }
    fsyncDirectoryBestEffortOnWindows(root)
    rmSync(temp, { force: true })
    fsyncDirectoryBestEffortOnWindows(root)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    rmSync(temp, { force: true })
  }
}

function fsyncDirectoryBestEffortOnWindows(directory: string): void {
  let descriptor: number | undefined
  try {
    descriptor = openSync(directory, 'r')
    fsyncSync(descriptor)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (process.platform !== 'win32' || !['EACCES', 'EBADF', 'EINVAL', 'EISDIR', 'EPERM'].includes(String(code))) {
      throw error
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function sourceDataFingerprint(planning: CommunityStrictMigrationPlanningResultV1): string {
  return sha256(JSON.stringify(planning.dataSentinels))
}

function evidenceBase(
  planning: CommunityStrictMigrationPlanningResultV1,
  policy: CommunityStrictMigrationPolicyV1,
) {
  if (!planning.requiresSnapshotEvidence || planning.migrationPlan.action !== 'migrate' ||
      !planning.migrationPlan.pendingMigrations.some((migration) => migration.risk === 'destructive-or-dynamic')) {
    throw new Error('community_snapshot_evidence_not_required')
  }
  return {
    acceptedPlanSha256: planning.acceptedPlanSha256,
    sourceMigrationStateFingerprintSha256: planning.sourceFingerprintSha256,
    sourceLineageId: planning.lineageId,
    sourceSchemaFingerprintSha256: planning.schemaFingerprintSha256,
    sourceReceiptFingerprintSha256: planning.receiptFingerprintSha256,
    sourceDataFingerprintSha256: sourceDataFingerprint(planning),
    sourceStateFingerprintSha256: planning.stateFingerprintSha256,
    targetInventorySha256: policy.inventorySha256,
  }
}

function canonicalText(value: string, maximumLength: number): string {
  const canonical = value.trim()
  if (canonical.length < 1 || canonical.length > maximumLength || !SAFE_TEXT.test(canonical)) {
    throw new Error('community_external_snapshot_attestation_invalid')
  }
  return canonical
}

function canonicalNonSecretReference(value: string, maximumLength: number): string {
  const canonical = canonicalText(value, maximumLength)
  if (
    canonical.includes('?') ||
    /^(?:[a-z][a-z0-9+.-]*:)?\/\/[^/\s]*@/i.test(canonical) ||
    /(?:token|secret|password|signature|credential|sig)\s*=/i.test(canonical)
  ) {
    throw new Error('community_external_snapshot_attestation_secret_ref_refused')
  }
  return canonical
}

export function createCommunityExternalSnapshotAttestationV1(params: {
  planning: CommunityStrictMigrationPlanningResultV1
  policy: CommunityStrictMigrationPolicyV1
  provider: string
  snapshotRef: string
  snapshotDigest: string | null
  attestedBy: string
  restoreInstructionsRef: string
  now?: () => Date
}): CommunityStrictExternalSnapshotEvidenceV1 {
  const provider = canonicalText(params.provider, 128)
  const snapshotRef = canonicalNonSecretReference(params.snapshotRef, 1_024)
  const attestedBy = canonicalText(params.attestedBy, 256)
  const restoreInstructionsRef = canonicalNonSecretReference(params.restoreInstructionsRef, 2_048)
  if (params.snapshotDigest !== null && !PREFIXED_SHA256.test(params.snapshotDigest)) {
    throw new Error('community_external_snapshot_attestation_invalid')
  }
  return {
    schemaVersion: 1,
    kind: 'external-snapshot-attestation',
    evidencePolicy: 'external-recovery-owner-attested-v1',
    createdAt: (params.now ?? (() => new Date()))().toISOString(),
    recoveryOwner: 'external',
    provider,
    snapshotRef,
    snapshotDigest: params.snapshotDigest,
    attestedBy,
    restoreInstructionsRef,
    ...evidenceBase(params.planning, params.policy),
  }
}

export function writeCommunityExternalSnapshotAttestationV1(params: {
  planning: CommunityStrictMigrationPlanningResultV1
  policy: CommunityStrictMigrationPolicyV1
  evidenceRoot: string
  provider: string
  snapshotRef: string
  snapshotDigest: string | null
  attestedBy: string
  restoreInstructionsRef: string
  now?: () => Date
}): { evidencePath: string; evidence: CommunityStrictExternalSnapshotEvidenceV1 } {
  const evidence = createCommunityExternalSnapshotAttestationV1(params)
  const root = ensureCanonicalDirectory(params.evidenceRoot, 'community_snapshot_evidence_root_unsafe')
  const evidencePath = path.join(root, `external-${params.planning.acceptedPlanSha256}.json`)
  writeJsonExclusive(evidencePath, evidence)
  return { evidencePath, evidence }
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], code: string): void {
  const keys = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) throw new Error(code)
}

export function readCommunityNativeSnapshotEvidenceV1(params: {
  evidenceRoot: string
  evidencePath: string
  expectedEvidenceSha256?: string | null
  expectedKind?: CommunityStrictSnapshotEvidenceV1['kind']
}): CommunityNativeSnapshotEvidenceReadV1 {
  const root = ensureCanonicalDirectory(params.evidenceRoot, 'community_snapshot_evidence_root_unsafe')
  const evidencePath = path.resolve(params.evidencePath)
  if (!samePath(path.dirname(evidencePath), root) || !existsSync(evidencePath)) {
    throw new Error('community_native_snapshot_evidence_path_invalid')
  }
  const pathStats = lstatSync(evidencePath, { bigint: true })
  if (!pathStats.isFile() || pathStats.isSymbolicLink() || pathStats.size < 1n ||
      pathStats.size > BigInt(MAX_EVIDENCE_BYTES) ||
      !samePath(realpathSync.native(evidencePath), evidencePath)) {
    throw new Error('community_native_snapshot_evidence_invalid')
  }
  let parsed: unknown
  let descriptor: number | undefined
  try {
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
    descriptor = openSync(evidencePath, constants.O_RDONLY | noFollow)
    const before = fstatSync(descriptor, { bigint: true })
    if (!before.isFile() || before.nlink !== 1n || before.size < 1n || before.size > BigInt(MAX_EVIDENCE_BYTES) ||
        pathStats.dev !== before.dev || pathStats.ino !== before.ino) {
      throw new Error('community_native_snapshot_evidence_invalid')
    }
    parsed = JSON.parse(readFileSync(descriptor, 'utf8')) as unknown
    const after = fstatSync(descriptor, { bigint: true })
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size ||
        after.nlink !== before.nlink || after.mtimeNs !== before.mtimeNs ||
        !samePath(realpathSync.native(evidencePath), evidencePath)) {
      throw new Error('community_native_snapshot_evidence_identity_changed')
    }
  } catch {
    throw new Error('community_native_snapshot_evidence_invalid')
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
  if (!isRecord(parsed)) throw new Error('community_native_snapshot_evidence_invalid')
  const commonKeys = [
    'schemaVersion', 'kind', 'evidencePolicy', 'createdAt', 'acceptedPlanSha256',
    'sourceMigrationStateFingerprintSha256', 'sourceLineageId', 'sourceSchemaFingerprintSha256',
    'sourceReceiptFingerprintSha256', 'sourceDataFingerprintSha256', 'sourceStateFingerprintSha256',
    'targetInventorySha256',
  ]
  if (parsed.schemaVersion !== 1 || Number.isNaN(Date.parse(String(parsed.createdAt))) ||
      typeof parsed.sourceLineageId !== 'string' || parsed.sourceLineageId.length < 1 ||
      ![
        parsed.acceptedPlanSha256, parsed.sourceMigrationStateFingerprintSha256,
        parsed.sourceSchemaFingerprintSha256, parsed.sourceReceiptFingerprintSha256,
        parsed.sourceDataFingerprintSha256, parsed.sourceStateFingerprintSha256,
        parsed.targetInventorySha256,
      ].every((value) => typeof value === 'string' && RAW_SHA256.test(value))) {
    throw new Error('community_native_snapshot_evidence_invalid')
  }
  if (parsed.kind === 'managed-verified-backup') {
    exactKeys(parsed, [...commonKeys, 'backupPath', 'sha256', 'byteLength', 'restoreProof'],
      'community_native_managed_snapshot_evidence_invalid')
    if (parsed.evidencePolicy !== 'managed-restore-verified-v1' ||
        typeof parsed.backupPath !== 'string' || !path.isAbsolute(parsed.backupPath) ||
        typeof parsed.sha256 !== 'string' || !PREFIXED_SHA256.test(parsed.sha256) ||
        !Number.isSafeInteger(parsed.byteLength) || parsed.byteLength < 1 || !isRecord(parsed.restoreProof)) {
      throw new Error('community_native_managed_snapshot_evidence_invalid')
    }
    exactKeys(parsed.restoreProof, [
      'method', 'backupSha256', 'backupByteLength', 'restoredSchemaFingerprintSha256',
      'restoredReceiptFingerprintSha256', 'restoredDataFingerprintSha256',
      'restoredStateFingerprintSha256',
    ], 'community_native_managed_snapshot_restore_proof_invalid')
    if (parsed.restoreProof.method !== 'pg-restore-disposable-v1' ||
        parsed.restoreProof.backupSha256 !== parsed.sha256 ||
        parsed.restoreProof.backupByteLength !== parsed.byteLength ||
        parsed.restoreProof.restoredSchemaFingerprintSha256 !== parsed.sourceSchemaFingerprintSha256 ||
        parsed.restoreProof.restoredReceiptFingerprintSha256 !== parsed.sourceReceiptFingerprintSha256 ||
        parsed.restoreProof.restoredDataFingerprintSha256 !== parsed.sourceDataFingerprintSha256 ||
        parsed.restoreProof.restoredStateFingerprintSha256 !== parsed.sourceStateFingerprintSha256) {
      throw new Error('community_native_managed_snapshot_restore_proof_invalid')
    }
  } else if (parsed.kind === 'external-snapshot-attestation') {
    exactKeys(parsed, [
      ...commonKeys, 'recoveryOwner', 'provider', 'snapshotRef', 'snapshotDigest',
      'attestedBy', 'restoreInstructionsRef',
    ], 'community_native_external_snapshot_evidence_invalid')
    if (parsed.evidencePolicy !== 'external-recovery-owner-attested-v1' || parsed.recoveryOwner !== 'external' ||
        typeof parsed.provider !== 'string' || canonicalText(parsed.provider, 128) !== parsed.provider ||
        typeof parsed.snapshotRef !== 'string' || canonicalNonSecretReference(parsed.snapshotRef, 1_024) !== parsed.snapshotRef ||
        (parsed.snapshotDigest !== null &&
          (typeof parsed.snapshotDigest !== 'string' || !PREFIXED_SHA256.test(parsed.snapshotDigest))) ||
        typeof parsed.attestedBy !== 'string' || canonicalText(parsed.attestedBy, 256) !== parsed.attestedBy ||
        typeof parsed.restoreInstructionsRef !== 'string' ||
        canonicalNonSecretReference(parsed.restoreInstructionsRef, 2_048) !== parsed.restoreInstructionsRef) {
      throw new Error('community_native_external_snapshot_evidence_invalid')
    }
  } else {
    throw new Error('community_native_snapshot_evidence_kind_invalid')
  }
  if (params.expectedKind !== undefined && parsed.kind !== params.expectedKind) {
    throw new Error('community_native_snapshot_evidence_kind_mismatch')
  }
  const evidence = parsed as CommunityStrictSnapshotEvidenceV1
  const evidenceSha256 = sha256(JSON.stringify(evidence))
  const expected = params.expectedEvidenceSha256?.replace(/^sha256:/, '') ?? null
  if (expected !== null && (!RAW_SHA256.test(expected) || evidenceSha256 !== expected)) {
    throw new Error('community_native_snapshot_evidence_hash_mismatch')
  }
  return { evidencePath, evidenceSha256, evidence }
}

async function runDocker(params: {
  runtime: CommunityNativePostgresRuntime
  args: string[]
  operation: string
  signal?: AbortSignal
  inputFd?: number
  outputFd?: number
}): Promise<void> {
  const result = await params.runtime.run({
    command: 'docker',
    args: params.args,
    env: {},
    signal: params.signal,
    inputFd: params.inputFd,
    outputFd: params.outputFd,
  })
  if (result.exitCode !== 0) {
    const diagnostic = result.stderr
      .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@')
      .replace(/((?:password|secret|token)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
      .slice(-1_000)
    throw new Error(`community_native_snapshot_${params.operation}_failed:${result.exitCode ?? result.signal ?? 'unknown'}:${diagnostic}`)
  }
}

async function runDockerCapture(params: {
  runtime: CommunityNativePostgresRuntime
  args: string[]
  operation: string
  signal?: AbortSignal
}): Promise<string> {
  const result = await params.runtime.run({
    command: 'docker',
    args: params.args,
    env: {},
    signal: params.signal,
  })
  if (result.exitCode !== 0) {
    const diagnostic = result.stderr
      .replace(/(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s/]+@/gi, '$1[REDACTED]@')
      .replace(/((?:password|secret|token)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
      .slice(-1_000)
    throw new Error(
      `community_native_snapshot_${params.operation}_failed:${result.exitCode ?? result.signal ?? 'unknown'}:${diagnostic}`,
    )
  }
  return result.stdout
}

function hashHeldFile(fd: number, syncBeforeRead = true): { sha256: string; byteLength: number } {
  if (syncBeforeRead) fsyncSync(fd)
  const before = fstatSync(fd, { bigint: true })
  if (!before.isFile() || before.nlink !== 1n || before.size < 1n || before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('community_native_snapshot_backup_invalid')
  }
  const digest = createHash('sha256')
  const buffer = Buffer.allocUnsafe(BUFFER_BYTES)
  let position = 0
  while (position < Number(before.size)) {
    const count = readSync(fd, buffer, 0, Math.min(buffer.length, Number(before.size) - position), position)
    if (count < 1) throw new Error('community_native_snapshot_backup_short_read')
    digest.update(buffer.subarray(0, count))
    position += count
  }
  const after = fstatSync(fd, { bigint: true })
  if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size || after.nlink !== 1n) {
    throw new Error('community_native_snapshot_backup_identity_changed')
  }
  return { sha256: `sha256:${digest.digest('hex')}`, byteLength: position }
}

function assertRestoredState(
  expected: CommunityStrictMigrationPlanningResultV1,
  restored: CommunityStrictMigrationPlanningResultV1,
): void {
  if (restored.lineageId !== expected.lineageId ||
      restored.schemaFingerprintSha256 !== expected.schemaFingerprintSha256 ||
      restored.receiptFingerprintSha256 !== expected.receiptFingerprintSha256 ||
      restored.stateFingerprintSha256 !== expected.stateFingerprintSha256 ||
      JSON.stringify(restored.dataSentinels) !== JSON.stringify(expected.dataSentinels)) {
    throw new Error('community_native_snapshot_restore_proof_mismatch')
  }
}

function assertDatabaseName(value: string): string {
  if (!SAFE_DATABASE_NAME.test(value)) throw new Error('community_native_snapshot_database_name_invalid')
  return value
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('community_operation_aborted')
}

async function databaseExists(params: {
  runtime: CommunityNativePostgresRuntime
  state: CommunityNativePostgresState
  database: string
  signal?: AbortSignal
}): Promise<boolean> {
  const database = assertDatabaseName(params.database)
  const output = (await runDockerCapture({
    runtime: params.runtime,
    args: ['container', 'exec', params.state.containerName, 'psql', '-U', 'aops', '-d', 'postgres',
      '-Atqc', `SELECT 1 FROM pg_database WHERE datname = '${database}'`],
    operation: 'restore_database_exists',
    signal: params.signal,
  })).trim()
  if (output === '') return false
  if (output === '1') return true
  throw new Error('community_native_snapshot_database_probe_invalid')
}

async function runDatabaseSql(params: {
  runtime: CommunityNativePostgresRuntime
  state: CommunityNativePostgresState
  sql: string
  operation: string
  signal?: AbortSignal
}): Promise<void> {
  await runDocker({
    runtime: params.runtime,
    args: ['container', 'exec', params.state.containerName, 'psql', '-U', 'aops', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-c', params.sql],
    operation: params.operation,
    signal: params.signal,
  })
}

async function terminateDatabaseConnections(params: {
  runtime: CommunityNativePostgresRuntime
  state: CommunityNativePostgresState
  database: string
  signal?: AbortSignal
}): Promise<void> {
  const database = assertDatabaseName(params.database)
  await runDatabaseSql({
    ...params,
    sql: `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${database}' AND pid <> pg_backend_pid()`,
    operation: 'restore_terminate_connections',
  })
}

async function renameDatabase(params: {
  runtime: CommunityNativePostgresRuntime
  state: CommunityNativePostgresState
  from: string
  to: string
  signal?: AbortSignal
}): Promise<void> {
  const from = assertDatabaseName(params.from)
  const to = assertDatabaseName(params.to)
  await terminateDatabaseConnections({ ...params, database: from })
  await runDatabaseSql({
    ...params,
    sql: `ALTER DATABASE "${from}" RENAME TO "${to}"`,
    operation: 'restore_rename_database',
  })
}

async function dropDatabase(params: {
  runtime: CommunityNativePostgresRuntime
  state: CommunityNativePostgresState
  database: string
  signal?: AbortSignal
}): Promise<void> {
  const database = assertDatabaseName(params.database)
  await runDocker({
    runtime: params.runtime,
    args: ['container', 'exec', params.state.containerName, 'dropdb', '-U', 'aops', '--if-exists', '--force', database],
    operation: 'restore_drop_database',
    signal: params.signal,
  })
}

async function createDatabase(params: {
  runtime: CommunityNativePostgresRuntime
  state: CommunityNativePostgresState
  database: string
  signal?: AbortSignal
}): Promise<void> {
  const database = assertDatabaseName(params.database)
  await runDocker({
    runtime: params.runtime,
    args: ['container', 'exec', params.state.containerName, 'createdb', '-U', 'aops', database],
    operation: 'restore_create_database',
    signal: params.signal,
  })
}

async function inspectRestoreDatabases(params: {
  runtime: CommunityNativePostgresRuntime
  state: CommunityNativePostgresState
  candidateDatabase: string
  rescueDatabase: string
  signal?: AbortSignal
}): Promise<{ main: boolean; candidate: boolean; rescue: boolean }> {
  const [main, candidate, rescue] = await Promise.all([
    databaseExists({ ...params, database: 'aops' }),
    databaseExists({ ...params, database: params.candidateDatabase }),
    databaseExists({ ...params, database: params.rescueDatabase }),
  ])
  return { main, candidate, rescue }
}

export function assertCommunityNativeRestoredSnapshotStateV1(
  evidence: CommunityStrictSnapshotEvidenceV1,
  restored: CommunityStrictMigrationPlanningResultV1,
): void {
  if (restored.migrationPlan.action !== 'verify-only' || restored.requiresSnapshotEvidence ||
      restored.migrationPlan.pendingMigrations.length !== 0 ||
      restored.sourceFingerprintSha256 !== evidence.sourceMigrationStateFingerprintSha256 ||
      restored.lineageId !== evidence.sourceLineageId ||
      restored.schemaFingerprintSha256 !== evidence.sourceSchemaFingerprintSha256 ||
      restored.receiptFingerprintSha256 !== evidence.sourceReceiptFingerprintSha256 ||
      sourceDataFingerprint(restored) !== evidence.sourceDataFingerprintSha256 ||
      restored.stateFingerprintSha256 !== evidence.sourceStateFingerprintSha256) {
    throw new Error('community_native_snapshot_restored_state_mismatch')
  }
}

async function recoverOriginalDatabase(params: {
  runtime: CommunityNativePostgresRuntime
  state: CommunityNativePostgresState
  candidateDatabase: string
  rescueDatabase: string
  signal?: AbortSignal
}): Promise<void> {
  const observed = await inspectRestoreDatabases(params)
  if (observed.rescue) {
    if (observed.main) await dropDatabase({ ...params, database: 'aops' })
    if (observed.candidate) await dropDatabase({ ...params, database: params.candidateDatabase })
    await renameDatabase({ ...params, from: params.rescueDatabase, to: 'aops' })
  } else if (observed.main && observed.candidate) {
    await dropDatabase({ ...params, database: params.candidateDatabase })
  }
}

export async function createCommunityNativeManagedSnapshotV1(params: {
  planning: CommunityStrictMigrationPlanningResultV1
  policy: CommunityStrictMigrationPolicyV1
  sourceRoot: string
  state: CommunityNativePostgresState
  instanceName: string
  instanceRoot: string
  backupRoot: string
  evidenceRoot: string
  runtime?: CommunityNativePostgresRuntime
  planStrictPgSchema?: typeof planCommunityStrictPgSchema
  now?: () => Date
  signal?: AbortSignal
}): Promise<CommunityNativeManagedSnapshotResult> {
  if (!RAW_SHA256.test(params.planning.acceptedPlanSha256)) {
    throw new Error('community_native_snapshot_plan_invalid')
  }
  const state = assertCommunityNativePostgresInstanceState({
    state: params.state,
    instanceName: params.instanceName,
    instanceRoot: params.instanceRoot,
  })
  const runtime = params.runtime ?? communityNativePostgresRuntime
  const backupRoot = ensureCanonicalDirectory(params.backupRoot, 'community_native_snapshot_backup_root_unsafe')
  const evidenceRoot = ensureCanonicalDirectory(params.evidenceRoot, 'community_snapshot_evidence_root_unsafe')
  const backupPath = assertFreshDirectChild(
    backupRoot,
    path.join(backupRoot, `pre-migration-${params.planning.acceptedPlanSha256}.dump`),
    'community_native_snapshot_backup_already_exists',
  )
  const evidencePath = assertFreshDirectChild(
    evidenceRoot,
    path.join(evidenceRoot, `managed-${params.planning.acceptedPlanSha256}.json`),
    'community_snapshot_evidence_already_exists',
  )
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
  const backupFd = openSync(backupPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | noFollow, 0o600)
  const verifyDatabase = `aops_verify_${params.planning.acceptedPlanSha256.slice(0, 16)}`
  let keepBackup = false
  try {
    await runDocker({
      runtime,
      args: ['container', 'exec', state.containerName, 'pg_dump', '-U', 'aops', '-d', 'aops',
        '--format=custom', '--no-owner', '--no-acl'],
      operation: 'dump',
      outputFd: backupFd,
      signal: params.signal,
    })
    const backup = hashHeldFile(backupFd)
    fsyncDirectoryBestEffortOnWindows(backupRoot)
    await runDocker({
      runtime,
      args: ['container', 'exec', state.containerName, 'dropdb', '-U', 'aops', '--if-exists', '--force', verifyDatabase],
      operation: 'verify_drop_stale',
      signal: params.signal,
    })
    await runDocker({
      runtime,
      args: ['container', 'exec', state.containerName, 'createdb', '-U', 'aops', verifyDatabase],
      operation: 'verify_create',
      signal: params.signal,
    })
    try {
      await runDocker({
        runtime,
        args: ['container', 'exec', '-i', state.containerName, 'pg_restore', '-U', 'aops',
          '-d', verifyDatabase, '--no-owner', '--no-acl', '--exit-on-error'],
        operation: 'verify_restore',
        inputFd: backupFd,
        signal: params.signal,
      })
      const restored = await (params.planStrictPgSchema ?? planCommunityStrictPgSchema)({
        repoUrl: buildCommunityNativePostgresUrl(state, verifyDatabase),
        workspaceRoot: params.sourceRoot,
        policy: params.policy,
      })
      assertRestoredState(params.planning, restored)
    } finally {
      await runDocker({
        runtime,
        args: ['container', 'exec', state.containerName, 'dropdb', '-U', 'aops', '--if-exists', '--force', verifyDatabase],
        operation: 'verify_drop',
        signal: params.signal,
      })
    }
    const dataFingerprint = sourceDataFingerprint(params.planning)
    const evidence: CommunityStrictVerifiedBackupEvidenceV1 = {
      schemaVersion: 1,
      kind: 'managed-verified-backup',
      evidencePolicy: 'managed-restore-verified-v1',
      createdAt: (params.now ?? (() => new Date()))().toISOString(),
      backupPath,
      sha256: backup.sha256,
      byteLength: backup.byteLength,
      ...evidenceBase(params.planning, params.policy),
      restoreProof: {
        method: 'pg-restore-disposable-v1',
        backupSha256: backup.sha256,
        backupByteLength: backup.byteLength,
        restoredSchemaFingerprintSha256: params.planning.schemaFingerprintSha256,
        restoredReceiptFingerprintSha256: params.planning.receiptFingerprintSha256,
        restoredDataFingerprintSha256: dataFingerprint,
        restoredStateFingerprintSha256: params.planning.stateFingerprintSha256,
      },
    }
    writeJsonExclusive(evidencePath, evidence)
    keepBackup = true
    return { evidencePath, backupPath, evidence }
  } finally {
    closeSync(backupFd)
    if (!keepBackup) rmSync(backupPath, { force: true })
  }
}

export async function restoreCommunityNativeManagedSnapshotV1(params: {
  restoreId: string
  evidenceRoot: string
  evidencePath: string
  expectedEvidenceSha256: string
  backupRoot: string
  sourceRoot: string
  state: CommunityNativePostgresState
  instanceName: string
  instanceRoot: string
  runtime?: CommunityNativePostgresRuntime
  planStrictPgSchema?: typeof planCommunityStrictPgSchema
  onPhase?: (context: CommunityNativeManagedRestorePhaseContextV1) => void | Promise<void>
  signal?: AbortSignal
}): Promise<CommunityNativeManagedRestoreResultV1> {
  if (!UUID.test(params.restoreId) || !path.isAbsolute(params.sourceRoot)) {
    throw new Error('community_native_managed_restore_invocation_invalid')
  }
  throwIfAborted(params.signal)
  const state = assertCommunityNativePostgresInstanceState({
    state: params.state,
    instanceName: params.instanceName,
    instanceRoot: params.instanceRoot,
  })
  const runtime = params.runtime ?? communityNativePostgresRuntime
  const read = readCommunityNativeSnapshotEvidenceV1({
    evidenceRoot: params.evidenceRoot,
    evidencePath: params.evidencePath,
    expectedEvidenceSha256: params.expectedEvidenceSha256,
    expectedKind: 'managed-verified-backup',
  })
  const evidence = read.evidence as CommunityStrictVerifiedBackupEvidenceV1
  const backupRoot = ensureCanonicalDirectory(params.backupRoot, 'community_native_snapshot_backup_root_unsafe')
  const backupPath = path.resolve(evidence.backupPath)
  if (!samePath(path.dirname(backupPath), backupRoot) || !existsSync(backupPath)) {
    throw new Error('community_native_snapshot_backup_path_invalid')
  }
  const backupStats = lstatSync(backupPath)
  if (!backupStats.isFile() || backupStats.isSymbolicLink() ||
      !samePath(realpathSync.native(backupPath), backupPath)) {
    throw new Error('community_native_snapshot_backup_invalid')
  }
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
  const backupFd = openSync(backupPath, constants.O_RDONLY | noFollow)
  const candidateDatabase = assertDatabaseName(`aops_restore_${params.restoreId.replaceAll('-', '').toLowerCase()}`)
  const rescueDatabase = assertDatabaseName(`aops_rescue_${params.restoreId.replaceAll('-', '').toLowerCase()}`)
  const phase = async (value: CommunityNativeManagedRestorePhaseV1) => {
    throwIfAborted(params.signal)
    await params.onPhase?.({ restoreId: params.restoreId, phase: value, candidateDatabase, rescueDatabase })
  }
  const planner = params.planStrictPgSchema ?? planCommunityStrictPgSchema
  const policy = readCommunityNativeMigrationPolicy(params.sourceRoot)
  const verifyDatabase = async (database: string): Promise<CommunityStrictMigrationPlanningResultV1> => {
    const restored = await planner({
      repoUrl: buildCommunityNativePostgresUrl(state, database),
      workspaceRoot: params.sourceRoot,
      policy,
    })
    assertCommunityNativeRestoredSnapshotStateV1(evidence, restored)
    return restored
  }
  let completed = false
  try {
    const initialBackup = hashHeldFile(backupFd, false)
    if (initialBackup.sha256 !== evidence.sha256 || initialBackup.byteLength !== evidence.byteLength) {
      throw new Error('community_native_snapshot_backup_hash_mismatch')
    }
    let observed = await inspectRestoreDatabases({ runtime, state, candidateDatabase, rescueDatabase, signal: params.signal })
    const resumed = observed.candidate || observed.rescue || !observed.main

    if (!observed.main && !observed.candidate && observed.rescue) {
      await renameDatabase({ runtime, state, from: rescueDatabase, to: 'aops', signal: params.signal })
      throw new Error('community_native_managed_restore_interrupted_source_recovered')
    }
    if ((!observed.main && !observed.rescue) ||
        (observed.main && observed.candidate && observed.rescue) ||
        (!observed.main && observed.candidate && !observed.rescue)) {
      throw new Error('community_native_managed_restore_database_state_ambiguous')
    }

    if (observed.main && !observed.candidate && !observed.rescue) {
      await createDatabase({ runtime, state, database: candidateDatabase, signal: params.signal })
      let restoreFd: number | undefined
      try {
        restoreFd = openSync(backupPath, constants.O_RDONLY | noFollow)
        const held = fstatSync(backupFd, { bigint: true })
        const input = fstatSync(restoreFd, { bigint: true })
        if (held.dev !== input.dev || held.ino !== input.ino || held.size !== input.size || input.nlink !== 1n) {
          throw new Error('community_native_snapshot_backup_identity_changed')
        }
        await runDocker({
          runtime,
          args: ['container', 'exec', '-i', state.containerName, 'pg_restore', '-U', 'aops', '-d', candidateDatabase,
            '--no-owner', '--no-acl', '--exit-on-error'],
          operation: 'managed_restore_candidate',
          inputFd: restoreFd,
          signal: params.signal,
        })
      } finally {
        if (restoreFd !== undefined) closeSync(restoreFd)
      }
      await phase('candidate-restored')
      observed = await inspectRestoreDatabases({ runtime, state, candidateDatabase, rescueDatabase, signal: params.signal })
    }

    if (observed.main && observed.candidate && !observed.rescue) {
      await verifyDatabase(candidateDatabase)
      await phase('candidate-verified')
      await renameDatabase({ runtime, state, from: 'aops', to: rescueDatabase, signal: params.signal })
      await phase('source-preserved')
      observed = await inspectRestoreDatabases({ runtime, state, candidateDatabase, rescueDatabase, signal: params.signal })
    }

    if (!observed.main && observed.candidate && observed.rescue) {
      await verifyDatabase(candidateDatabase)
      await renameDatabase({ runtime, state, from: candidateDatabase, to: 'aops', signal: params.signal })
      await phase('target-promoted')
      observed = await inspectRestoreDatabases({ runtime, state, candidateDatabase, rescueDatabase, signal: params.signal })
    }

    if (!observed.main || observed.candidate || !observed.rescue) {
      throw new Error('community_native_managed_restore_database_state_ambiguous')
    }
    const restored = await verifyDatabase('aops')
    const finalBackup = hashHeldFile(backupFd, false)
    if (finalBackup.sha256 !== initialBackup.sha256 || finalBackup.byteLength !== initialBackup.byteLength) {
      throw new Error('community_native_snapshot_backup_identity_changed')
    }
    await phase('target-verified')
    completed = true
    return {
      restoreId: params.restoreId,
      evidencePath: read.evidencePath,
      evidenceSha256: read.evidenceSha256,
      backupPath,
      backupSha256: finalBackup.sha256,
      backupByteLength: finalBackup.byteLength,
      candidateDatabase,
      rescueDatabase,
      restoredLineageId: restored.lineageId,
      restoredMigrationStateFingerprintSha256: restored.sourceFingerprintSha256,
      restoredSchemaFingerprintSha256: restored.schemaFingerprintSha256,
      restoredReceiptFingerprintSha256: restored.receiptFingerprintSha256,
      restoredDataFingerprintSha256: sourceDataFingerprint(restored),
      restoredStateFingerprintSha256: restored.stateFingerprintSha256,
      resumed,
    }
  } catch (error) {
    if (!completed) {
      try {
        await recoverOriginalDatabase({ runtime, state, candidateDatabase, rescueDatabase })
      } catch (recoveryError) {
        const original = error instanceof Error ? error.message : String(error)
        const recovery = recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
        throw new Error(`${original}:automatic_source_recovery_failed:${recovery}`)
      }
    }
    throw error
  } finally {
    closeSync(backupFd)
  }
}

export async function cleanupCommunityNativeManagedRestoreRescueV1(params: {
  restoreId: string
  receiptRoot: string
  completedReceiptPath: string
  expectedCompletedReceiptSha256: string
  evidenceRoot: string
  evidencePath: string
  expectedEvidenceSha256: string
  sourceRoot: string
  state: CommunityNativePostgresState
  instanceName: string
  instanceRoot: string
  runtime?: CommunityNativePostgresRuntime
  planStrictPgSchema?: typeof planCommunityStrictPgSchema
  signal?: AbortSignal
}): Promise<{ rescueDatabase: string; dropped: boolean }> {
  if (!UUID.test(params.restoreId) || !RAW_SHA256.test(params.expectedCompletedReceiptSha256) ||
      !path.isAbsolute(params.sourceRoot)) {
    throw new Error('community_native_managed_restore_cleanup_proof_invalid')
  }
  const state = assertCommunityNativePostgresInstanceState({
    state: params.state,
    instanceName: params.instanceName,
    instanceRoot: params.instanceRoot,
  })
  const runtime = params.runtime ?? communityNativePostgresRuntime
  const candidateDatabase = assertDatabaseName(`aops_restore_${params.restoreId.replaceAll('-', '').toLowerCase()}`)
  const rescueDatabase = assertDatabaseName(`aops_rescue_${params.restoreId.replaceAll('-', '').toLowerCase()}`)
  const receiptRoot = ensureCanonicalDirectory(params.receiptRoot, 'community_native_database_restore_root_unsafe')
  const receiptPath = path.resolve(params.completedReceiptPath)
  if (!samePath(path.dirname(receiptPath), receiptRoot) || !existsSync(receiptPath)) {
    throw new Error('community_native_managed_restore_cleanup_receipt_invalid')
  }
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
  let receiptFd: number | undefined
  let receipt!: Record<string, any>
  try {
    const pathStats = lstatSync(receiptPath, { bigint: true })
    if (!pathStats.isFile() || pathStats.isSymbolicLink() || pathStats.size < 1n ||
        pathStats.size > BigInt(MAX_EVIDENCE_BYTES) || !samePath(realpathSync.native(receiptPath), receiptPath)) {
      throw new Error('community_native_managed_restore_cleanup_receipt_invalid')
    }
    receiptFd = openSync(receiptPath, constants.O_RDONLY | noFollow)
    const before = fstatSync(receiptFd, { bigint: true })
    if (before.dev !== pathStats.dev || before.ino !== pathStats.ino || before.size !== pathStats.size ||
        before.nlink !== 1n) {
      throw new Error('community_native_managed_restore_cleanup_receipt_invalid')
    }
    const parsed = JSON.parse(readFileSync(receiptFd, 'utf8')) as unknown
    const after = fstatSync(receiptFd, { bigint: true })
    if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size ||
        after.nlink !== before.nlink || after.mtimeNs !== before.mtimeNs || !isRecord(parsed)) {
      throw new Error('community_native_managed_restore_cleanup_receipt_invalid')
    }
    receipt = parsed
  } catch {
    throw new Error('community_native_managed_restore_cleanup_receipt_invalid')
  } finally {
    if (receiptFd !== undefined) closeSync(receiptFd)
  }
  exactKeys(receipt, [
    'schemaVersion', 'status', 'restoreId', 'updateId', 'instanceName', 'completedAt', 'recoveryOwner',
    'evidenceKind', 'evidenceSha256', 'restoredLineageId', 'restoredMigrationStateFingerprintSha256',
    'restoredSchemaFingerprintSha256', 'restoredReceiptFingerprintSha256', 'restoredDataFingerprintSha256',
    'restoredStateFingerprintSha256', 'rescueDatabase',
  ], 'community_native_managed_restore_cleanup_receipt_invalid')
  if (sha256(JSON.stringify(receipt)) !== params.expectedCompletedReceiptSha256 ||
      receipt.schemaVersion !== 1 || receipt.status !== 'community-native-database-restored' ||
      receipt.restoreId !== params.restoreId || receipt.instanceName !== params.instanceName ||
      receipt.recoveryOwner !== 'managed' || receipt.evidenceKind !== 'managed-verified-backup' ||
      receipt.rescueDatabase !== rescueDatabase || Number.isNaN(Date.parse(String(receipt.completedAt)))) {
    throw new Error('community_native_managed_restore_cleanup_receipt_invalid')
  }
  const evidenceRead = readCommunityNativeSnapshotEvidenceV1({
    evidenceRoot: params.evidenceRoot,
    evidencePath: params.evidencePath,
    expectedEvidenceSha256: params.expectedEvidenceSha256,
    expectedKind: 'managed-verified-backup',
  })
  if (receipt.evidenceSha256 !== evidenceRead.evidenceSha256 ||
      receipt.restoredLineageId !== evidenceRead.evidence.sourceLineageId ||
      receipt.restoredMigrationStateFingerprintSha256 !==
        evidenceRead.evidence.sourceMigrationStateFingerprintSha256 ||
      receipt.restoredSchemaFingerprintSha256 !== evidenceRead.evidence.sourceSchemaFingerprintSha256 ||
      receipt.restoredReceiptFingerprintSha256 !== evidenceRead.evidence.sourceReceiptFingerprintSha256 ||
      receipt.restoredDataFingerprintSha256 !== evidenceRead.evidence.sourceDataFingerprintSha256 ||
      receipt.restoredStateFingerprintSha256 !== evidenceRead.evidence.sourceStateFingerprintSha256) {
    throw new Error('community_native_managed_restore_cleanup_receipt_mismatch')
  }
  const policy = readCommunityNativeMigrationPolicy(params.sourceRoot)
  const restored = await (params.planStrictPgSchema ?? planCommunityStrictPgSchema)({
    repoUrl: buildCommunityNativePostgresUrl(state, 'aops'),
    workspaceRoot: params.sourceRoot,
    policy,
  })
  assertCommunityNativeRestoredSnapshotStateV1(evidenceRead.evidence, restored)
  const observed = await inspectRestoreDatabases({ runtime, state, candidateDatabase, rescueDatabase, signal: params.signal })
  if (!observed.main || observed.candidate) {
    throw new Error('community_native_managed_restore_cleanup_state_invalid')
  }
  if (!observed.rescue) return { rescueDatabase, dropped: false }
  await dropDatabase({ runtime, state, database: rescueDatabase, signal: params.signal })
  return { rescueDatabase, dropped: true }
}
