import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import type {
  CommunityStrictExternalSnapshotEvidenceV1,
  CommunityStrictMigrationPlanAcceptedContextV1,
  CommunityStrictMigrationPlanV1,
  CommunityStrictMigrationPlanningResultV1,
  CommunityStrictMigrationPolicyV1,
} from '@aops/pg-bootstrap'

import {
  COMMUNITY_NATIVE_CHILD_PROTOCOL,
  COMMUNITY_NATIVE_CONTROL_PROTOCOL,
  type CommunityNativeChildIdentity,
  type CommunityNativeControlRequest,
} from './community-native-child.js'
import { resolveCommunityInstallPaths } from './community-lifecycle.js'
import type { CommunityInstanceContract, CommunityPostgresTlsPolicy } from './community-instance-contract.js'
import {
  COMMUNITY_NATIVE_POSTGRES_CONTRACT_PATH,
  assertCommunityNativePostgresInstanceState,
  assertCommunityNativePostgresState,
  buildCommunityNativePostgresUrl,
  setupCommunityNativePostgres,
  startCommunityNativePostgres,
  stopCommunityNativePostgres,
  type CommunityNativePostgresRuntime,
  type CommunityNativePostgresState,
} from './community-native-postgres.js'
import {
  COMMUNITY_NATIVE_MIGRATION_POLICY_PATH,
  assertCommunityNativeMigrationReceiptV1,
  planCommunityNativeMigration,
  runCommunityNativeMigration,
  type CommunityNativeMigrationReceiptV1,
  type CommunityNativeMigrationRunner,
} from './community-native-migration.js'
import {
  createCommunityExternalSnapshotAttestationV1,
  createCommunityNativeManagedSnapshotV1,
  writeCommunityExternalSnapshotAttestationV1,
} from './community-migration-snapshot.js'
import {
  createCommunityNativeApplicationReferenceV1,
  readCommunityNativeApplicationUpdate,
  sameCommunityNativeApplicationContent,
  writeCommunityNativeApplicationRollbackOutcome,
  writeCommunityNativeApplicationRollbackPrepared,
  writeCommunityNativeApplicationUpdateOutcome,
  writeCommunityNativeApplicationUpdatePrepared,
  type CommunityNativeApplicationUpdatePreparedV1,
  type CommunityNativeApplicationUpdateRecordV1,
} from './community-native-application-recovery.js'

const PUBLIC_ROOT_NAME = 'aops-community-distribution'
const PUBLIC_SERVER_PACKAGE_NAME = '@aopslab/aops-server'
const PUBLIC_PACKAGE_MANAGER = /^pnpm@(11\.[0-9]+\.[0-9]+)$/
const RELEASE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/
const INSTANCE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const SHA256 = /^sha256:[a-f0-9]{64}$/
const RAW_SHA256 = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_CONFIG_BYTES = 65_536
const MAX_TLS_ROOT_CERT_BYTES = 1_048_576
const MIN_EXACT_SECRET_REDACTION_LENGTH = 8
const DEFAULT_READY_TIMEOUT_MS = 30_000
const DEFAULT_STOP_TIMEOUT_MS = 15_000
const READY_POLL_MS = 250
const MAX_LOG_TAIL_BYTES = 4 * 1024 * 1024
const MAX_INVENTORY_FILES = 50_000
const MAX_INVENTORY_BYTES = 2 * 1024 * 1024 * 1024
const SOURCE_INVENTORY_EXCLUDED_DIRECTORIES = new Set([
  '.aops', '.git', '.pnpm-store', '.svelte-kit', '.turbo', 'build', 'coverage', 'dist', 'node_modules',
])
const RUNTIME_INVENTORY_EXCLUDED_DIRECTORIES = new Set([
  '.aops', '.git', '.pnpm-store', '.svelte-kit', '.turbo', 'coverage', 'node_modules',
])
const CHECKOUT_REQUIRED_SOURCE_PATHS = Object.freeze([
  'apps/aops-cli/package.json',
  'apps/aops-cockpit-v2/package.json',
  'apps/aops-server/package.json',
  'apps/aops-server/scripts/community-host.mjs',
  COMMUNITY_NATIVE_MIGRATION_POLICY_PATH,
  COMMUNITY_NATIVE_POSTGRES_CONTRACT_PATH,
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
])
const CHECKOUT_BUILD_PATHS = Object.freeze({
  hostEntry: 'apps/aops-server/scripts/community-host.mjs',
  handlerEntry: 'apps/aops-server/build/handler.js',
  cockpitIndex: 'apps/aops-cockpit-v2/dist/index.html',
})
const PACKAGE_REQUIRED_SOURCE_PATHS = Object.freeze([
  'aops-server-runtime.json',
  'community-postgres.json',
  'npm-shrinkwrap.json',
  'package.json',
  'runtime/agentspace-host-adapter.mjs',
  'runtime/agentspace-tooling.mjs',
  'runtime/docman-host-adapter.mjs',
  'runtime/docman-policy.mjs',
  'runtime/docman-tooling.mjs',
  'runtime/projectman-host-adapter.mjs',
  'runtime/scope-context.mjs',
  'scripts/community-host.mjs',
  'scripts/community-migration-policy-v1.json',
])
const PACKAGE_BUILD_PATHS = Object.freeze({
  hostEntry: 'scripts/community-host.mjs',
  handlerEntry: 'build/handler.js',
  cockpitIndex: 'cockpit/index.html',
})

type CommunityNativeSourceLayout = Readonly<{
  kind: 'checkout' | 'npm-package'
  requiredSourcePaths: readonly string[]
  lockfilePath: string
  buildPaths: Readonly<{
    hostEntry: string
    handlerEntry: string
    cockpitIndex: string
  }>
}>

export type CommunityNativeLaunchMode = 'foreground' | 'detached'

export type CommunityNativeSourceIdentity = {
  root: string
  packageManager: string
  releaseVersion: string
  packageSha256: string
  lockfileSha256: string
  sourceFileCount: number
  sourceInventorySha256: string
  sourceFingerprint: string
}

export type CommunityNativeBuildIdentity = {
  completedAt: string
  hostEntry: string
  handlerEntry: string
  cockpitIndex: string
  hostEntrySha256: string
  handlerEntrySha256: string
  cockpitIndexSha256: string
  runtimeFileCount: number
  runtimeInventorySha256: string
  buildFingerprint: string
}

type CommunityNativeInstallStateBase = {
  schemaVersion: 1
  runtime: 'native'
  instanceName: string
  installId: string
  createdAt: string
  updatedAt: string
  source: CommunityNativeSourceIdentity
  build: CommunityNativeBuildIdentity
  server: {
    host: '127.0.0.1'
    port: number
  }
}

export type CommunityNativeInstallState = CommunityNativeInstallStateBase & (
  | {
      profile: 'native-external-postgres'
      postgres: {
        mode: 'external'
        configRef: string
        tlsPolicy: CommunityPostgresTlsPolicy
      }
    }
  | {
      profile: 'native-container-postgres'
      postgres: CommunityNativePostgresState
    }
)

export type CommunityNativeProcessRecord = {
  schemaVersion: 1
  protocol: typeof COMMUNITY_NATIVE_CHILD_PROTOCOL
  instanceName: string
  launchId: string
  pid: number
  hostPid?: number
  mode: CommunityNativeLaunchMode
  status: 'starting' | 'running' | 'exited' | 'failed'
  startedAt: string
  updatedAt: string
  sourceFingerprint: string
  identityPath: string
  controlPath: string
  logPath: string | null
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  failure?: string
}

export type CommunityNativePaths = {
  dataRoot: string
  instanceRoot: string
  runtimeRoot: string
  statePath: string
  processPath: string
  identityPath: string
  controlPath: string
  secretPath: string
  migrationReceiptPath: string
  migrationIntentPath: string
  migrationReceiptRoot: string
  migrationEvidenceRoot: string
  applicationUpdateRoot: string
  databaseRestoreRoot: string
  backupRoot: string
  logRoot: string
  logPath: string
  ociStatePath: string
}

export type CommunityNativeInspection = {
  status: 'not-installed' | 'installed' | 'partial' | 'runtime-conflict'
  paths: CommunityNativePaths
  state?: CommunityNativeInstallState
  process?: CommunityNativeProcessRecord | null
  migration?: CommunityNativeMigrationReceiptV1
  error?: string
  presentFiles: string[]
  missingFiles: string[]
}

export type CommunityNativeMigrationIntentV1 = Readonly<{
  schemaVersion: 1
  instanceName: string
  installId: string
  sourceFingerprint: string
  acceptedPlanSha256: string
  sourceMigrationStateFingerprintSha256: string
  migrationPlan: CommunityStrictMigrationPlanV1
  snapshotEvidenceKind: 'managed-verified-backup' | 'external-snapshot-attestation' | null
  snapshotEvidenceSha256: string | null
  createdAt: string
}>

type CommunityNativeMigrationPlanAcceptanceHistoryV1 = Readonly<{
  schemaVersion: 1
  status: 'community-native-migration-plan-acceptance'
  instanceName: string
  installId: string
  policyId: string
  acceptedPlanSha256: string
  action: 'migrate' | 'verify-only'
  sourceMigrationStateFingerprintSha256: string
  targetLineageId: string
  resultLineageId: string
  resultSchemaFingerprintSha256: string
  resultReceiptFingerprintSha256: string
  resultMigrationStateFingerprintSha256: string
  snapshotEvidenceKind: 'managed-verified-backup' | 'external-snapshot-attestation' | null
  snapshotEvidenceSha256: string | null
  acceptedAt: string
}>

export type CommunityNativeInstalledMigrationPlanV1 = Readonly<{
  schemaVersion: 1
  instanceName: string
  profile: CommunityNativeInstallState['profile']
  evidencePath: string | null
  planning: CommunityStrictMigrationPlanningResultV1
}>

export type CommunityNativeExternalSnapshotAttestationResultV1 = Readonly<{
  schemaVersion: 1
  instanceName: string
  profile: 'native-external-postgres'
  applied: boolean
  evidencePath: string
  evidence: CommunityStrictExternalSnapshotEvidenceV1
}>

export type CommunityNativeMigrationPlanningDependencies = Readonly<{
  planMigration?: typeof planCommunityNativeMigration
  writeExternalAttestation?: typeof writeCommunityExternalSnapshotAttestationV1
  now?: () => Date
}>

export type CommunityNativeBuildInvocation = {
  command: string
  args: string[]
  cwd: string
  signal?: AbortSignal
}

export type CommunityNativeExit = {
  exitCode: number | null
  signal: NodeJS.Signals | null
}

export type CommunityNativeChildHandle = {
  pid: number
  wait: Promise<CommunityNativeExit>
  detach: () => void
  terminate: () => Promise<void>
}

export type CommunityNativeRuntime = {
  runBuild: (invocation: CommunityNativeBuildInvocation) => Promise<CommunityNativeExit>
  migrate: CommunityNativeMigrationRunner
  spawnChild: (params: {
    childEntry: string
    cwd: string
    env: NodeJS.ProcessEnv
    mode: CommunityNativeLaunchMode
    logPath: string
  }) => Promise<CommunityNativeChildHandle>
  health: (url: string, signal?: AbortSignal) => Promise<boolean>
  processExists: (pid: number) => boolean
  sleep: (milliseconds: number, signal?: AbortSignal) => Promise<void>
}

export type CommunityNativeRuntimeState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'unhealthy'
  | 'crashed'
  | 'identity-conflict'
  | 'orphaned'

export type CommunityNativeRuntimeStatus = {
  runtimeState: CommunityNativeRuntimeState
  recoverable: boolean
  process: CommunityNativeProcessRecord | null
  identity: CommunityNativeChildIdentity | null
  supervisorAlive: boolean
  hostAlive: boolean
  health: 'healthy' | 'unhealthy' | 'not-checked'
  reason: string | null
}

export type CommunityNativeLogTail = {
  content: string
  lineCount: number
  truncated: boolean
  logPath: string
}

export type CommunityNativeLaunch = {
  paths: CommunityNativePaths
  state: CommunityNativeInstallState
  process: CommunityNativeProcessRecord
  migration: CommunityNativeMigrationReceiptV1
  mode: CommunityNativeLaunchMode
  waitForExit?: () => Promise<CommunityNativeExit>
}

function sha256(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function throwIfNativeAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('community_operation_aborted')
}

function hashFile(filePath: string): string {
  const stats = lstatSync(filePath)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`community_native_required_file_invalid:${path.basename(filePath)}`)
  }
  return sha256(readFileSync(filePath))
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function safeRegularFile(root: string, relativePath: string): string {
  const candidate = path.resolve(root, relativePath)
  if (!isWithin(root, candidate)) throw new Error(`community_native_source_path_escape:${relativePath}`)
  let stats: ReturnType<typeof lstatSync>
  try { stats = lstatSync(candidate) } catch { throw new Error(`community_native_source_file_missing:${relativePath}`) }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`community_native_source_file_invalid:${relativePath}`)
  }
  const realRoot = realpathSync(root)
  const realCandidate = realpathSync(candidate)
  if (!isWithin(realRoot, realCandidate)) throw new Error(`community_native_source_realpath_escape:${relativePath}`)
  return realCandidate
}

type CommunityNativeTreeInventory = Readonly<{
  fileCount: number
  byteLength: number
  sha256: string
}>

function codepointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function inventoryCommunityNativeTree(
  root: string,
  excludedDirectories: ReadonlySet<string>,
): CommunityNativeTreeInventory {
  const canonicalRoot = realpathSync(root)
  const records: Array<Readonly<{ path: string; byteLength: number; sha256: string }>> = []
  let byteLength = 0
  const visit = (directory: string, prefix: string): void => {
    const directoryStats = lstatSync(directory)
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink() || realpathSync(directory) !== directory) {
      throw new Error(`community_native_inventory_directory_unsafe:${prefix || '.'}`)
    }
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => codepointCompare(left.name, right.name))) {
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolutePath = path.join(directory, entry.name)
      const stats = lstatSync(absolutePath)
      if (stats.isSymbolicLink()) throw new Error(`community_native_inventory_link_forbidden:${relativePath}`)
      if (stats.isDirectory()) {
        visit(absolutePath, relativePath)
        continue
      }
      if (!stats.isFile() || stats.size < 0) {
        throw new Error(`community_native_inventory_entry_invalid:${relativePath}`)
      }
      const canonicalFile = realpathSync(absolutePath)
      if (!isWithin(canonicalRoot, canonicalFile)) {
        throw new Error(`community_native_inventory_path_escape:${relativePath}`)
      }
      const content = readFileSync(canonicalFile)
      byteLength += content.byteLength
      records.push({ path: relativePath.replace(/\\/g, '/'), byteLength: content.byteLength, sha256: sha256(content) })
      if (records.length > MAX_INVENTORY_FILES || byteLength > MAX_INVENTORY_BYTES) {
        throw new Error('community_native_inventory_bounds_exceeded')
      }
    }
  }
  visit(canonicalRoot, '')
  return Object.freeze({
    fileCount: records.length,
    byteLength,
    sha256: sha256(JSON.stringify(records)),
  })
}

function atomicJsonWrite(targetPath: string, value: unknown): void {
  const parent = path.dirname(targetPath)
  mkdirSync(parent, { recursive: true, mode: 0o700 })
  const tempPath = path.join(
    parent,
    `.${path.basename(targetPath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`,
  )
  let descriptor: number | undefined
  try {
    descriptor = openSync(tempPath, 'wx', 0o600)
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8' })
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(tempPath, targetPath)
    fsyncDirectoryBestEffortOnWindows(parent)
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
    rmSync(tempPath, { force: true })
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

function readJson(targetPath: string, code: string): unknown {
  try {
    return JSON.parse(readFileSync(targetPath, 'utf8'))
  } catch {
    throw new Error(code)
  }
}

function exactKeys(input: Record<string, unknown>, expected: string[], code: string): void {
  const actual = Object.keys(input).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(code)
  }
}

function validPort(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 65_535
}

export function resolveCommunityNativePaths(input: { instanceName?: string; dataRoot?: string } = {}): CommunityNativePaths {
  const ociPaths = resolveCommunityInstallPaths(input)
  return {
    dataRoot: ociPaths.dataRoot,
    instanceRoot: ociPaths.instanceRoot,
    runtimeRoot: ociPaths.runtimeRoot,
    statePath: path.join(ociPaths.runtimeRoot, 'native-state.json'),
    processPath: path.join(ociPaths.runtimeRoot, 'native-process.json'),
    identityPath: path.join(ociPaths.runtimeRoot, 'native-identity.json'),
    controlPath: path.join(ociPaths.runtimeRoot, 'native-control.json'),
    secretPath: path.join(ociPaths.runtimeRoot, 'native-secrets.env'),
    migrationReceiptPath: path.join(ociPaths.runtimeRoot, 'native-migration-receipt.json'),
    migrationIntentPath: path.join(ociPaths.runtimeRoot, 'native-migration-intent.json'),
    migrationReceiptRoot: path.join(ociPaths.runtimeRoot, 'native-migration-receipts'),
    migrationEvidenceRoot: path.join(ociPaths.runtimeRoot, 'native-migration-evidence'),
    applicationUpdateRoot: path.join(ociPaths.runtimeRoot, 'native-application-updates'),
    databaseRestoreRoot: path.join(ociPaths.runtimeRoot, 'native-database-restores'),
    backupRoot: ociPaths.backupRoot,
    logRoot: path.join(ociPaths.instanceRoot, 'logs'),
    logPath: path.join(ociPaths.instanceRoot, 'logs', 'native-server.log'),
    ociStatePath: ociPaths.statePath,
  }
}

function samePhysicalPath(left: string, right: string): boolean {
  return path.relative(path.resolve(left), path.resolve(right)) === '' &&
    path.relative(path.resolve(right), path.resolve(left)) === ''
}

function assertPlainCanonicalDirectory(candidate: string, code: string): void {
  const stats = lstatSync(candidate)
  if (!stats.isDirectory() || stats.isSymbolicLink() || !samePhysicalPath(realpathSync.native(candidate), candidate)) {
    throw new Error(code)
  }
}

function assertPlainCanonicalFile(candidate: string, expectedParent: string, code: string): void {
  const stats = lstatSync(candidate)
  if (!stats.isFile() || stats.isSymbolicLink() || !samePhysicalPath(realpathSync.native(candidate), candidate) ||
      !samePhysicalPath(path.dirname(candidate), expectedParent)) {
    throw new Error(code)
  }
}

export function assertCommunityNativePathLayout(
  paths: CommunityNativePaths,
  options: { requireInstanceRoot?: boolean } = {},
): void {
  const instanceExists = existsSync(paths.instanceRoot)
  if (!instanceExists) {
    if (options.requireInstanceRoot === true) throw new Error('community_native_instance_root_missing')
    return
  }
  assertPlainCanonicalDirectory(paths.instanceRoot, 'community_native_instance_root_unsafe')
  if (existsSync(paths.runtimeRoot)) {
    if (!samePhysicalPath(path.dirname(paths.runtimeRoot), paths.instanceRoot)) {
      throw new Error('community_native_runtime_root_unsafe')
    }
    assertPlainCanonicalDirectory(paths.runtimeRoot, 'community_native_runtime_root_unsafe')
  }
  if (existsSync(paths.logRoot)) {
    if (!samePhysicalPath(path.dirname(paths.logRoot), paths.instanceRoot)) {
      throw new Error('community_native_log_root_unsafe')
    }
    assertPlainCanonicalDirectory(paths.logRoot, 'community_native_log_root_unsafe')
  }
  for (const [candidate, code, expectedParent] of [
    [paths.migrationReceiptRoot, 'community_native_migration_receipt_root_unsafe', paths.runtimeRoot],
    [paths.migrationEvidenceRoot, 'community_native_migration_evidence_root_unsafe', paths.runtimeRoot],
    [paths.applicationUpdateRoot, 'community_native_application_update_root_unsafe', paths.runtimeRoot],
    [paths.databaseRestoreRoot, 'community_native_database_restore_root_unsafe', paths.runtimeRoot],
    [paths.backupRoot, 'community_native_backup_root_unsafe', paths.instanceRoot],
  ] as const) {
    if (existsSync(candidate)) {
      if (!samePhysicalPath(path.dirname(candidate), expectedParent)) throw new Error(code)
      assertPlainCanonicalDirectory(candidate, code)
    }
  }
  for (const candidate of [
    paths.statePath,
    paths.processPath,
    paths.identityPath,
    paths.controlPath,
    paths.secretPath,
    paths.migrationReceiptPath,
    paths.migrationIntentPath,
  ]) {
    if (existsSync(candidate)) {
      if (!existsSync(paths.runtimeRoot)) throw new Error('community_native_runtime_root_unsafe')
      assertPlainCanonicalFile(candidate, paths.runtimeRoot, 'community_native_runtime_file_unsafe')
    }
  }
  const postgresSecretPath = path.join(paths.runtimeRoot, 'native-postgres.env')
  if (existsSync(postgresSecretPath)) {
    if (!existsSync(paths.runtimeRoot)) throw new Error('community_native_runtime_root_unsafe')
    assertPlainCanonicalFile(postgresSecretPath, paths.runtimeRoot, 'community_native_postgres_secret_invalid')
  }
  if (existsSync(paths.logPath)) {
    if (!existsSync(paths.logRoot)) throw new Error('community_native_log_root_unsafe')
    assertPlainCanonicalFile(paths.logPath, paths.logRoot, 'community_native_log_file_invalid')
  }
  if (existsSync(paths.ociStatePath)) {
    assertPlainCanonicalFile(paths.ociStatePath, paths.instanceRoot, 'community_native_oci_state_unsafe')
  }
}

function parseNativeState(value: unknown, paths: CommunityNativePaths): CommunityNativeInstallState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('community_native_state_invalid')
  const input = value as Record<string, any>
  exactKeys(input, [
    'schemaVersion', 'runtime', 'instanceName', 'installId', 'profile', 'createdAt', 'updatedAt',
    'source', 'build', 'postgres', 'server',
  ], 'community_native_state_schema_invalid')
  if (
    input.schemaVersion !== 1 || input.runtime !== 'native' ||
    !['native-external-postgres', 'native-container-postgres'].includes(String(input.profile)) ||
    !INSTANCE_NAME.test(String(input.instanceName)) ||
    !UUID.test(String(input.installId)) || Number.isNaN(Date.parse(String(input.createdAt))) ||
    Number.isNaN(Date.parse(String(input.updatedAt)))
  ) throw new Error('community_native_state_schema_invalid')
  exactKeys(input.source, [
    'root', 'packageManager', 'releaseVersion', 'packageSha256', 'lockfileSha256',
    'sourceFileCount', 'sourceInventorySha256', 'sourceFingerprint',
  ], 'community_native_state_source_invalid')
  exactKeys(input.build, [
    'completedAt', 'hostEntry', 'handlerEntry', 'cockpitIndex', 'hostEntrySha256',
    'handlerEntrySha256', 'cockpitIndexSha256', 'runtimeFileCount', 'runtimeInventorySha256',
    'buildFingerprint',
  ], 'community_native_state_build_invalid')
  exactKeys(input.server, ['host', 'port'], 'community_native_state_server_invalid')
  if (
    !path.isAbsolute(input.source.root) || !PUBLIC_PACKAGE_MANAGER.test(input.source.packageManager) ||
    !RELEASE_VERSION.test(String(input.source.releaseVersion)) ||
    !Number.isSafeInteger(input.source.sourceFileCount) || input.source.sourceFileCount < 1 ||
    ![input.source.packageSha256, input.source.lockfileSha256, input.source.sourceInventorySha256,
      input.source.sourceFingerprint].every((item) => SHA256.test(String(item))) ||
    Number.isNaN(Date.parse(String(input.build.completedAt))) ||
    ![input.build.hostEntry, input.build.handlerEntry, input.build.cockpitIndex].every((item) => path.isAbsolute(String(item))) ||
    !Number.isSafeInteger(input.build.runtimeFileCount) || input.build.runtimeFileCount < 1 ||
    ![input.build.hostEntrySha256, input.build.handlerEntrySha256, input.build.cockpitIndexSha256,
      input.build.runtimeInventorySha256, input.build.buildFingerprint]
      .every((item) => SHA256.test(String(item))) ||
    input.server.host !== '127.0.0.1' || !validPort(input.server.port)
  ) throw new Error('community_native_state_schema_invalid')
  const layout = sourceLayout(input.source.root)
  if (
    !samePhysicalPath(input.build.hostEntry, path.join(input.source.root, layout.buildPaths.hostEntry)) ||
    !samePhysicalPath(input.build.handlerEntry, path.join(input.source.root, layout.buildPaths.handlerEntry)) ||
    !samePhysicalPath(input.build.cockpitIndex, path.join(input.source.root, layout.buildPaths.cockpitIndex))
  ) throw new Error('community_native_state_build_path_mismatch')
  if (input.profile === 'native-external-postgres') {
    exactKeys(input.postgres, ['mode', 'configRef', 'tlsPolicy'], 'community_native_state_postgres_invalid')
    if (
      input.postgres.mode !== 'external' || !path.isAbsolute(input.postgres.configRef) ||
      !['disable', 'require', 'verify-full'].includes(input.postgres.tlsPolicy)
    ) throw new Error('community_native_state_postgres_invalid')
  } else {
    const postgres = assertCommunityNativePostgresInstanceState({
      state: assertCommunityNativePostgresState(input.postgres),
      instanceName: String(input.instanceName),
      instanceRoot: paths.instanceRoot,
    })
    if (postgres.mode !== 'container') throw new Error('community_native_state_postgres_invalid')
    void buildCommunityNativePostgresUrl(postgres)
  }
  return input as CommunityNativeInstallState
}

function parseNativeProcess(value: unknown, paths: CommunityNativePaths): CommunityNativeProcessRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('community_native_process_invalid')
  const input = value as Record<string, any>
  const required = [
    'schemaVersion', 'protocol', 'instanceName', 'launchId', 'pid', 'mode', 'status', 'startedAt',
    'updatedAt', 'sourceFingerprint', 'identityPath', 'controlPath', 'logPath',
  ]
  const optional = ['hostPid', 'exitCode', 'signal', 'failure']
  const keys = Object.keys(input)
  if (required.some((key) => !keys.includes(key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new Error('community_native_process_schema_invalid')
  }
  if (
    input.schemaVersion !== 1 || input.protocol !== COMMUNITY_NATIVE_CHILD_PROTOCOL ||
    !INSTANCE_NAME.test(String(input.instanceName)) || !UUID.test(String(input.launchId)) ||
    !Number.isSafeInteger(input.pid) || input.pid < 1 ||
    (input.hostPid !== undefined && (!Number.isSafeInteger(input.hostPid) || input.hostPid < 1)) ||
    !['foreground', 'detached'].includes(input.mode) ||
    !['starting', 'running', 'exited', 'failed'].includes(input.status) ||
    Number.isNaN(Date.parse(String(input.startedAt))) || Number.isNaN(Date.parse(String(input.updatedAt))) ||
    !SHA256.test(String(input.sourceFingerprint)) || !path.isAbsolute(input.identityPath) ||
    !path.isAbsolute(input.controlPath) ||
    (input.logPath !== null && !path.isAbsolute(input.logPath))
  ) throw new Error('community_native_process_schema_invalid')
  const expectedLogPath = input.mode === 'detached' ? paths.logPath : null
  if (
    !samePhysicalPath(input.identityPath, paths.identityPath) ||
    !samePhysicalPath(input.controlPath, paths.controlPath) ||
    (expectedLogPath === null ? input.logPath !== null :
      input.logPath === null || !samePhysicalPath(input.logPath, expectedLogPath))
  ) throw new Error('community_native_process_path_mismatch')
  return input as CommunityNativeProcessRecord
}

export function readCommunityNativeState(paths: CommunityNativePaths): CommunityNativeInstallState {
  assertCommunityNativePathLayout(paths, { requireInstanceRoot: true })
  return parseNativeState(readJson(paths.statePath, 'community_native_state_json_invalid'), paths)
}

export function readCommunityNativeProcess(paths: CommunityNativePaths): CommunityNativeProcessRecord | null {
  assertCommunityNativePathLayout(paths, { requireInstanceRoot: true })
  if (!existsSync(paths.processPath)) return null
  return parseNativeProcess(readJson(paths.processPath, 'community_native_process_json_invalid'), paths)
}

export function readCommunityNativeMigrationReceipt(
  paths: CommunityNativePaths,
  state?: CommunityNativeInstallState,
): CommunityNativeMigrationReceiptV1 | null {
  assertCommunityNativePathLayout(paths, { requireInstanceRoot: true })
  if (!existsSync(paths.migrationReceiptPath)) return null
  const receipt = assertCommunityNativeMigrationReceiptV1(
    readJson(paths.migrationReceiptPath, 'community_native_migration_receipt_json_invalid'),
  )
  if (state && (
    receipt.instanceName !== state.instanceName ||
    receipt.installId !== state.installId ||
    receipt.sourceFingerprint !== state.source.sourceFingerprint
  )) {
    throw new Error('community_native_migration_receipt_identity_mismatch')
  }
  return receipt
}

function parseCommunityNativeMigrationIntentV1(
  value: unknown,
  state: CommunityNativeInstallState,
): CommunityNativeMigrationIntentV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community_native_migration_intent_invalid')
  }
  const input = value as Record<string, any>
  exactKeys(input, [
    'schemaVersion', 'instanceName', 'installId', 'sourceFingerprint', 'acceptedPlanSha256',
    'sourceMigrationStateFingerprintSha256', 'migrationPlan', 'snapshotEvidenceKind',
    'snapshotEvidenceSha256', 'createdAt',
  ], 'community_native_migration_intent_schema_invalid')
  if (
    input.schemaVersion !== 1 || input.instanceName !== state.instanceName ||
    input.installId !== state.installId || input.sourceFingerprint !== state.source.sourceFingerprint ||
    !RAW_SHA256.test(String(input.acceptedPlanSha256)) ||
    !RAW_SHA256.test(String(input.sourceMigrationStateFingerprintSha256)) ||
    !input.migrationPlan || typeof input.migrationPlan !== 'object' || Array.isArray(input.migrationPlan) ||
    input.migrationPlan.schemaVersion !== 1 || input.migrationPlan.action !== 'migrate' ||
    input.migrationPlan.sourceFingerprintSha256 !== input.sourceMigrationStateFingerprintSha256 ||
    createHash('sha256').update(JSON.stringify(input.migrationPlan)).digest('hex') !== input.acceptedPlanSha256 ||
    !['managed-verified-backup', 'external-snapshot-attestation', null]
      .includes(input.snapshotEvidenceKind) ||
    (input.snapshotEvidenceSha256 !== null && !RAW_SHA256.test(String(input.snapshotEvidenceSha256))) ||
    (input.snapshotEvidenceKind === null) !== (input.snapshotEvidenceSha256 === null) ||
    Number.isNaN(Date.parse(String(input.createdAt)))
  ) throw new Error('community_native_migration_intent_schema_invalid')
  return input as CommunityNativeMigrationIntentV1
}

export function readCommunityNativeMigrationIntent(
  paths: CommunityNativePaths,
  state: CommunityNativeInstallState,
): CommunityNativeMigrationIntentV1 | null {
  assertCommunityNativePathLayout(paths, { requireInstanceRoot: true })
  if (!existsSync(paths.migrationIntentPath)) return null
  return parseCommunityNativeMigrationIntentV1(
    readJson(paths.migrationIntentPath, 'community_native_migration_intent_json_invalid'),
    state,
  )
}

function writeCommunityNativeMigrationIntent(params: {
  paths: CommunityNativePaths
  state: CommunityNativeInstallState
  context: CommunityStrictMigrationPlanAcceptedContextV1
  now: () => Date
}): CommunityNativeMigrationIntentV1 {
  const intent: CommunityNativeMigrationIntentV1 = {
    schemaVersion: 1,
    instanceName: params.state.instanceName,
    installId: params.state.installId,
    sourceFingerprint: params.state.source.sourceFingerprint,
    acceptedPlanSha256: params.context.acceptedPlanSha256,
    sourceMigrationStateFingerprintSha256: params.context.sourceFingerprintSha256,
    migrationPlan: params.context.migrationPlan,
    snapshotEvidenceKind: params.context.snapshotEvidenceKind,
    snapshotEvidenceSha256: params.context.snapshotEvidenceSha256,
    createdAt: params.now().toISOString(),
  }
  const existing = readCommunityNativeMigrationIntent(params.paths, params.state)
  if (existing) {
    const comparable = (value: CommunityNativeMigrationIntentV1) => ({ ...value, createdAt: null })
    if (JSON.stringify(comparable(existing)) !== JSON.stringify(comparable(intent))) {
      throw new Error('community_native_migration_intent_conflict')
    }
    return existing
  }
  atomicJsonWrite(params.paths.migrationIntentPath, intent)
  return intent
}

function assertCommunityNativeMigrationPlanAcceptanceHistoryV1(
  value: unknown,
): CommunityNativeMigrationPlanAcceptanceHistoryV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community_native_migration_history_receipt_invalid')
  }
  const input = value as Record<string, any>
  exactKeys(input, [
    'schemaVersion', 'status', 'instanceName', 'installId', 'policyId',
    'acceptedPlanSha256', 'action', 'sourceMigrationStateFingerprintSha256',
    'targetLineageId', 'resultLineageId', 'resultSchemaFingerprintSha256',
    'resultReceiptFingerprintSha256', 'resultMigrationStateFingerprintSha256',
    'snapshotEvidenceKind', 'snapshotEvidenceSha256', 'acceptedAt',
  ], 'community_native_migration_history_receipt_schema_invalid')
  if (input.schemaVersion !== 1 || input.status !== 'community-native-migration-plan-acceptance' ||
      !INSTANCE_NAME.test(String(input.instanceName)) || !UUID.test(String(input.installId)) ||
      typeof input.policyId !== 'string' ||
      input.policyId.length < 1 || !RAW_SHA256.test(String(input.acceptedPlanSha256)) ||
      !['migrate', 'verify-only'].includes(input.action) ||
      !RAW_SHA256.test(String(input.sourceMigrationStateFingerprintSha256)) ||
      typeof input.targetLineageId !== 'string' || input.targetLineageId.length < 1 ||
      typeof input.resultLineageId !== 'string' || input.resultLineageId.length < 1 ||
      !RAW_SHA256.test(String(input.resultSchemaFingerprintSha256)) ||
      !RAW_SHA256.test(String(input.resultReceiptFingerprintSha256)) ||
      !RAW_SHA256.test(String(input.resultMigrationStateFingerprintSha256)) ||
      !['managed-verified-backup', 'external-snapshot-attestation', null]
        .includes(input.snapshotEvidenceKind) ||
      (input.snapshotEvidenceSha256 !== null && !RAW_SHA256.test(String(input.snapshotEvidenceSha256))) ||
      (input.snapshotEvidenceKind === null) !== (input.snapshotEvidenceSha256 === null) ||
      Number.isNaN(Date.parse(String(input.acceptedAt)))) {
    throw new Error('community_native_migration_history_receipt_schema_invalid')
  }
  return input as CommunityNativeMigrationPlanAcceptanceHistoryV1
}

function migrationAcceptanceHistories(
  receipt: CommunityNativeMigrationReceiptV1,
): CommunityNativeMigrationPlanAcceptanceHistoryV1[] {
  const common = {
    schemaVersion: 1 as const,
    status: 'community-native-migration-plan-acceptance' as const,
    instanceName: receipt.instanceName,
    installId: receipt.installId,
    policyId: receipt.policyId,
    targetLineageId: receipt.targetLineageId,
    resultLineageId: receipt.resultLineageId,
    resultSchemaFingerprintSha256: receipt.resultSchemaFingerprintSha256,
    resultReceiptFingerprintSha256: receipt.resultReceiptFingerprintSha256,
  }
  const current = assertCommunityNativeMigrationPlanAcceptanceHistoryV1({
    ...common,
    acceptedPlanSha256: receipt.acceptedPlanSha256,
    action: receipt.durableAcceptanceAction,
    sourceMigrationStateFingerprintSha256: receipt.sourceMigrationStateFingerprintSha256,
    resultMigrationStateFingerprintSha256: receipt.resultMigrationStateFingerprintSha256,
    snapshotEvidenceKind: receipt.snapshotEvidenceKind,
    snapshotEvidenceSha256: receipt.snapshotEvidenceSha256,
    acceptedAt: receipt.durableAcceptanceAt,
  })
  if (receipt.latestAppliedPlanSha256 === null) return [current]
  const latest = assertCommunityNativeMigrationPlanAcceptanceHistoryV1({
    ...common,
    acceptedPlanSha256: receipt.latestAppliedPlanSha256,
    action: 'migrate',
    sourceMigrationStateFingerprintSha256:
      receipt.latestAppliedSourceMigrationStateFingerprintSha256,
    resultMigrationStateFingerprintSha256:
      receipt.latestAppliedResultStateFingerprintSha256,
    snapshotEvidenceKind: receipt.latestAppliedEvidenceKind,
    snapshotEvidenceSha256: receipt.latestAppliedEvidenceSha256,
    acceptedAt: receipt.latestAppliedAt,
  })
  return current.acceptedPlanSha256 === latest.acceptedPlanSha256 ? [current] : [current, latest]
}

function migrationReceiptReconcilesIntent(
  receipt: CommunityNativeMigrationReceiptV1,
  intent: CommunityNativeMigrationIntentV1,
): boolean {
  const currentAcceptanceMatches = receipt.action === 'migrate' &&
    receipt.acceptedPlanSha256 === intent.acceptedPlanSha256 &&
    receipt.sourceMigrationStateFingerprintSha256 === intent.sourceMigrationStateFingerprintSha256 &&
    receipt.snapshotEvidenceKind === intent.snapshotEvidenceKind &&
    receipt.snapshotEvidenceSha256 === intent.snapshotEvidenceSha256
  const recoveredAcceptanceMatches = receipt.recoveredAppliedPlanSha256 === intent.acceptedPlanSha256 &&
    receipt.latestAppliedPlanSha256 === intent.acceptedPlanSha256 &&
    receipt.latestAppliedSourceMigrationStateFingerprintSha256 ===
      intent.sourceMigrationStateFingerprintSha256 &&
    receipt.latestAppliedEvidenceKind === intent.snapshotEvidenceKind &&
    receipt.latestAppliedEvidenceSha256 === intent.snapshotEvidenceSha256
  return currentAcceptanceMatches || recoveredAcceptanceMatches
}

function persistCommunityNativeMigrationReceipt(params: {
  paths: CommunityNativePaths
  state: CommunityNativeInstallState
  receipt: CommunityNativeMigrationReceiptV1
}): void {
  const receiptRootExisted = existsSync(params.paths.migrationReceiptRoot)
  mkdirSync(params.paths.migrationReceiptRoot, { recursive: true, mode: 0o700 })
  if (!receiptRootExisted) fsyncDirectoryBestEffortOnWindows(path.dirname(params.paths.migrationReceiptRoot))
  assertPlainCanonicalDirectory(
    params.paths.migrationReceiptRoot,
    'community_native_migration_receipt_root_unsafe',
  )
  const intent = readCommunityNativeMigrationIntent(params.paths, params.state)
  if (intent && !migrationReceiptReconcilesIntent(params.receipt, intent)) {
    throw new Error('community_native_migration_intent_not_reconciled')
  }
  for (const history of migrationAcceptanceHistories(params.receipt)) {
    const historyPath = path.join(params.paths.migrationReceiptRoot, `${history.acceptedPlanSha256}.json`)
    if (existsSync(historyPath)) {
      assertPlainCanonicalFile(
        historyPath,
        params.paths.migrationReceiptRoot,
        'community_native_migration_history_receipt_unsafe',
      )
      const existing = assertCommunityNativeMigrationPlanAcceptanceHistoryV1(
        readJson(historyPath, 'community_native_migration_history_receipt_json_invalid'),
      )
      if (JSON.stringify(existing) !== JSON.stringify(history)) {
        throw new Error('community_native_migration_history_receipt_conflict')
      }
    } else {
      atomicJsonWrite(historyPath, history)
    }
  }
  atomicJsonWrite(params.paths.migrationReceiptPath, params.receipt)
  if (intent) rmSync(params.paths.migrationIntentPath, { force: true })
}

export function inspectCommunityNativeInstall(input: { instanceName?: string; dataRoot?: string } = {}): CommunityNativeInspection {
  const paths = resolveCommunityNativePaths(input)
  const candidates = [
    paths.statePath,
    paths.processPath,
    paths.identityPath,
    paths.controlPath,
    paths.secretPath,
    paths.migrationReceiptPath,
    paths.migrationIntentPath,
  ]
  try {
    assertCommunityNativePathLayout(paths)
  } catch (error) {
    return {
      status: 'partial',
      paths,
      error: error instanceof Error ? error.message : 'community_native_path_layout_invalid',
      presentFiles: [],
      missingFiles: candidates,
    }
  }
  const presentFiles = candidates.filter(existsSync)
  const missingFiles = candidates.filter((entry) => !existsSync(entry))
  if (existsSync(paths.ociStatePath) && existsSync(paths.statePath)) {
    return { status: 'runtime-conflict', paths, error: 'community_instance_runtime_conflict', presentFiles, missingFiles }
  }
  if (!existsSync(paths.statePath)) {
    if (presentFiles.length === 0) return { status: 'not-installed', paths, presentFiles, missingFiles }
    return { status: 'partial', paths, error: 'community_native_state_missing', presentFiles, missingFiles }
  }
  if (!existsSync(paths.secretPath)) {
    return { status: 'partial', paths, error: 'community_native_secret_file_missing', presentFiles, missingFiles }
  }
  try {
    readNativeSecret(paths)
    const state = readCommunityNativeState(paths)
    return {
      status: 'installed',
      paths,
      state,
      process: readCommunityNativeProcess(paths),
      migration: readCommunityNativeMigrationReceipt(paths, state) ?? undefined,
      presentFiles,
      missingFiles,
    }
  } catch (error) {
    return {
      status: 'partial',
      paths,
      error: error instanceof Error ? error.message : 'community_native_state_invalid',
      presentFiles,
      missingFiles,
    }
  }
}

function sourcePackage(root: string): Record<string, any> {
  const packagePath = safeRegularFile(root, 'package.json')
  try {
    return JSON.parse(readFileSync(packagePath, 'utf8')) as Record<string, any>
  } catch {
    throw new Error('community_native_source_package_json_invalid')
  }
}

function sourceLayout(root: string, manifest = sourcePackage(root)): CommunityNativeSourceLayout {
  if (
    manifest.name === PUBLIC_ROOT_NAME && manifest.private === true &&
    typeof manifest.version === 'string' && RELEASE_VERSION.test(manifest.version) &&
    typeof manifest.packageManager === 'string' && PUBLIC_PACKAGE_MANAGER.test(manifest.packageManager)
  ) {
    return {
      kind: 'checkout',
      requiredSourcePaths: CHECKOUT_REQUIRED_SOURCE_PATHS,
      lockfilePath: 'pnpm-lock.yaml',
      buildPaths: CHECKOUT_BUILD_PATHS,
    }
  }
  if (
    manifest.name === PUBLIC_SERVER_PACKAGE_NAME && manifest.private !== true &&
    typeof manifest.version === 'string' && RELEASE_VERSION.test(manifest.version) &&
    typeof manifest.packageManager === 'string' && PUBLIC_PACKAGE_MANAGER.test(manifest.packageManager)
  ) {
    const markerPath = safeRegularFile(root, 'aops-server-runtime.json')
    let marker: Record<string, unknown>
    try {
      marker = JSON.parse(readFileSync(markerPath, 'utf8')) as Record<string, unknown>
    } catch {
      throw new Error('community_native_server_package_marker_invalid')
    }
    if (
      marker.schemaVersion !== 1 || marker.kind !== 'aops-server-npm-runtime' ||
      marker.packageName !== manifest.name || marker.packageVersion !== manifest.version ||
      marker.packageManager !== manifest.packageManager ||
      !marker.source || typeof marker.source !== 'object' ||
      Object.keys(marker.source).sort().join(',') !== 'commit,repository' ||
      (marker.source as Record<string, unknown>).repository !== 'https://github.com/eeemzs/aops-community' ||
      !/^[a-f0-9]{40}$/.test(String((marker.source as Record<string, unknown>).commit ?? '')) ||
      JSON.stringify(marker.source) !== JSON.stringify(manifest.aopsSource) ||
      Object.keys(marker).sort().join(',') !==
        'kind,packageManager,packageName,packageVersion,schemaVersion,source'
    ) throw new Error('community_native_server_package_marker_invalid')
    return {
      kind: 'npm-package',
      requiredSourcePaths: PACKAGE_REQUIRED_SOURCE_PATHS,
      lockfilePath: 'npm-shrinkwrap.json',
      buildPaths: PACKAGE_BUILD_PATHS,
    }
  }
  throw new Error('community_native_public_source_required')
}

function isPackagedCommunityServerSource(source: CommunityNativeSourceIdentity): boolean {
  return sourceLayout(source.root).kind === 'npm-package'
}

export function isCommunityNativeNpmPackageSource(sourceRoot: string): boolean {
  const resolved = path.resolve(sourceRoot)
  return sourceLayout(realpathSync(resolved)).kind === 'npm-package'
}

export function resolveCommunityNativeDefaultSourceRoot(
  fallbackRoot = process.cwd(),
  moduleUrl = import.meta.url,
): string {
  try {
    const require = createRequire(moduleUrl)
    const packageJsonPath = require.resolve(`${PUBLIC_SERVER_PACKAGE_NAME}/package.json`)
    const packageRoot = path.dirname(packageJsonPath)
    sourceLayout(packageRoot)
    return packageRoot
  } catch {
    return path.resolve(fallbackRoot)
  }
}

export function inspectCommunityNativeSource(sourceRoot = process.cwd()): CommunityNativeSourceIdentity {
  const resolved = path.resolve(sourceRoot)
  let rootStats: ReturnType<typeof lstatSync>
  try { rootStats = lstatSync(resolved) } catch { throw new Error('community_native_source_root_invalid') }
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) throw new Error('community_native_source_root_invalid')
  const root = realpathSync(resolved)
  const manifest = sourcePackage(root)
  const layout = sourceLayout(root, manifest)
  for (const relativePath of layout.requiredSourcePaths) safeRegularFile(root, relativePath)
  const packageSha256 = hashFile(path.join(root, 'package.json'))
  const lockfileSha256 = hashFile(path.join(root, layout.lockfilePath))
  const postgresProfileSha256 = hashFile(path.join(root, COMMUNITY_NATIVE_POSTGRES_CONTRACT_PATH))
  const sourceInventory = inventoryCommunityNativeTree(root, SOURCE_INVENTORY_EXCLUDED_DIRECTORIES)
  return {
    root,
    packageManager: manifest.packageManager,
    releaseVersion: manifest.version,
    packageSha256,
    lockfileSha256,
    sourceFileCount: sourceInventory.fileCount,
    sourceInventorySha256: sourceInventory.sha256,
    sourceFingerprint: sha256(JSON.stringify({
      root,
      packageManager: manifest.packageManager,
      releaseVersion: manifest.version,
      packageSha256,
      lockfileSha256,
      postgresProfileSha256,
      sourceFileCount: sourceInventory.fileCount,
      sourceInventorySha256: sourceInventory.sha256,
    })),
  }
}

function inspectCommunityNativeBuild(
  source: CommunityNativeSourceIdentity,
  completedAt: string,
  currentSource = inspectCommunityNativeSource(source.root),
): CommunityNativeBuildIdentity {
  if (
    currentSource.packageSha256 !== source.packageSha256 ||
    currentSource.lockfileSha256 !== source.lockfileSha256 ||
    currentSource.sourceFileCount !== source.sourceFileCount ||
    currentSource.sourceInventorySha256 !== source.sourceInventorySha256 ||
    currentSource.sourceFingerprint !== source.sourceFingerprint
  ) throw new Error('community_native_source_changed_during_build')
  const layout = sourceLayout(source.root)
  const hostEntry = safeRegularFile(source.root, layout.buildPaths.hostEntry)
  const handlerEntry = safeRegularFile(source.root, layout.buildPaths.handlerEntry)
  const cockpitIndex = safeRegularFile(source.root, layout.buildPaths.cockpitIndex)
  const hostEntrySha256 = hashFile(hostEntry)
  const handlerEntrySha256 = hashFile(handlerEntry)
  const cockpitIndexSha256 = hashFile(cockpitIndex)
  const runtimeInventory = inventoryCommunityNativeTree(source.root, RUNTIME_INVENTORY_EXCLUDED_DIRECTORIES)
  return {
    completedAt,
    hostEntry,
    handlerEntry,
    cockpitIndex,
    hostEntrySha256,
    handlerEntrySha256,
    cockpitIndexSha256,
    runtimeFileCount: runtimeInventory.fileCount,
    runtimeInventorySha256: runtimeInventory.sha256,
    buildFingerprint: sha256(JSON.stringify({
      sourceFingerprint: source.sourceFingerprint,
      hostEntrySha256,
      handlerEntrySha256,
      cockpitIndexSha256,
      runtimeFileCount: runtimeInventory.fileCount,
      runtimeInventorySha256: runtimeInventory.sha256,
    })),
  }
}

function assertCommunityNativeApplicationCurrent(state: CommunityNativeInstallState): void {
  const source = inspectCommunityNativeSource(state.source.root)
  const sourceFields: Array<keyof CommunityNativeSourceIdentity> = [
    'root', 'packageManager', 'releaseVersion', 'packageSha256', 'lockfileSha256',
    'sourceFileCount', 'sourceInventorySha256', 'sourceFingerprint',
  ]
  if (sourceFields.some((field) => source[field] !== state.source[field])) {
    throw new Error('community_native_prior_application_source_drift')
  }
  const build = inspectCommunityNativeBuild(state.source, state.build.completedAt, source)
  const buildFields: Array<keyof CommunityNativeBuildIdentity> = [
    'completedAt', 'hostEntry', 'handlerEntry', 'cockpitIndex', 'hostEntrySha256',
    'handlerEntrySha256', 'cockpitIndexSha256', 'runtimeFileCount',
    'runtimeInventorySha256', 'buildFingerprint',
  ]
  if (buildFields.some((field) => build[field] !== state.build[field])) {
    throw new Error('community_native_prior_application_build_drift')
  }
}

function pnpmPackageVersion(scriptPath: string): string | null {
  try {
    const packageJson = JSON.parse(readFileSync(path.resolve(path.dirname(scriptPath), '..', 'package.json'), 'utf8'))
    return packageJson.name === 'pnpm' && typeof packageJson.version === 'string' ? packageJson.version : null
  } catch {
    return null
  }
}

function pnpmScriptCandidates(env: NodeJS.ProcessEnv): string[] {
  const candidates: string[] = []
  if (env.npm_execpath) candidates.push(path.resolve(env.npm_execpath))
  const roots = [env.PNPM_HOME, ...(String(env.PATH ?? '').split(path.delimiter))]
    .filter((entry): entry is string => Boolean(entry?.trim()))
  for (const root of roots) {
    const resolved = path.resolve(root)
    const packageRoots = [
      path.join(resolved, 'node_modules', 'pnpm'),
      path.resolve(resolved, '..', 'lib', 'node_modules', 'pnpm'),
    ]
    // pnpm/action-setup exports PNPM_HOME as its node_modules/.bin directory.
    if (path.basename(resolved).toLowerCase() === '.bin') {
      packageRoots.push(path.resolve(resolved, '..', 'pnpm'))
    }
    for (const packageRoot of packageRoots) {
      candidates.push(
        path.join(packageRoot, 'bin', 'pnpm.mjs'),
        path.join(packageRoot, 'bin', 'pnpm.cjs'),
      )
    }
    if (process.platform !== 'win32') {
      for (const name of ['pnpm', 'pnpm.cjs', 'pnpm.mjs']) {
        const executable = path.join(resolved, name)
        try { candidates.push(realpathSync(executable)) } catch { /* continue */ }
      }
    }
  }
  return [...new Set(candidates)]
}

export function buildCommunityPnpmInvocation(
  cwd: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): CommunityNativeBuildInvocation {
  for (const candidate of pnpmScriptCandidates(env)) {
    if (!existsSync(candidate) || !lstatSync(candidate).isFile()) continue
    const version = pnpmPackageVersion(candidate)
    if (!version?.startsWith('11.')) continue
    return { command: process.execPath, args: [candidate, ...args], cwd }
  }
  throw new Error('community_pnpm11_not_resolvable:run_via_pnpm_11_or_set_PNPM_HOME')
}

function isLoopbackHost(value: string): boolean {
  const host = value.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host === '::1') return true
  const match = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  return Boolean(match && match.slice(1).every((octet) => Number(octet) <= 255))
}

export function loadExternalPostgresUrl(configRef: string, tlsPolicy: CommunityPostgresTlsPolicy): string {
  const resolved = path.resolve(configRef)
  let stats: ReturnType<typeof lstatSync>
  try { stats = lstatSync(resolved) } catch { throw new Error('community_native_postgres_config_file_invalid') }
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.size > MAX_CONFIG_BYTES) {
    throw new Error('community_native_postgres_config_file_invalid')
  }
  let parsed: ReturnType<typeof parseEnv>
  try {
    parsed = parseEnv(readFileSync(resolved, 'utf8'))
  } catch {
    throw new Error('community_native_postgres_config_parse_failed')
  }
  const value = String(parsed.AOPS_PG_URL ?? '').trim()
  let url: URL
  try { url = new URL(value) } catch { throw new Error('community_native_postgres_url_invalid') }
  if (
    (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
    !url.hostname || !url.username || !url.password || !url.pathname.slice(1)
  ) throw new Error('community_native_postgres_url_invalid')
  if (url.search || url.hash) throw new Error('community_native_postgres_url_options_refused')

  const rootCertInput = String(parsed.AOPS_PG_SSL_ROOT_CERT ?? '').trim()
  if (tlsPolicy === 'disable') {
    if (!isLoopbackHost(url.hostname)) throw new Error('community_native_remote_postgres_tls_required')
    if (rootCertInput) throw new Error('community_native_postgres_tls_root_cert_not_allowed')
    url.searchParams.set('sslmode', 'disable')
    return url.toString()
  }

  if (tlsPolicy === 'require') {
    if (rootCertInput) throw new Error('community_native_postgres_tls_root_cert_requires_verify_full')
    url.searchParams.set('sslmode', 'require')
    url.searchParams.set('uselibpqcompat', 'true')
    return url.toString()
  }

  if (tlsPolicy !== 'verify-full') throw new Error('community_native_postgres_tls_policy_invalid')
  url.searchParams.set('sslmode', 'verify-full')
  if (rootCertInput) {
    if (path.isAbsolute(rootCertInput)) {
      throw new Error('community_native_postgres_tls_root_cert_invalid')
    }
    const rootCertPath = path.resolve(path.dirname(resolved), rootCertInput)
    if (!isWithin(path.dirname(resolved), rootCertPath)) {
      throw new Error('community_native_postgres_tls_root_cert_invalid')
    }
    let rootCertStats: ReturnType<typeof lstatSync>
    try { rootCertStats = lstatSync(rootCertPath) } catch {
      throw new Error('community_native_postgres_tls_root_cert_invalid')
    }
    if (
      !rootCertStats.isFile() || rootCertStats.isSymbolicLink() ||
      rootCertStats.size < 1 || rootCertStats.size > MAX_TLS_ROOT_CERT_BYTES
    ) throw new Error('community_native_postgres_tls_root_cert_invalid')
    const realRootCertPath = realpathSync(rootCertPath)
    if (!isWithin(realpathSync(path.dirname(resolved)), realRootCertPath)) {
      throw new Error('community_native_postgres_tls_root_cert_invalid')
    }
    url.searchParams.set('sslrootcert', realRootCertPath)
  }
  return url.toString()
}

type CommunityNativeInstalledMigrationPlanningContext = Readonly<{
  paths: CommunityNativePaths
  state: CommunityNativeInstallState
  planning: CommunityStrictMigrationPlanningResultV1
  policy: CommunityStrictMigrationPolicyV1
}>

async function resolveInstalledMigrationPlanningContext(
  input: { instanceName?: string; dataRoot?: string; signal?: AbortSignal },
  dependencies: CommunityNativeMigrationPlanningDependencies = {},
): Promise<CommunityNativeInstalledMigrationPlanningContext> {
  throwIfNativeAborted(input.signal)
  const inspection = inspectCommunityNativeInstall(input)
  if (inspection.status !== 'installed' || !inspection.state) {
    throw new Error(`community_native_migration_plan_requires_install:${inspection.status}:${inspection.error ?? 'run_server_setup'}`)
  }
  assertCommunityNativePathLayout(inspection.paths, { requireInstanceRoot: true })
  const sourceBefore = inspectCommunityNativeSource(inspection.state.source.root)
  if (sourceBefore.sourceFingerprint !== inspection.state.source.sourceFingerprint) {
    throw new Error('community_native_source_drift:run_server_setup_--apply')
  }
  const postgres = inspection.state.postgres
  const repoUrl = postgres.mode === 'external'
    ? loadExternalPostgresUrl(postgres.configRef, postgres.tlsPolicy)
    : (() => {
        assertCommunityNativePostgresInstanceState({
          state: postgres,
          instanceName: inspection.state!.instanceName,
          instanceRoot: inspection.paths.instanceRoot,
        })
        return buildCommunityNativePostgresUrl(postgres)
      })()
  const result = await (dependencies.planMigration ?? planCommunityNativeMigration)({
    sourceRoot: inspection.state.source.root,
    repoUrl,
    signal: input.signal,
  })
  throwIfNativeAborted(input.signal)
  const sourceAfter = inspectCommunityNativeSource(inspection.state.source.root)
  if (sourceAfter.sourceFingerprint !== inspection.state.source.sourceFingerprint ||
      sourceAfter.sourceFingerprint !== sourceBefore.sourceFingerprint) {
    throw new Error('community_native_source_drift_during_migration_plan')
  }
  return {
    paths: inspection.paths,
    state: inspection.state,
    planning: result.planning,
    policy: result.policy,
  }
}

export async function planCommunityNativeInstalledMigration(
  input: { instanceName?: string; dataRoot?: string; signal?: AbortSignal } = {},
  dependencies: CommunityNativeMigrationPlanningDependencies = {},
): Promise<CommunityNativeInstalledMigrationPlanV1> {
  const context = await resolveInstalledMigrationPlanningContext(input, dependencies)
  return {
    schemaVersion: 1,
    instanceName: context.state.instanceName,
    profile: context.state.profile,
    evidencePath: context.planning.requiresSnapshotEvidence
      ? path.join(
          context.paths.migrationEvidenceRoot,
          `${context.state.profile === 'native-external-postgres' ? 'external' : 'managed'}-${context.planning.acceptedPlanSha256}.json`,
        )
      : null,
    planning: context.planning,
  }
}

export async function attestCommunityNativeExternalSnapshot(params: {
  instanceName?: string
  dataRoot?: string
  expectedPlanSha256: string
  provider: string
  snapshotRef: string
  snapshotDigest?: string
  attestedBy: string
  restoreInstructionsRef: string
  preview?: boolean
  apply?: boolean
  confirmExternalRecoveryOwner?: boolean
  signal?: AbortSignal
}, dependencies: CommunityNativeMigrationPlanningDependencies = {}):
Promise<CommunityNativeExternalSnapshotAttestationResultV1> {
  if (!RAW_SHA256.test(params.expectedPlanSha256)) {
    throw new Error('community_external_snapshot_expected_plan_sha256_invalid')
  }
  if (params.preview === true && params.apply === true) {
    throw new Error('community_external_snapshot_mode_conflict:choose_--preview_or_--apply')
  }
  if (params.preview !== true && params.apply !== true) {
    throw new Error('community_external_snapshot_mode_required:use_--preview_or_--apply')
  }
  if (params.apply === true && params.confirmExternalRecoveryOwner !== true) {
    throw new Error('community_external_snapshot_recovery_owner_confirmation_required')
  }
  const context = await resolveInstalledMigrationPlanningContext(params, dependencies)
  if (context.state.profile !== 'native-external-postgres') {
    throw new Error('community_external_snapshot_attestation_requires_external_postgres')
  }
  if (context.planning.acceptedPlanSha256 !== params.expectedPlanSha256) {
    throw new Error(
      `community_external_snapshot_plan_mismatch:expected=${params.expectedPlanSha256}:actual=${context.planning.acceptedPlanSha256}`,
    )
  }
  const evidencePath = path.join(
    context.paths.migrationEvidenceRoot,
    `external-${context.planning.acceptedPlanSha256}.json`,
  )
  const createdAt = (dependencies.now ?? (() => new Date()))()
  const evidenceParams = {
    planning: context.planning,
    policy: context.policy,
    provider: params.provider,
    snapshotRef: params.snapshotRef,
    snapshotDigest: params.snapshotDigest ?? null,
    attestedBy: params.attestedBy,
    restoreInstructionsRef: params.restoreInstructionsRef,
    now: () => createdAt,
  }
  const evidence = params.apply === true
    ? (dependencies.writeExternalAttestation ?? writeCommunityExternalSnapshotAttestationV1)({
        ...evidenceParams,
        evidenceRoot: context.paths.migrationEvidenceRoot,
      }).evidence
    : createCommunityExternalSnapshotAttestationV1(evidenceParams)
  return {
    schemaVersion: 1,
    instanceName: context.state.instanceName,
    profile: context.state.profile,
    applied: params.apply === true,
    evidencePath,
    evidence,
  }
}

function childEnvironment(params: {
  state: CommunityNativeInstallState
  paths: CommunityNativePaths
  launchId: string
  startedAt: string
  postgresUrl: string
  chatv3ServerKeySecret: string
  env?: NodeJS.ProcessEnv
}): NodeJS.ProcessEnv {
  const env = { ...(params.env ?? process.env) }
  for (const key of Object.keys(env)) {
    const upper = key.toUpperCase()
    if (
      /^PG[A-Z0-9_]+$/i.test(key) ||
      /(?:^|_)(?:AUTH|COOKIE|DATABASE|ENCRYPT|JWT|PASSWORD|PG|POSTGRES|REPO|SECRET|SESSION|SQLITE|TOKEN)(?:_|$)/i.test(key) ||
      /^(?:AOPS|PROJECTMAN|DOCMAN|AGENTSPACE|CHATV3|AUTHV2|KANBAN|SPRINT|TASKER|FILEMAN|SYS)_/i.test(key) ||
      /_(?:REPO|PG|SQLITE)_URL$/i.test(key) ||
      /^NODE_/i.test(key) || /^DYLD_/i.test(key) ||
      ['DATABASE_URL', 'DEV_PG_URL', 'HOST', 'PORT', 'ORIGIN', 'LD_PRELOAD', 'LD_LIBRARY_PATH',
        'SSLKEYLOGFILE', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
        'ADDRESS_HEADER', 'XFF_DEPTH', 'PROTOCOL_HEADER', 'HOST_HEADER'].includes(upper)
    ) delete env[key]
  }
  return {
    ...env,
    NODE_ENV: 'production',
    AOPS_DB_BOOTSTRAP_MODE: 'explicit',
    AOPS_PG_URL: params.postgresUrl,
    AOPS_RELEASE_VERSION: params.state.source.releaseVersion,
    CHATV3_SERVER_KEY_ID: 'k1',
    CHATV3_SERVER_KEY_SECRET: params.chatv3ServerKeySecret,
    AOPS_NATIVE_LAUNCH_ID: params.launchId,
    AOPS_NATIVE_STARTED_AT: params.startedAt,
    AOPS_NATIVE_SOURCE_FINGERPRINT: params.state.source.sourceFingerprint,
    AOPS_NATIVE_HOST_ENTRY: params.state.build.hostEntry,
    AOPS_NATIVE_IDENTITY_PATH: params.paths.identityPath,
    AOPS_NATIVE_CONTROL_PATH: params.paths.controlPath,
    AOPS_NATIVE_PORT: String(params.state.server.port),
    COMMUNITY_PORT: String(params.state.server.port),
  }
}

function readNativeSecret(paths: CommunityNativePaths): string {
  try {
    const stats = lstatSync(paths.secretPath)
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.size > 4_096) {
      throw new Error('invalid')
    }
  } catch {
    throw new Error('community_native_secret_file_invalid')
  }
  let parsed: ReturnType<typeof parseEnv>
  try { parsed = parseEnv(readFileSync(paths.secretPath, 'utf8')) } catch {
    throw new Error('community_native_secret_file_invalid')
  }
  const secret = String(parsed.CHATV3_SERVER_KEY_SECRET ?? '').trim()
  if (
    parsed.CHATV3_SERVER_KEY_ID !== 'k1' || !/^[A-Za-z0-9_-]{32,}$/.test(secret) ||
    Object.keys(parsed).some((key) => !['CHATV3_SERVER_KEY_ID', 'CHATV3_SERVER_KEY_SECRET'].includes(key))
  ) throw new Error('community_native_secret_file_invalid')
  return secret
}

function ensureNativeSecret(paths: CommunityNativePaths, createSecret: () => string): string {
  if (existsSync(paths.secretPath)) return readNativeSecret(paths)
  const secret = createSecret()
  if (!/^[A-Za-z0-9_-]{32,}$/.test(secret)) throw new Error('community_native_generated_secret_invalid')
  mkdirSync(path.dirname(paths.secretPath), { recursive: true, mode: 0o700 })
  writeFileSync(
    paths.secretPath,
    `CHATV3_SERVER_KEY_ID=k1\nCHATV3_SERVER_KEY_SECRET=${secret}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  )
  return secret
}

function parseChildIdentity(paths: CommunityNativePaths, processRecord: CommunityNativeProcessRecord): CommunityNativeChildIdentity {
  const value = readJson(paths.identityPath, 'community_native_child_identity_json_invalid')
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('community_native_child_identity_invalid')
  exactKeys(value as Record<string, unknown>, [
    'schemaVersion', 'protocol', 'launchId', 'pid', 'hostPid', 'startedAt',
    'sourceFingerprint', 'hostEntry', 'controlPath', 'port',
  ], 'community_native_child_identity_schema_invalid')
  const identity = value as CommunityNativeChildIdentity
  if (
    identity.schemaVersion !== 1 || identity.protocol !== COMMUNITY_NATIVE_CHILD_PROTOCOL ||
    identity.launchId !== processRecord.launchId || identity.pid !== processRecord.pid ||
    !Number.isSafeInteger(identity.hostPid) || identity.hostPid < 1 ||
    identity.startedAt !== processRecord.startedAt || identity.sourceFingerprint !== processRecord.sourceFingerprint ||
    path.resolve(identity.controlPath) !== path.resolve(paths.controlPath) ||
    path.resolve(processRecord.controlPath) !== path.resolve(paths.controlPath)
  ) throw new Error('community_native_child_identity_mismatch')
  return identity
}

async function waitUntilReady(params: {
  paths: CommunityNativePaths
  state: CommunityNativeInstallState
  processRecord: CommunityNativeProcessRecord
  handle: CommunityNativeChildHandle
  runtime: CommunityNativeRuntime
  timeoutMs: number
  signal?: AbortSignal
}): Promise<CommunityNativeChildIdentity> {
  const deadline = Date.now() + params.timeoutMs
  const childState: { exit?: CommunityNativeExit; failure?: unknown } = {}
  void params.handle.wait.then((value) => { childState.exit = value }, (error) => { childState.failure = error })
  try {
    while (Date.now() < deadline) {
      throwIfNativeAborted(params.signal)
      if (childState.failure) throw new Error('community_native_child_launch_failed')
      if (childState.exit) {
        throw new Error(
          `community_native_child_exited_before_ready:${childState.exit.exitCode ?? 'signal'}:${childState.exit.signal ?? 'none'}`,
        )
      }
      if (existsSync(params.paths.identityPath)) {
        try {
          const identity = parseChildIdentity(params.paths, params.processRecord)
          if (
            identity.hostEntry !== params.state.build.hostEntry || identity.port !== params.state.server.port ||
            identity.sourceFingerprint !== params.state.source.sourceFingerprint
          ) throw new Error('community_native_child_identity_mismatch')
          const healthy = await params.runtime.health(
            `http://127.0.0.1:${params.state.server.port}/api/health`,
            params.signal,
          )
          throwIfNativeAborted(params.signal)
          if (healthy) return identity
        } catch (error) {
          if (params.signal?.aborted) throw new Error('community_operation_aborted')
          if (error instanceof Error && /identity_mismatch/.test(error.message)) throw error
        }
      }
      await params.runtime.sleep(READY_POLL_MS, params.signal)
      throwIfNativeAborted(params.signal)
    }
    throw new Error('community_native_child_ready_timeout')
  } catch (error) {
    await params.handle.terminate()
    throw error
  }
}

function writeProcess(paths: CommunityNativePaths, record: CommunityNativeProcessRecord): void {
  assertCommunityNativePathLayout(paths, { requireInstanceRoot: true })
  atomicJsonWrite(paths.processPath, record)
}

function childEntryPath(): string {
  return fileURLToPath(new URL('./community-native-child.js', import.meta.url))
}

function defaultRunBuild(invocation: CommunityNativeBuildInvocation): Promise<CommunityNativeExit> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: 'inherit',
      signal: invocation.signal,
    })
    child.once('error', reject)
    child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }))
  })
}

async function defaultSpawnChild(params: {
  childEntry: string
  cwd: string
  env: NodeJS.ProcessEnv
  mode: CommunityNativeLaunchMode
  logPath: string
}): Promise<CommunityNativeChildHandle> {
  mkdirSync(path.dirname(params.logPath), { recursive: true, mode: 0o700 })
  const logRootStats = lstatSync(path.dirname(params.logPath))
  if (!logRootStats.isDirectory() || logRootStats.isSymbolicLink()) {
    throw new Error('community_native_log_root_invalid')
  }
  if (existsSync(params.logPath)) {
    const logStats = lstatSync(params.logPath)
    if (!logStats.isFile() || logStats.isSymbolicLink()) throw new Error('community_native_log_file_invalid')
  }
  let logFd: number | undefined
  if (params.mode === 'detached') logFd = openSync(params.logPath, 'a', 0o600)
  const child = spawn(process.execPath, [params.childEntry], {
    cwd: params.cwd,
    env: params.env,
    detached: params.mode === 'detached',
    windowsHide: params.mode === 'detached',
    stdio: params.mode === 'foreground' ? 'inherit' : ['ignore', logFd!, logFd!],
  })
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve)
      child.once('error', reject)
    })
  } finally {
    if (logFd !== undefined) closeSync(logFd)
  }
  if (!child.pid) throw new Error('community_native_child_pid_missing')
  const wait = new Promise<CommunityNativeExit>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }))
  })
  let termination: Promise<void> | undefined
  return {
    pid: child.pid,
    wait,
    detach: () => child.unref(),
    terminate: () => {
      termination ??= (async () => {
        if (child.exitCode !== null || child.signalCode !== null) return
        try { child.kill('SIGTERM') } catch { /* already exited */ }
        let forceTimer: NodeJS.Timeout | undefined
        await Promise.race([
          wait.then(() => undefined),
          new Promise<void>((resolve) => {
            forceTimer = setTimeout(() => {
              if (child.exitCode === null && child.signalCode === null) {
                try { child.kill('SIGKILL') } catch { /* already exited */ }
              }
              resolve()
            }, 5_000)
          }),
        ])
        if (forceTimer) clearTimeout(forceTimer)
        await wait.then(() => undefined)
      })()
      return termination
    },
  }
}

export const communityNativeRuntime: CommunityNativeRuntime = {
  runBuild: defaultRunBuild,
  migrate: runCommunityNativeMigration,
  spawnChild: defaultSpawnChild,
  async health(url, signal) {
    try {
      const timeout = AbortSignal.timeout(2_000)
      const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
      return response.ok
    } catch {
      if (signal?.aborted) throw new Error('community_operation_aborted')
      return false
    }
  },
  processExists(pid) {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EPERM')
    }
  },
  sleep: (milliseconds, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('community_operation_aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(new Error('community_operation_aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  }),
}

function parseControlRequest(paths: CommunityNativePaths): CommunityNativeControlRequest {
  const value = readJson(paths.controlPath, 'community_native_control_json_invalid')
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('community_native_control_invalid')
  exactKeys(value as Record<string, unknown>, [
    'schemaVersion', 'protocol', 'launchId', 'command', 'requestedAt',
  ], 'community_native_control_schema_invalid')
  const request = value as CommunityNativeControlRequest
  if (
    request.schemaVersion !== 1 || request.protocol !== COMMUNITY_NATIVE_CONTROL_PROTOCOL ||
    !UUID.test(request.launchId) || request.command !== 'stop' ||
    Number.isNaN(Date.parse(request.requestedAt))
  ) throw new Error('community_native_control_schema_invalid')
  return request
}

function removeControlIfExact(paths: CommunityNativePaths, launchId: string): void {
  if (!existsSync(paths.controlPath)) return
  const request = parseControlRequest(paths)
  if (request.launchId !== launchId) throw new Error('community_native_control_launch_mismatch')
  rmSync(paths.controlPath, { force: true })
}

async function observeInstalledNative(params: {
  paths: CommunityNativePaths
  state: CommunityNativeInstallState
  processRecord: CommunityNativeProcessRecord | null
  runtime: CommunityNativeRuntime
  now: () => Date
}): Promise<CommunityNativeRuntimeStatus> {
  const record = params.processRecord
  const identityPresent = existsSync(params.paths.identityPath)
  if (!record) {
    return {
      runtimeState: identityPresent ? 'identity-conflict' : 'stopped',
      recoverable: !identityPresent,
      process: null,
      identity: null,
      supervisorAlive: false,
      hostAlive: false,
      health: 'not-checked',
      reason: identityPresent ? 'community_native_identity_without_process_record' : null,
    }
  }

  const supervisorAlive = params.runtime.processExists(record.pid)
  let identity: CommunityNativeChildIdentity | null = null
  if (identityPresent) {
    try {
      identity = parseChildIdentity(params.paths, record)
    } catch (error) {
      return {
        runtimeState: 'identity-conflict',
        recoverable: false,
        process: record,
        identity: null,
        supervisorAlive,
        hostAlive: record.hostPid ? params.runtime.processExists(record.hostPid) : false,
        health: 'not-checked',
        reason: error instanceof Error ? error.message : 'community_native_child_identity_invalid',
      }
    }
  }
  const hostPid = identity?.hostPid ?? record.hostPid
  const hostAlive = hostPid ? params.runtime.processExists(hostPid) : false
  const activeRecord = record.status === 'starting' || record.status === 'running'
  if (
    !activeRecord && !identityPresent && !supervisorAlive && !hostAlive &&
    record.instanceName === params.state.instanceName
  ) {
    return {
      runtimeState: 'stopped', recoverable: true, process: record, identity: null,
      supervisorAlive: false, hostAlive: false, health: 'not-checked', reason: null,
    }
  }
  if (
    record.instanceName !== params.state.instanceName ||
    record.sourceFingerprint !== params.state.source.sourceFingerprint ||
    (identity && (
      identity.sourceFingerprint !== params.state.source.sourceFingerprint ||
      !samePhysicalPath(identity.hostEntry, params.state.build.hostEntry) ||
      identity.port !== params.state.server.port
    ))
  ) {
    return {
      runtimeState: 'identity-conflict', recoverable: false, process: record, identity,
      supervisorAlive, hostAlive, health: 'not-checked',
      reason: 'community_native_process_state_identity_mismatch',
    }
  }

  if (!activeRecord) {
    if (!identityPresent && !supervisorAlive && !hostAlive) {
      return {
        runtimeState: 'stopped', recoverable: true, process: record, identity: null,
        supervisorAlive: false, hostAlive: false, health: 'not-checked', reason: null,
      }
    }
    if (identity && !supervisorAlive && !hostAlive) {
      return {
        runtimeState: 'stopped', recoverable: true, process: record, identity,
        supervisorAlive: false, hostAlive: false, health: 'not-checked',
        reason: 'community_native_terminal_identity_stale',
      }
    }
    return {
      runtimeState: 'identity-conflict', recoverable: false, process: record, identity,
      supervisorAlive, hostAlive, health: 'not-checked',
      reason: 'community_native_terminal_record_with_live_or_unowned_process',
    }
  }

  if (!identity) {
    if (!supervisorAlive && !hostAlive) {
      return {
        runtimeState: 'crashed', recoverable: true, process: record, identity: null,
        supervisorAlive: false, hostAlive: false, health: 'not-checked',
        reason: 'community_native_process_disappeared_without_identity',
      }
    }
    return {
      runtimeState: 'identity-conflict', recoverable: false, process: record, identity: null,
      supervisorAlive, hostAlive, health: 'not-checked',
      reason: 'community_native_live_process_without_matching_identity',
    }
  }

  if (!supervisorAlive && !hostAlive) {
    return {
      runtimeState: 'crashed', recoverable: true, process: record, identity,
      supervisorAlive: false, hostAlive: false, health: 'not-checked',
      reason: 'community_native_process_disappeared',
    }
  }
  if (!supervisorAlive && hostAlive) {
    return {
      runtimeState: 'orphaned', recoverable: false, process: record, identity,
      supervisorAlive, hostAlive, health: 'not-checked', reason: 'community_native_host_orphaned',
    }
  }
  if (supervisorAlive && !hostAlive) {
    return {
      runtimeState: 'unhealthy', recoverable: false, process: record, identity,
      supervisorAlive, hostAlive, health: 'unhealthy', reason: 'community_native_host_process_missing',
    }
  }
  const healthy = await params.runtime.health(`http://127.0.0.1:${params.state.server.port}/api/health`)
  if (record.status === 'starting') {
    return {
      runtimeState: 'starting', recoverable: false, process: record, identity,
      supervisorAlive, hostAlive, health: healthy ? 'healthy' : 'unhealthy', reason: null,
    }
  }
  return {
    runtimeState: healthy ? 'running' : 'unhealthy', recoverable: false, process: record, identity,
    supervisorAlive, hostAlive, health: healthy ? 'healthy' : 'unhealthy',
    reason: healthy ? null : 'community_native_health_failed',
  }
}

export async function inspectCommunityNativeRuntime(params: {
  instanceName?: string
  dataRoot?: string
  runtime?: CommunityNativeRuntime
  now?: () => Date
} = {}): Promise<CommunityNativeRuntimeStatus> {
  const inspection = inspectCommunityNativeInstall({ instanceName: params.instanceName, dataRoot: params.dataRoot })
  if (inspection.status !== 'installed' || !inspection.state) {
    throw new Error(`community_native_not_installed:${inspection.status}:${inspection.error ?? 'run_server_setup'}`)
  }
  return observeInstalledNative({
    paths: inspection.paths,
    state: inspection.state,
    processRecord: inspection.process ?? null,
    runtime: params.runtime ?? communityNativeRuntime,
    now: params.now ?? (() => new Date()),
  })
}

function writeStopRequest(paths: CommunityNativePaths, launchId: string, now: () => Date): void {
  if (existsSync(paths.controlPath)) {
    const existing = parseControlRequest(paths)
    if (existing.launchId === launchId) return
    throw new Error('community_native_control_launch_mismatch')
  }
  atomicJsonWrite(paths.controlPath, {
    schemaVersion: 1,
    protocol: COMMUNITY_NATIVE_CONTROL_PROTOCOL,
    launchId,
    command: 'stop',
    requestedAt: now().toISOString(),
  } satisfies CommunityNativeControlRequest)
}

export async function stopCommunityNativeInstall(params: {
  instanceName?: string
  dataRoot?: string
  runtime?: CommunityNativeRuntime
  postgresRuntime?: CommunityNativePostgresRuntime
  now?: () => Date
  timeoutMs?: number
  signal?: AbortSignal
} = {}): Promise<{ status: 'stopped' | 'already-stopped'; state: CommunityNativeInstallState; process: CommunityNativeProcessRecord | null }> {
  throwIfNativeAborted(params.signal)
  const inspection = inspectCommunityNativeInstall({ instanceName: params.instanceName, dataRoot: params.dataRoot })
  if (inspection.status !== 'installed' || !inspection.state) {
    throw new Error(`community_native_not_installed:${inspection.status}:${inspection.error ?? 'run_server_setup'}`)
  }
  const runtime = params.runtime ?? communityNativeRuntime
  const now = params.now ?? (() => new Date())
  const observed = await observeInstalledNative({
    paths: inspection.paths,
    state: inspection.state,
    processRecord: inspection.process ?? null,
    runtime,
    now,
  })
  if (observed.runtimeState === 'stopped' || observed.runtimeState === 'crashed') {
    if (inspection.state.postgres.mode === 'container') {
      await stopCommunityNativePostgres({
        state: inspection.state.postgres,
        instanceName: inspection.state.instanceName,
        instanceRoot: inspection.paths.instanceRoot,
        runtime: params.postgresRuntime,
        signal: params.signal,
      })
    }
    return { status: 'already-stopped', state: inspection.state, process: observed.process }
  }
  if (
    !observed.process || !observed.identity || !observed.supervisorAlive ||
    !['starting', 'running', 'unhealthy'].includes(observed.runtimeState)
  ) {
    throw new Error(`community_native_stop_refused:${observed.runtimeState}:${observed.reason ?? 'identity_not_verified'}`)
  }
  writeStopRequest(inspection.paths, observed.process.launchId, now)
  const deadline = Date.now() + (params.timeoutMs ?? DEFAULT_STOP_TIMEOUT_MS)
  while (Date.now() < deadline) {
    throwIfNativeAborted(params.signal)
    if (existsSync(inspection.paths.identityPath)) parseChildIdentity(inspection.paths, observed.process)
    const supervisorAlive = runtime.processExists(observed.process.pid)
    const hostAlive = runtime.processExists(observed.identity.hostPid)
    if (!supervisorAlive && !hostAlive && !existsSync(inspection.paths.identityPath)) {
      removeControlIfExact(inspection.paths, observed.process.launchId)
      const stopped: CommunityNativeProcessRecord = {
        ...observed.process,
        status: 'exited',
        updatedAt: now().toISOString(),
        exitCode: 0,
        signal: null,
      }
      delete stopped.failure
      writeProcess(inspection.paths, stopped)
      if (inspection.state.postgres.mode === 'container') {
        await stopCommunityNativePostgres({
          state: inspection.state.postgres,
          instanceName: inspection.state.instanceName,
          instanceRoot: inspection.paths.instanceRoot,
          runtime: params.postgresRuntime,
          signal: params.signal,
        })
      }
      return { status: 'stopped', state: inspection.state, process: stopped }
    }
    await runtime.sleep(READY_POLL_MS, params.signal)
    throwIfNativeAborted(params.signal)
  }
  throw new Error('community_native_stop_timeout:no_unverified_pid_kill')
}

function redactNativeLog(content: string, paths: CommunityNativePaths, state: CommunityNativeInstallState): string {
  const exactSecrets: string[] = []
  try { exactSecrets.push(readNativeSecret(paths)) } catch { /* invalid install is reported elsewhere */ }
  if (state.postgres.mode === 'external') {
    try {
      const parsed = parseEnv(readFileSync(state.postgres.configRef, 'utf8'))
      if (parsed.AOPS_PG_URL) {
        const rawUrl = String(parsed.AOPS_PG_URL)
        exactSecrets.push(rawUrl)
        try {
          const url = new URL(rawUrl)
          if (url.password) {
            exactSecrets.push(url.password)
            try { exactSecrets.push(decodeURIComponent(url.password)) } catch { /* malformed encoding is rejected at setup */ }
          }
        } catch { /* invalid install is reported elsewhere */ }
      }
    } catch { /* redact by shape below */ }
  } else {
    try {
      const rawUrl = buildCommunityNativePostgresUrl(state.postgres)
      exactSecrets.push(rawUrl)
      const url = new URL(rawUrl)
      if (url.password) {
        exactSecrets.push(url.password)
        try { exactSecrets.push(decodeURIComponent(url.password)) } catch { /* validated by the adapter */ }
      }
    } catch { /* invalid install is reported elsewhere */ }
  }
  let redacted = content
  for (const secret of exactSecrets
    .filter((value) => value.length >= MIN_EXACT_SECRET_REDACTION_LENGTH)
    .sort((left, right) => right.length - left.length)) {
    redacted = redacted.split(secret).join('[REDACTED]')
  }
  return redacted
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, 'postgresql://[REDACTED]')
    .replace(/(CHATV3_SERVER_KEY_SECRET\s*[=:]\s*)[^\s]+/gi, '$1[REDACTED]')
    .replace(/((?:password|pwd)\s*[=:]\s*)[^;\s]+/gi, '$1[REDACTED]')
}

export function readCommunityNativeLogs(params: {
  instanceName?: string
  dataRoot?: string
  tail?: number
} = {}): CommunityNativeLogTail {
  const inspection = inspectCommunityNativeInstall({ instanceName: params.instanceName, dataRoot: params.dataRoot })
  if (inspection.status !== 'installed' || !inspection.state) {
    throw new Error(`community_native_not_installed:${inspection.status}:${inspection.error ?? 'run_server_setup'}`)
  }
  const tail = params.tail ?? 100
  if (!Number.isSafeInteger(tail) || tail < 1 || tail > 10_000) throw new Error('community_logs_tail_invalid')
  if (!existsSync(inspection.paths.logPath)) {
    return { content: '', lineCount: 0, truncated: false, logPath: inspection.paths.logPath }
  }
  const stats = lstatSync(inspection.paths.logPath)
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('community_native_log_file_invalid')
  const realLog = realpathSync(inspection.paths.logPath)
  if (!isWithin(realpathSync(inspection.paths.instanceRoot), realLog)) throw new Error('community_native_log_path_escape')
  const byteLength = Math.min(stats.size, MAX_LOG_TAIL_BYTES)
  const start = stats.size - byteLength
  const buffer = Buffer.alloc(byteLength)
  const fd = openSync(realLog, 'r')
  try {
    if (byteLength > 0) readSync(fd, buffer, 0, byteLength, start)
  } finally {
    closeSync(fd)
  }
  let content = buffer.toString('utf8')
  let truncated = start > 0
  if (truncated) {
    const firstNewline = content.indexOf('\n')
    content = firstNewline >= 0 ? content.slice(firstNewline + 1) : ''
  }
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  const selected = lines.slice(-tail)
  truncated ||= selected.length < lines.length
  const safe = redactNativeLog(selected.join('\n'), inspection.paths, inspection.state)
  return { content: safe, lineCount: selected.length, truncated, logPath: inspection.paths.logPath }
}

async function runBuildChecked(runtime: CommunityNativeRuntime, invocation: CommunityNativeBuildInvocation, step: string): Promise<void> {
  throwIfNativeAborted(invocation.signal)
  let result: CommunityNativeExit
  try {
    result = await runtime.runBuild(invocation)
  } catch (error) {
    if (invocation.signal?.aborted) throw new Error('community_operation_aborted')
    throw error
  }
  throwIfNativeAborted(invocation.signal)
  if (result.exitCode !== 0) throw new Error(`community_native_${step}_failed:${result.exitCode ?? result.signal ?? 'unknown'}`)
}

export function resolveCommunityNativeLaunchMode(input: { foreground?: boolean; detach?: boolean }): CommunityNativeLaunchMode {
  if (input.foreground === true && input.detach === true) throw new Error('community_native_launch_mode_conflict')
  return input.foreground === true ? 'foreground' : 'detached'
}

async function launchInstalledNative(params: {
  paths: CommunityNativePaths
  state: CommunityNativeInstallState
  mode: CommunityNativeLaunchMode
  runtime: CommunityNativeRuntime
  postgresRuntime?: CommunityNativePostgresRuntime
  now: () => Date
  createId: () => string
  readyTimeoutMs: number
  env?: NodeJS.ProcessEnv
  requiredMigrationPlanSha256?: string
  requiredMigrationAction?: 'verify-only'
  signal?: AbortSignal
}): Promise<CommunityNativeLaunch> {
  throwIfNativeAborted(params.signal)
  assertCommunityNativePathLayout(params.paths, { requireInstanceRoot: true })
  const priorProcess = readCommunityNativeProcess(params.paths)
  const observed = await observeInstalledNative({
    paths: params.paths,
    state: params.state,
    processRecord: priorProcess,
    runtime: params.runtime,
    now: params.now,
  })
  if (observed.runtimeState !== 'stopped' && observed.runtimeState !== 'crashed') {
    throw new Error(`community_native_process_active:${observed.runtimeState}:${observed.reason ?? 'run_server_status'}`)
  }
  const currentSource = inspectCommunityNativeSource(params.state.source.root)
  if (currentSource.sourceFingerprint !== params.state.source.sourceFingerprint) {
    throw new Error('community_native_source_drift:run_server_setup_--apply')
  }
  const currentBuild = inspectCommunityNativeBuild(
    params.state.source,
    params.state.build.completedAt,
    currentSource,
  )
  if (currentBuild.buildFingerprint !== params.state.build.buildFingerprint) {
    throw new Error('community_native_build_drift:run_server_setup_--apply')
  }
  const buildFields: Array<keyof CommunityNativeBuildIdentity> = [
    'completedAt', 'hostEntry', 'handlerEntry', 'cockpitIndex', 'hostEntrySha256',
    'handlerEntrySha256', 'cockpitIndexSha256', 'runtimeFileCount',
    'runtimeInventorySha256', 'buildFingerprint',
  ]
  if (buildFields.some((field) => currentBuild[field] !== params.state.build[field])) {
    throw new Error('community_native_build_identity_drift:run_server_setup_--apply')
  }
  const postgres = params.state.postgres
  const postgresUrl = postgres.mode === 'external'
    ? loadExternalPostgresUrl(postgres.configRef, postgres.tlsPolicy)
    : await (async () => {
        await startCommunityNativePostgres({
          state: postgres,
          instanceName: params.state.instanceName,
          instanceRoot: params.paths.instanceRoot,
          runtime: params.postgresRuntime,
          signal: params.signal,
        })
        return buildCommunityNativePostgresUrl(postgres)
      })()
  throwIfNativeAborted(params.signal)
  const priorIntent = readCommunityNativeMigrationIntent(params.paths, params.state)
  const migration = assertCommunityNativeMigrationReceiptV1(await params.runtime.migrate({
    sourceRoot: params.state.source.root,
    repoUrl: postgresUrl,
    instanceName: params.state.instanceName,
    installId: params.state.installId,
    sourceFingerprint: params.state.source.sourceFingerprint,
    priorIntentExpectation: priorIntent ? {
      acceptedPlanSha256: priorIntent.acceptedPlanSha256,
      sourceMigrationStateFingerprintSha256: priorIntent.sourceMigrationStateFingerprintSha256,
      snapshotEvidenceKind: priorIntent.snapshotEvidenceKind,
      snapshotEvidenceSha256: priorIntent.snapshotEvidenceSha256,
    } : null,
    requiredPlanSha256: params.requiredMigrationPlanSha256,
    requiredAction: params.requiredMigrationAction,
    snapshotEvidenceProvider: async ({ planning, policy, sourceRoot, signal }) => {
      if (!planning.requiresSnapshotEvidence) return null
      if (postgres.mode === 'external') {
        const evidencePath = path.join(
          params.paths.migrationEvidenceRoot,
          `external-${planning.acceptedPlanSha256}.json`,
        )
        if (!existsSync(evidencePath)) {
          throw new Error(
            `community_native_external_snapshot_attestation_required:plan=${planning.acceptedPlanSha256}`,
          )
        }
        return { path: evidencePath, policy: 'managed-or-external-attested-v1' }
      }
      const evidencePath = path.join(
        params.paths.migrationEvidenceRoot,
        `managed-${planning.acceptedPlanSha256}.json`,
      )
      if (existsSync(evidencePath)) {
        return { path: evidencePath, policy: 'managed-verified-only-v1' }
      }
      const snapshot = await createCommunityNativeManagedSnapshotV1({
        planning,
        policy,
        sourceRoot,
        state: postgres,
        instanceName: params.state.instanceName,
        instanceRoot: params.paths.instanceRoot,
        backupRoot: params.paths.backupRoot,
        evidenceRoot: params.paths.migrationEvidenceRoot,
        runtime: params.postgresRuntime,
        now: params.now,
        signal,
      })
      return { path: snapshot.evidencePath, policy: 'managed-verified-only-v1' }
    },
    onPlanAccepted: (context) => {
      writeCommunityNativeMigrationIntent({
        paths: params.paths,
        state: params.state,
        context,
        now: params.now,
      })
    },
    signal: params.signal,
  }))
  throwIfNativeAborted(params.signal)
  if (
    migration.instanceName !== params.state.instanceName ||
    migration.installId !== params.state.installId ||
    migration.sourceFingerprint !== params.state.source.sourceFingerprint
  ) {
    throw new Error('community_native_migration_receipt_identity_mismatch')
  }
  const sourceAfterMigration = inspectCommunityNativeSource(params.state.source.root)
  if (sourceAfterMigration.sourceFingerprint !== params.state.source.sourceFingerprint) {
    throw new Error('community_native_source_drift_during_migration:run_server_setup_--apply')
  }
  const buildAfterMigration = inspectCommunityNativeBuild(
    params.state.source,
    params.state.build.completedAt,
    sourceAfterMigration,
  )
  if (
    buildAfterMigration.buildFingerprint !== params.state.build.buildFingerprint ||
    buildFields.some((field) => buildAfterMigration[field] !== params.state.build[field])
  ) {
    throw new Error('community_native_build_drift_during_migration:run_server_setup_--apply')
  }
  persistCommunityNativeMigrationReceipt({ paths: params.paths, state: params.state, receipt: migration })
  const chatv3ServerKeySecret = readNativeSecret(params.paths)
  throwIfNativeAborted(params.signal)
  rmSync(params.paths.identityPath, { force: true })
  rmSync(params.paths.controlPath, { force: true })
  mkdirSync(params.paths.logRoot, { recursive: true, mode: 0o700 })
  const launchId = params.createId()
  const startedAt = params.now().toISOString()
  const handle = await params.runtime.spawnChild({
    childEntry: childEntryPath(),
    cwd: params.state.source.root,
    env: childEnvironment({
      state: params.state,
      paths: params.paths,
      launchId,
      startedAt,
      postgresUrl,
      chatv3ServerKeySecret,
      env: params.env,
    }),
    mode: params.mode,
    logPath: params.paths.logPath,
  })
  if (params.signal?.aborted) {
    await handle.terminate()
    throw new Error('community_operation_aborted')
  }
  let processRecord: CommunityNativeProcessRecord = {
    schemaVersion: 1,
    protocol: COMMUNITY_NATIVE_CHILD_PROTOCOL,
    instanceName: params.state.instanceName,
    launchId,
    pid: handle.pid,
    mode: params.mode,
    status: 'starting',
    startedAt,
    updatedAt: startedAt,
    sourceFingerprint: params.state.source.sourceFingerprint,
    identityPath: params.paths.identityPath,
    controlPath: params.paths.controlPath,
    logPath: params.mode === 'detached' ? params.paths.logPath : null,
  }
  writeProcess(params.paths, processRecord)
  try {
    const identity = await waitUntilReady({
      paths: params.paths,
      state: params.state,
      processRecord,
      handle,
      runtime: params.runtime,
      timeoutMs: params.readyTimeoutMs,
      signal: params.signal,
    })
    processRecord = { ...processRecord, hostPid: identity.hostPid }
  } catch (error) {
    processRecord = {
      ...processRecord,
      status: 'failed',
      updatedAt: params.now().toISOString(),
      failure: error instanceof Error ? error.message.slice(0, 300) : 'community_native_child_launch_failed',
    }
    writeProcess(params.paths, processRecord)
    throw error
  }
  processRecord = { ...processRecord, status: 'running', updatedAt: params.now().toISOString() }
  writeProcess(params.paths, processRecord)
  if (params.mode === 'detached') {
    handle.detach()
    return { paths: params.paths, state: params.state, process: processRecord, migration, mode: params.mode }
  }
  return {
    paths: params.paths,
    state: params.state,
    process: processRecord,
    migration,
    mode: params.mode,
    waitForExit: async () => {
      let aborted = params.signal?.aborted === true
      let onAbort: (() => void) | undefined
      let exit: CommunityNativeExit
      if (params.signal && !aborted) {
        const outcome = await Promise.race([
          handle.wait.then((value) => ({ kind: 'exit' as const, value })),
          new Promise<{ kind: 'abort' }>((resolve) => {
            onAbort = () => resolve({ kind: 'abort' })
            params.signal!.addEventListener('abort', onAbort, { once: true })
          }),
        ])
        if (onAbort) params.signal.removeEventListener('abort', onAbort)
        if (outcome.kind === 'abort') {
          aborted = true
          await handle.terminate()
          exit = await handle.wait
        } else {
          exit = outcome.value
        }
      } else if (aborted) {
        await handle.terminate()
        exit = await handle.wait
      } else {
        exit = await handle.wait
      }
      writeProcess(params.paths, {
        ...processRecord,
        status: !aborted && exit.exitCode === 0 ? 'exited' : 'failed',
        updatedAt: params.now().toISOString(),
        exitCode: exit.exitCode,
        signal: exit.signal,
        ...(!aborted && exit.exitCode === 0
          ? {}
          : { failure: aborted ? 'community_operation_aborted' : `community_native_child_exit:${exit.exitCode ?? exit.signal ?? 'unknown'}` }),
      })
      if (aborted) throw new Error('community_operation_aborted')
      if (exit.exitCode !== 0) throw new Error(`community_native_child_failed:${exit.exitCode ?? exit.signal ?? 'unknown'}`)
      return exit
    },
  }
}

export async function setupCommunityNativeInstall(params: {
  contract: CommunityInstanceContract
  sourceRoot?: string
  dataRoot?: string
  mode?: CommunityNativeLaunchMode
  runtime?: CommunityNativeRuntime
  postgresRuntime?: CommunityNativePostgresRuntime
  now?: () => Date
  createId?: () => string
  createSecret?: () => string
  createPostgresSecret?: () => string
  requireApplicationUpdate?: boolean
  readyTimeoutMs?: number
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
}): Promise<{
  status: 'created' | 'refreshed'
  paths: CommunityNativePaths
  state: CommunityNativeInstallState
  launch: CommunityNativeLaunch
  applicationUpdate: CommunityNativeApplicationUpdateRecordV1 | null
}> {
  if (params.contract.runtime !== 'native') throw new Error('community_native_contract_required')
  if (
    params.contract.profile !== 'native-external-postgres' &&
    params.contract.profile !== 'native-container-postgres'
  ) throw new Error('community_native_postgres_contract_required')
  const runtime = params.runtime ?? communityNativeRuntime
  throwIfNativeAborted(params.signal)
  const now = params.now ?? (() => new Date())
  const createId = params.createId ?? randomUUID
  const paths = resolveCommunityNativePaths({ instanceName: params.contract.instanceId, dataRoot: params.dataRoot })
  assertCommunityNativePathLayout(paths)
  mkdirSync(paths.instanceRoot, { recursive: true, mode: 0o700 })
  assertCommunityNativePathLayout(paths, { requireInstanceRoot: true })
  if (existsSync(paths.ociStatePath)) throw new Error('community_instance_runtime_conflict:oci_already_installed')
  const inspection = inspectCommunityNativeInstall({ instanceName: params.contract.instanceId, dataRoot: params.dataRoot })
  if (inspection.status === 'partial' || inspection.status === 'runtime-conflict') {
    throw new Error(`community_native_install_${inspection.status}:${inspection.error ?? 'unknown'}:run_doctor`)
  }
  if (inspection.status === 'installed' && inspection.state) {
    const observed = await observeInstalledNative({
      paths: inspection.paths,
      state: inspection.state,
      processRecord: inspection.process ?? null,
      runtime,
      now,
    })
    if (observed.runtimeState !== 'stopped' && observed.runtimeState !== 'crashed') {
      throw new Error(`community_native_process_active:${observed.runtimeState}:run_server_status_before_setup`)
    }
    assertCommunityNativeApplicationCurrent(inspection.state)
  }
  const source = inspectCommunityNativeSource(
    params.sourceRoot ?? resolveCommunityNativeDefaultSourceRoot(),
  )
  let configRef: string | undefined
  if (params.contract.profile === 'native-external-postgres') {
    if (
      params.contract.postgres.mode !== 'external' || !params.contract.postgres.configRef ||
      !params.contract.postgres.tlsPolicy
    ) throw new Error('community_native_external_postgres_contract_required')
    const configInput = path.resolve(params.contract.postgres.configRef)
    loadExternalPostgresUrl(configInput, params.contract.postgres.tlsPolicy)
    configRef = realpathSync(configInput)
  } else if (params.contract.postgres.mode !== 'container') {
    throw new Error('community_native_container_postgres_contract_required')
  }
  if (!isPackagedCommunityServerSource(source)) {
    await runBuildChecked(
      runtime,
      { ...buildCommunityPnpmInvocation(source.root, ['install', '--frozen-lockfile'], params.env), signal: params.signal },
      'install',
    )
    await runBuildChecked(
      runtime,
      { ...buildCommunityPnpmInvocation(source.root, ['run', 'build'], params.env), signal: params.signal },
      'build',
    )
  }
  throwIfNativeAborted(params.signal)
  const updatedAt = now().toISOString()
  const build = inspectCommunityNativeBuild(source, updatedAt)
  const existing = inspection.status === 'installed' ? inspection.state : undefined
  if (existing && existing.instanceName !== params.contract.instanceId) throw new Error('community_native_instance_mismatch')
  if (existing && existing.profile !== params.contract.profile) {
    throw new Error(`community_native_profile_change_refused:${existing.profile}:to:${params.contract.profile}:run_server_reset`)
  }
  mkdirSync(paths.runtimeRoot, { recursive: true, mode: 0o700 })
  const baseState: CommunityNativeInstallStateBase = {
    schemaVersion: 1,
    runtime: 'native',
    instanceName: params.contract.instanceId,
    installId: existing?.installId ?? createId(),
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
    source,
    build,
    server: { host: '127.0.0.1', port: params.contract.server.port },
  }
  const state: CommunityNativeInstallState = params.contract.profile === 'native-external-postgres'
    ? {
        ...baseState,
        profile: 'native-external-postgres',
        postgres: {
          mode: 'external',
          configRef: configRef!,
          tlsPolicy: params.contract.postgres.tlsPolicy!,
        },
      }
    : {
        ...baseState,
        profile: 'native-container-postgres',
        postgres: await setupCommunityNativePostgres({
          sourceRoot: source.root,
          instanceRoot: paths.instanceRoot,
          runtimeRoot: paths.runtimeRoot,
          instanceName: params.contract.instanceId,
          runtime: params.postgresRuntime,
          createSecret: params.createPostgresSecret,
          readyTimeoutMs: params.readyTimeoutMs,
          signal: params.signal,
        }),
      }
  ensureNativeSecret(paths, params.createSecret ?? (() => randomBytes(32).toString('base64url')))
  let applicationUpdatePrepared: CommunityNativeApplicationUpdatePreparedV1 | null = null
  if (existing) {
    const priorReference = createCommunityNativeApplicationReferenceV1(existing)
    const targetReference = createCommunityNativeApplicationReferenceV1(state)
    if (!sameCommunityNativeApplicationContent(priorReference, targetReference)) {
      if (samePhysicalPath(existing.source.root, state.source.root)) {
        throw new Error('community_native_application_update_distinct_source_root_required')
      }
      applicationUpdatePrepared = writeCommunityNativeApplicationUpdatePrepared({
        paths,
        updateId: createId(),
        prior: existing,
        target: state,
        now,
      })
    }
  }
  if (params.requireApplicationUpdate === true && !applicationUpdatePrepared) {
    throw new Error(existing
      ? 'community_native_application_update_content_unchanged'
      : 'community_native_application_update_requires_existing_install')
  }
  let launch: CommunityNativeLaunch | undefined
  try {
    atomicJsonWrite(paths.statePath, state)
    throwIfNativeAborted(params.signal)
    launch = await launchInstalledNative({
      paths,
      state,
      mode: params.mode ?? 'detached',
      runtime,
      postgresRuntime: params.postgresRuntime,
      now,
      createId,
      readyTimeoutMs: params.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
      env: params.env,
      signal: params.signal,
    })
    if (applicationUpdatePrepared) {
      writeCommunityNativeApplicationUpdateOutcome({
        paths,
        updateId: applicationUpdatePrepared.updateId,
        receipt: launch.migration,
        now,
      })
    }
  } catch (error) {
    if (applicationUpdatePrepared) {
      let succeededOutcomeDurable = false
      try {
        succeededOutcomeDurable = readCommunityNativeApplicationUpdate(paths, applicationUpdatePrepared.updateId)
          .outcome?.status === 'community-native-application-update-succeeded'
      } catch {}
      if (!succeededOutcomeDurable) {
        writeCommunityNativeApplicationUpdateOutcome({
          paths,
          updateId: applicationUpdatePrepared.updateId,
          receipt: launch?.migration,
          error,
          now,
        })
      }
    }
    throw error
  }
  if (!launch) throw new Error('community_native_application_launch_missing')
  return {
    status: existing ? 'refreshed' : 'created',
    paths,
    state,
    launch,
    applicationUpdate: applicationUpdatePrepared
      ? readCommunityNativeApplicationUpdate(paths, applicationUpdatePrepared.updateId)
      : null,
  }
}

export async function rollbackCommunityNativeApplication(params: {
  instanceName?: string
  dataRoot?: string
  updateId: string
  sourceRoot: string
  mode?: CommunityNativeLaunchMode
  runtime?: CommunityNativeRuntime
  postgresRuntime?: CommunityNativePostgresRuntime
  now?: () => Date
  createId?: () => string
  planMigration?: typeof planCommunityNativeMigration
  readyTimeoutMs?: number
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
}): Promise<{
  paths: CommunityNativePaths
  state: CommunityNativeInstallState
  launch: CommunityNativeLaunch
  applicationUpdate: CommunityNativeApplicationUpdateRecordV1
}> {
  throwIfNativeAborted(params.signal)
  const runtime = params.runtime ?? communityNativeRuntime
  const now = params.now ?? (() => new Date())
  const createId = params.createId ?? randomUUID
  const inspection = inspectCommunityNativeInstall({ instanceName: params.instanceName, dataRoot: params.dataRoot })
  if (inspection.status !== 'installed' || !inspection.state) {
    throw new Error(`community_native_not_installed:${inspection.status}:${inspection.error ?? 'run_server_setup'}`)
  }
  assertCommunityNativeApplicationCurrent(inspection.state)
  const observed = await observeInstalledNative({
    paths: inspection.paths,
    state: inspection.state,
    processRecord: inspection.process ?? null,
    runtime,
    now,
  })
  if (observed.runtimeState !== 'stopped' && observed.runtimeState !== 'crashed') {
    throw new Error(`community_native_process_active:${observed.runtimeState}:run_server_stop_before_rollback`)
  }
  const update = readCommunityNativeApplicationUpdate(inspection.paths, params.updateId)
  if (update.prepared.instanceName !== inspection.state.instanceName ||
      update.prepared.installId !== inspection.state.installId) {
    throw new Error('community_native_application_update_instance_mismatch')
  }
  if (update.rollbackPrepared || update.rollbackOutcome) {
    throw new Error('community_native_application_rollback_already_recorded')
  }
  const activeReference = createCommunityNativeApplicationReferenceV1(inspection.state)
  if (!sameCommunityNativeApplicationContent(activeReference, update.prepared.target)) {
    throw new Error('community_native_application_update_target_not_active')
  }
  const source = inspectCommunityNativeSource(params.sourceRoot)
  if (!isPackagedCommunityServerSource(source)) {
    await runBuildChecked(
      runtime,
      { ...buildCommunityPnpmInvocation(source.root, ['install', '--frozen-lockfile'], params.env), signal: params.signal },
      'rollback_install',
    )
    await runBuildChecked(
      runtime,
      { ...buildCommunityPnpmInvocation(source.root, ['run', 'build'], params.env), signal: params.signal },
      'rollback_build',
    )
  }
  throwIfNativeAborted(params.signal)
  const updatedAt = now().toISOString()
  const build = inspectCommunityNativeBuild(source, updatedAt)
  const candidateState: CommunityNativeInstallState = inspection.state.profile === 'native-external-postgres'
    ? {
        ...inspection.state,
        updatedAt,
        source,
        build,
      }
    : {
        ...inspection.state,
        updatedAt,
        source,
        build,
      }
  const candidateReference = createCommunityNativeApplicationReferenceV1(candidateState)
  if (!sameCommunityNativeApplicationContent(candidateReference, update.prepared.prior)) {
    throw new Error('community_native_application_rollback_source_content_mismatch')
  }
  const postgresUrl = candidateState.profile === 'native-external-postgres'
    ? loadExternalPostgresUrl(candidateState.postgres.configRef, candidateState.postgres.tlsPolicy)
    : await (async () => {
        await startCommunityNativePostgres({
          state: candidateState.postgres,
          instanceName: candidateState.instanceName,
          instanceRoot: inspection.paths.instanceRoot,
          runtime: params.postgresRuntime,
          signal: params.signal,
        })
        return buildCommunityNativePostgresUrl(candidateState.postgres)
      })()
  const databasePlan = await (params.planMigration ?? planCommunityNativeMigration)({
    sourceRoot: candidateState.source.root,
    repoUrl: postgresUrl,
    signal: params.signal,
  })
  throwIfNativeAborted(params.signal)
  if (databasePlan.planning.migrationPlan.action !== 'verify-only') {
    throw new Error(
      `community_native_database_restore_required:update=${params.updateId}:action=${databasePlan.planning.migrationPlan.action}`,
    )
  }
  const rollbackId = createId()
  writeCommunityNativeApplicationRollbackPrepared({
    paths: inspection.paths,
    updateId: params.updateId,
    rollbackId,
    candidate: candidateReference,
    databasePlan: {
      action: 'verify-only',
      acceptedPlanSha256: databasePlan.planning.acceptedPlanSha256,
      sourceMigrationStateFingerprintSha256: databasePlan.planning.sourceFingerprintSha256,
      stateFingerprintSha256: databasePlan.planning.stateFingerprintSha256,
    },
    now,
  })
  let launch: CommunityNativeLaunch | undefined
  try {
    atomicJsonWrite(inspection.paths.statePath, candidateState)
    launch = await launchInstalledNative({
      paths: inspection.paths,
      state: candidateState,
      mode: params.mode ?? 'detached',
      runtime,
      postgresRuntime: params.postgresRuntime,
      now,
      createId,
      readyTimeoutMs: params.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
      env: params.env,
      requiredMigrationPlanSha256: databasePlan.planning.acceptedPlanSha256,
      requiredMigrationAction: 'verify-only',
      signal: params.signal,
    })
    writeCommunityNativeApplicationRollbackOutcome({
      paths: inspection.paths,
      updateId: params.updateId,
      rollbackId,
      receipt: launch.migration,
      now,
    })
  } catch (error) {
    let succeededOutcomeDurable = false
    try {
      succeededOutcomeDurable = readCommunityNativeApplicationUpdate(inspection.paths, params.updateId)
        .rollbackOutcome?.status === 'community-native-application-rolled-back'
    } catch {}
    if (!succeededOutcomeDurable) {
      writeCommunityNativeApplicationRollbackOutcome({
        paths: inspection.paths,
        updateId: params.updateId,
        rollbackId,
        receipt: launch?.migration,
        error,
        now,
      })
    }
    throw error
  }
  if (!launch) throw new Error('community_native_application_rollback_launch_missing')
  return {
    paths: inspection.paths,
    state: candidateState,
    launch,
    applicationUpdate: readCommunityNativeApplicationUpdate(inspection.paths, params.updateId),
  }
}

export async function startCommunityNativeInstall(params: {
  instanceName?: string
  dataRoot?: string
  mode?: CommunityNativeLaunchMode
  runtime?: CommunityNativeRuntime
  postgresRuntime?: CommunityNativePostgresRuntime
  now?: () => Date
  createId?: () => string
  readyTimeoutMs?: number
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
}): Promise<CommunityNativeLaunch> {
  const inspection = inspectCommunityNativeInstall({ instanceName: params.instanceName, dataRoot: params.dataRoot })
  if (inspection.status !== 'installed' || !inspection.state) {
    throw new Error(`community_native_not_installed:${inspection.status}:${inspection.error ?? 'run_server_setup'}`)
  }
  return launchInstalledNative({
    paths: inspection.paths,
    state: inspection.state,
    mode: params.mode ?? 'detached',
    runtime: params.runtime ?? communityNativeRuntime,
    postgresRuntime: params.postgresRuntime,
    now: params.now ?? (() => new Date()),
    createId: params.createId ?? randomUUID,
    readyTimeoutMs: params.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
    env: params.env,
    signal: params.signal,
  })
}
