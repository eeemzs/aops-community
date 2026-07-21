import { createHash, randomBytes } from 'node:crypto'
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeSync,
} from 'node:fs'
import path from 'node:path'

import { Client } from 'pg'

const STATEMENT_BREAKPOINT = '--> statement-breakpoint'
const STRICT_RECEIPT_TABLE = 'aops_community_migration_receipts_v1'
const STRICT_STATE_TABLE = 'aops_community_migration_state_v1'
const STRICT_AUDIT_SCHEMA = 'aops_community_meta'
const STRICT_PLAN_ACCEPTANCE_TABLE = 'migration_plan_acceptances_v1'
const DATABASE_PREFIX_LINEAGE_ID = 'database-prefix-v1'
const MAX_SNAPSHOT_EVIDENCE_BYTES = 262_144
const SNAPSHOT_HASH_BUFFER_BYTES = 1024 * 1024
const RAW_SHA256 = /^[a-f0-9]{64}$/
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/
const SAFE_ID = /^[a-z][a-z0-9-]*$/
const SAFE_TAG = /^[a-zA-Z0-9_-]+$/
const SAFE_TABLE = /^[a-zA-Z0-9_-]+$/
const CANONICAL_APPLIED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/

export type CommunityStrictMigrationRiskV1 = 'additive' | 'destructive-or-dynamic'

export type CommunityStrictMigrationV1 = Readonly<{
  idx: number
  tag: string
  sha256: string
  risk: CommunityStrictMigrationRiskV1
}>

export type CommunityStrictMigrationRootV1 = Readonly<{
  id: string
  ordinal: number
  migrationsDir: string
  migrationTable: string
  legacyHashColumn: boolean
  journalSha256: string
  journalSha256History: readonly string[]
  migrations: readonly CommunityStrictMigrationV1[]
}>

export type CommunityStrictConvergenceOperationV1 = Readonly<{
  id: string
  ownerRootId: string
  kind: 'add-column-if-missing'
  table: string
  column: string
  dataType: 'timestamp with time zone'
  sha256: string
  risk: 'additive'
}>

export type CommunityStrictLineageV1 = Readonly<{
  id: string
  kind: 'legacy' | 'strict'
  postgresMajor: number
  relationCount: number
  schemaFingerprintSha256: string
  appliedCounts: readonly number[]
  policyId: string
  inventorySha256: string
  convergenceSha256: string
}>

export type CommunityStrictLineageReconciliationV1 = Readonly<{
  id: string
  postgresMajor: number
  relationCount: number
  schemaFingerprintSha256: string
  appliedCounts: readonly number[]
  targetLineageId: string
  rootModes: readonly ('apply' | 'adopt' | 'unchanged')[]
}>

export type CommunityStrictMigrationPolicyV1 = Readonly<{
  schemaVersion: 1
  id: string
  inventorySha256: string
  sourceArtifacts: Readonly<{
    convergenceFileSha256: string
    lineagesFileSha256: string
  }>
  lock: Readonly<{ classId: number; objectId: number }>
  roots: readonly CommunityStrictMigrationRootV1[]
  convergence: readonly CommunityStrictConvergenceOperationV1[]
  convergenceSha256: string
  lineages: readonly CommunityStrictLineageV1[]
  lineageReconciliations: readonly CommunityStrictLineageReconciliationV1[]
  targetLineageId: string
}>

export type CommunityStrictCatalogProjectionV1 = Readonly<{
  relations: readonly Record<string, unknown>[]
  columns: readonly Record<string, unknown>[]
  constraints: readonly Record<string, unknown>[]
  indexes: readonly Record<string, unknown>[]
  views: readonly Record<string, unknown>[]
  sequences: readonly Record<string, unknown>[]
  inheritance: readonly Record<string, unknown>[]
  routines: readonly Record<string, unknown>[]
  triggers: readonly Record<string, unknown>[]
  eventTriggers: readonly Record<string, unknown>[]
  rules: readonly Record<string, unknown>[]
  policies: readonly Record<string, unknown>[]
  types: readonly Record<string, unknown>[]
  extensions: readonly Record<string, unknown>[]
}>

export type CommunityStrictLegacyMigrationRow = Readonly<{
  tag: string
  sha256: string | null
  appliedAt: string
}>

export type CommunityStrictRootState = Readonly<{
  rootId: string
  migrationTablePresent: boolean
  rows: readonly CommunityStrictLegacyMigrationRow[]
}>

export type CommunityStrictDataSentinel = Readonly<{
  table: string
  columns: readonly string[]
  rowCount: string
  rowDigest: string
}>

export type CommunityStrictStateReceiptV1 = Readonly<{
  schemaVersion: 1
  policyId: string
  inventorySha256: string
  convergenceSha256: string
  lineageId: 'empty-v1' | string
  schemaFingerprintSha256: string
  receiptFingerprintSha256: string
  strictReceiptRowsSha256: string | null
  roots: readonly CommunityStrictRootState[]
  dataSentinels: readonly CommunityStrictDataSentinel[]
  stateFingerprintSha256: string
}>

export type CommunityStrictMigrationPlanAppliedPrefixV1 = Readonly<{
  rootId: string
  rootOrdinal: number
  migrationTablePresent: boolean
  appliedCount: number
  migrations: readonly Readonly<{
    migrationIdx: number
    tag: string
    sqlSha256: string
  }>[]
}>

export type CommunityStrictMigrationPlanSourceV1 = Readonly<{
  postgresMajor: number
  lineageId: 'empty-v1' | string
  schemaFingerprintSha256: string
  receiptFingerprintSha256: string
  strictReceiptRowsSha256: string | null
  appliedPrefixes: readonly CommunityStrictMigrationPlanAppliedPrefixV1[]
}>

export type CommunityStrictMigrationPlanPendingMigrationV1 = Readonly<{
  order: number
  rootId: string
  rootOrdinal: number
  migrationIdx: number
  tag: string
  sqlSha256: string
  risk: CommunityStrictMigrationRiskV1
}>

export type CommunityStrictMigrationPlanV1 = Readonly<{
  schemaVersion: 1
  policyId: string
  policySha256: string
  inventorySha256: string
  bundleSha256: string
  target: Readonly<{
    lineageId: string
    postgresMajor: number
    relationCount: number
    schemaFingerprintSha256: string
    appliedCounts: readonly number[]
    policyId: string
    inventorySha256: string
    convergenceSha256: string
  }>
  source: CommunityStrictMigrationPlanSourceV1
  sourceFingerprintSha256: string
  pendingMigrations: readonly CommunityStrictMigrationPlanPendingMigrationV1[]
  convergenceSha256: string
  action: 'migrate' | 'verify-only'
}>

export type CommunityStrictMigrationPlanBindingV1 = Readonly<{
  plan: CommunityStrictMigrationPlanV1
  planSha256: string
  sourceFingerprintSha256: string
}>

export type CommunityStrictMigrationApplyResultV1 = CommunityStrictStateReceiptV1 & Readonly<{
  migrationPlan: CommunityStrictMigrationPlanV1
  acceptedPlanSha256: string
  sourceFingerprintSha256: string
  durableAcceptance: CommunityStrictMigrationPlanAcceptanceV1
  latestAppliedPlanSha256: string | null
  latestAppliedAcceptance: CommunityStrictMigrationPlanAcceptanceV1 | null
}>

type CommunityStrictSnapshotEvidenceSourceV1 = Readonly<{
  acceptedPlanSha256: string
  sourceMigrationStateFingerprintSha256: string
  sourceLineageId: string
  sourceSchemaFingerprintSha256: string
  sourceReceiptFingerprintSha256: string
  sourceDataFingerprintSha256: string
  sourceStateFingerprintSha256: string
  targetInventorySha256: string
}>

export type CommunityStrictVerifiedBackupEvidenceV1 = CommunityStrictSnapshotEvidenceSourceV1 & Readonly<{
  schemaVersion: 1
  kind: 'managed-verified-backup'
  evidencePolicy: 'managed-restore-verified-v1'
  createdAt: string
  backupPath: string
  sha256: string
  byteLength: number
  restoreProof: Readonly<{
    method: 'pg-restore-disposable-v1'
    backupSha256: string
    backupByteLength: number
    restoredSchemaFingerprintSha256: string
    restoredReceiptFingerprintSha256: string
    restoredDataFingerprintSha256: string
    restoredStateFingerprintSha256: string
  }>
}>

export type CommunityStrictExternalSnapshotEvidenceV1 = CommunityStrictSnapshotEvidenceSourceV1 & Readonly<{
  schemaVersion: 1
  kind: 'external-snapshot-attestation'
  evidencePolicy: 'external-recovery-owner-attested-v1'
  createdAt: string
  recoveryOwner: 'external'
  provider: string
  snapshotRef: string
  snapshotDigest: string | null
  attestedBy: string
  restoreInstructionsRef: string
}>

export type CommunityStrictSnapshotEvidenceV1 =
  | CommunityStrictVerifiedBackupEvidenceV1
  | CommunityStrictExternalSnapshotEvidenceV1

/** @deprecated Use CommunityStrictVerifiedBackupEvidenceV1. */
export type CommunityStrictBackupEvidenceV1 = CommunityStrictVerifiedBackupEvidenceV1

export type CommunityStrictSnapshotPolicyV1 =
  | 'managed-verified-only-v1'
  | 'managed-or-external-attested-v1'

export type CommunityStrictMigrationPlanAcceptanceV1 = Readonly<{
  schemaVersion: 1
  acceptedPlanSha256: string
  action: 'migrate' | 'verify-only'
  sourceFingerprintSha256: string
  targetLineageId: string
  resultLineageId: string
  resultSchemaFingerprintSha256: string
  resultReceiptFingerprintSha256: string
  resultStateFingerprintSha256: string
  evidenceKind: CommunityStrictSnapshotEvidenceV1['kind'] | null
  evidenceSha256: string | null
  acceptedAt: string
}>

export type CommunityStrictMigrationPlanningResultV1 = CommunityStrictStateReceiptV1 & Readonly<{
  migrationPlan: CommunityStrictMigrationPlanV1
  acceptedPlanSha256: string
  sourceFingerprintSha256: string
  requiresSnapshotEvidence: boolean
}>

export type CommunityStrictMigrationPlanAcceptedContextV1 = Readonly<{
  migrationPlan: CommunityStrictMigrationPlanV1
  acceptedPlanSha256: string
  sourceFingerprintSha256: string
  preflight: CommunityStrictStateReceiptV1
  snapshotEvidenceKind: CommunityStrictSnapshotEvidenceV1['kind'] | null
  snapshotEvidenceSha256: string | null
}>

export type CommunityStrictPgClient = Readonly<{
  connect: () => Promise<void>
  query: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>
  end: () => Promise<void>
}>

type LoadedMigration = Readonly<{
  root: CommunityStrictMigrationRootV1
  migration: CommunityStrictMigrationV1
  sqlPath: string
  sql: string
  statements: readonly string[]
}>

type LoadedRoot = Readonly<{
  root: CommunityStrictMigrationRootV1
  migrationsDir: string
  migrations: readonly LoadedMigration[]
}>

export type CommunityStrictMigrationBundleV1 = Readonly<{
  workspaceRoot: string
  roots: readonly LoadedRoot[]
}>

type StrictReceiptRow = Readonly<{
  rootId: string
  rootOrdinal: number
  migrationIdx: number
  tag: string
  sqlSha256: string
  journalSha256: string
  appliedAt: string
  provenance: 'applied' | 'exact-lineage-adoption'
}>

type StrictStateRow = Readonly<{
  policyId: string
  inventorySha256: string
  convergenceSha256: string
  lineageId: string
  schemaFingerprintSha256: string
  receiptFingerprintSha256: string
  strictReceiptRowsSha256: string
}>

type ObservedState = Readonly<{
  projection: CommunityStrictCatalogProjectionV1
  schemaFingerprintSha256: string
  roots: readonly CommunityStrictRootState[]
  strictReceipts: readonly StrictReceiptRow[] | null
  strictState: StrictStateRow | null
  relationNames: ReadonlySet<string>
}>

type DatabasePrefixLineage = Readonly<{
  id: typeof DATABASE_PREFIX_LINEAGE_ID
  kind: 'database-prefix'
}>

type ObservedClassification = 'empty-v1' | CommunityStrictLineageV1 | DatabasePrefixLineage

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertExactKeys(label: string, value: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || !actual.every((key, index) => key === wanted[index])) {
    throw new Error(`${label}_keys_invalid:expected=${wanted.join(',')}:actual=${actual.join(',')}`)
  }
}

function codepointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function normalizeSqlDefinition(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return String(value)
}

function normalizeCatalogRow(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort(codepointCompare)) {
    const candidate = value[key]
    result[key] = key === 'definition' || key === 'defaultExpression' || key === 'predicate'
      ? normalizeSqlDefinition(candidate)
      : candidate
  }
  return result
}

function sortCatalogRows(values: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  return values
    .map(normalizeCatalogRow)
    .sort((left, right) => codepointCompare(JSON.stringify(left), JSON.stringify(right)))
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function sha256Json(value: unknown): string {
  return sha256(JSON.stringify(value))
}

function canonicalMigrationPlanJson(value: unknown): CommunityStrictMigrationPlanV1 {
  if (!isRecord(value)) throw new Error('community_strict_plan_json_invalid')
  assertExactKeys('community_strict_plan_json', value, [
    'schemaVersion', 'policyId', 'policySha256', 'inventorySha256', 'bundleSha256',
    'target', 'source', 'sourceFingerprintSha256', 'pendingMigrations',
    'convergenceSha256', 'action',
  ])
  if (!isRecord(value.target) || !isRecord(value.source) ||
      !Array.isArray(value.pendingMigrations) || !Array.isArray(value.source.appliedPrefixes)) {
    throw new Error('community_strict_plan_json_invalid')
  }
  assertExactKeys('community_strict_plan_json_target', value.target, [
    'lineageId', 'postgresMajor', 'relationCount', 'schemaFingerprintSha256',
    'appliedCounts', 'policyId', 'inventorySha256', 'convergenceSha256',
  ])
  assertExactKeys('community_strict_plan_json_source', value.source, [
    'postgresMajor', 'lineageId', 'schemaFingerprintSha256', 'receiptFingerprintSha256',
    'strictReceiptRowsSha256', 'appliedPrefixes',
  ])
  if (!Array.isArray(value.target.appliedCounts)) {
    throw new Error('community_strict_plan_json_invalid')
  }

  const appliedPrefixes = value.source.appliedPrefixes.map((candidate) => {
    if (!isRecord(candidate) || !Array.isArray(candidate.migrations)) {
      throw new Error('community_strict_plan_json_invalid')
    }
    assertExactKeys('community_strict_plan_json_applied_prefix', candidate, [
      'rootId', 'rootOrdinal', 'migrationTablePresent', 'appliedCount', 'migrations',
    ])
    const migrations = candidate.migrations.map((migration) => {
      if (!isRecord(migration)) throw new Error('community_strict_plan_json_invalid')
      assertExactKeys('community_strict_plan_json_applied_migration', migration, [
        'migrationIdx', 'tag', 'sqlSha256',
      ])
      return {
        migrationIdx: migration.migrationIdx as number,
        tag: migration.tag as string,
        sqlSha256: migration.sqlSha256 as string,
      }
    })
    return {
      rootId: candidate.rootId as string,
      rootOrdinal: candidate.rootOrdinal as number,
      migrationTablePresent: candidate.migrationTablePresent as boolean,
      appliedCount: candidate.appliedCount as number,
      migrations,
    }
  })
  const pendingMigrations = value.pendingMigrations.map((candidate) => {
    if (!isRecord(candidate)) throw new Error('community_strict_plan_json_invalid')
    assertExactKeys('community_strict_plan_json_pending_migration', candidate, [
      'order', 'rootId', 'rootOrdinal', 'migrationIdx', 'tag', 'sqlSha256', 'risk',
    ])
    return {
      order: candidate.order as number,
      rootId: candidate.rootId as string,
      rootOrdinal: candidate.rootOrdinal as number,
      migrationIdx: candidate.migrationIdx as number,
      tag: candidate.tag as string,
      sqlSha256: candidate.sqlSha256 as string,
      risk: candidate.risk as CommunityStrictMigrationRiskV1,
    }
  })

  return {
    schemaVersion: value.schemaVersion as 1,
    policyId: value.policyId as string,
    policySha256: value.policySha256 as string,
    inventorySha256: value.inventorySha256 as string,
    bundleSha256: value.bundleSha256 as string,
    target: {
      lineageId: value.target.lineageId as string,
      postgresMajor: value.target.postgresMajor as number,
      relationCount: value.target.relationCount as number,
      schemaFingerprintSha256: value.target.schemaFingerprintSha256 as string,
      appliedCounts: value.target.appliedCounts as number[],
      policyId: value.target.policyId as string,
      inventorySha256: value.target.inventorySha256 as string,
      convergenceSha256: value.target.convergenceSha256 as string,
    },
    source: {
      postgresMajor: value.source.postgresMajor as number,
      lineageId: value.source.lineageId as string,
      schemaFingerprintSha256: value.source.schemaFingerprintSha256 as string,
      receiptFingerprintSha256: value.source.receiptFingerprintSha256 as string,
      strictReceiptRowsSha256: value.source.strictReceiptRowsSha256 === null
        ? null
        : value.source.strictReceiptRowsSha256 as string,
      appliedPrefixes,
    },
    sourceFingerprintSha256: value.sourceFingerprintSha256 as string,
    pendingMigrations,
    convergenceSha256: value.convergenceSha256 as string,
    action: value.action as CommunityStrictMigrationPlanV1['action'],
  }
}

function renderCommunityStrictConvergenceSql(operation: CommunityStrictConvergenceOperationV1): string {
  return `ALTER TABLE public.${quoteIdentifier(operation.table)} ADD COLUMN IF NOT EXISTS ${quoteIdentifier(operation.column)} ${operation.dataType}`
}

export function fingerprintCommunityStrictConvergence(
  operations: readonly CommunityStrictConvergenceOperationV1[],
): string {
  return sha256Json(operations.map((operation) => ({
    id: operation.id,
    ownerRootId: operation.ownerRootId,
    kind: operation.kind,
    table: operation.table,
    column: operation.column,
    dataType: operation.dataType,
    sha256: operation.sha256,
  })))
}

function quoteIdentifier(value: string): string {
  if (!SAFE_TABLE.test(value)) throw new Error(`community_strict_identifier_invalid:${value}`)
  return `"${value.replaceAll('"', '""')}"`
}

function splitMigrationStatements(sql: string): string[] {
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean)
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function sameResolvedPath(left: string, right: string): boolean {
  const resolvedLeft = path.resolve(left)
  const resolvedRight = path.resolve(right)
  return process.platform === 'win32'
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight
}

function resolvePlainContainedDirectory(workspaceRoot: string, relativePath: string): string {
  if (!relativePath || relativePath.includes('\\') || path.posix.isAbsolute(relativePath)) {
    throw new Error(`community_strict_migration_root_invalid:${relativePath}`)
  }
  const normalized = path.posix.normalize(relativePath)
  if (normalized !== relativePath || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`community_strict_migration_root_escape:${relativePath}`)
  }
  const root = path.resolve(workspaceRoot)
  const candidate = path.resolve(root, ...relativePath.split('/'))
  if (!isWithin(root, candidate) || !existsSync(candidate)) {
    throw new Error(`community_strict_migration_root_missing:${relativePath}`)
  }
  let cursor = root
  const realRoot = realpathSync(root)
  for (const segment of relativePath.split('/')) {
    cursor = path.join(cursor, segment)
    const stats = lstatSync(cursor)
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`community_strict_migration_root_unsafe:${relativePath}`)
    }
    if (!isWithin(realRoot, realpathSync(cursor))) {
      throw new Error(`community_strict_migration_root_real_escape:${relativePath}`)
    }
  }
  return candidate
}

export function validateCommunityStrictMigrationPolicyV1(
  policy: unknown,
): asserts policy is CommunityStrictMigrationPolicyV1 {
  if (!isRecord(policy)) throw new Error('community_strict_policy_not_object')
  assertExactKeys('community_strict_policy', policy, [
    'schemaVersion',
    'id',
    'inventorySha256',
    'sourceArtifacts',
    'lock',
    'roots',
    'convergence',
    'convergenceSha256',
    'lineages',
    'lineageReconciliations',
    'targetLineageId',
  ])
  if (policy.schemaVersion !== 1 || typeof policy.id !== 'string' || !SAFE_ID.test(policy.id)) {
    throw new Error('community_strict_policy_identity_invalid')
  }
  if (typeof policy.inventorySha256 !== 'string' || !RAW_SHA256.test(policy.inventorySha256)) {
    throw new Error('community_strict_policy_inventory_sha_invalid')
  }
  if (!isRecord(policy.sourceArtifacts)) throw new Error('community_strict_policy_source_artifacts_invalid')
  assertExactKeys('community_strict_policy_source_artifacts', policy.sourceArtifacts, [
    'convergenceFileSha256',
    'lineagesFileSha256',
  ])
  if (typeof policy.sourceArtifacts.convergenceFileSha256 !== 'string' ||
      !RAW_SHA256.test(policy.sourceArtifacts.convergenceFileSha256) ||
      typeof policy.sourceArtifacts.lineagesFileSha256 !== 'string' ||
      !RAW_SHA256.test(policy.sourceArtifacts.lineagesFileSha256)) {
    throw new Error('community_strict_policy_source_artifacts_invalid')
  }
  if (!isRecord(policy.lock)) throw new Error('community_strict_policy_lock_invalid')
  assertExactKeys('community_strict_policy_lock', policy.lock, ['classId', 'objectId'])
  for (const value of [policy.lock.classId, policy.lock.objectId]) {
    if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 2_147_483_647) {
      throw new Error('community_strict_policy_lock_invalid')
    }
  }
  if (!Array.isArray(policy.roots) || policy.roots.length !== 5) {
    throw new Error('community_strict_policy_root_count_invalid')
  }
  const rootIds = new Set<string>()
  const migrationTables = new Set<string>()
  for (const [ordinal, rawRoot] of policy.roots.entries()) {
    if (!isRecord(rawRoot)) throw new Error(`community_strict_policy_root_invalid:${ordinal}`)
    assertExactKeys('community_strict_policy_root', rawRoot, [
      'id',
      'ordinal',
      'migrationsDir',
      'migrationTable',
      'legacyHashColumn',
      'journalSha256',
      'journalSha256History',
      'migrations',
    ])
    if (typeof rawRoot.id !== 'string' || !SAFE_ID.test(rawRoot.id) || rootIds.has(rawRoot.id)) {
      throw new Error(`community_strict_policy_root_id_invalid:${String(rawRoot.id)}`)
    }
    if (rawRoot.ordinal !== ordinal) throw new Error(`community_strict_policy_root_order_invalid:${rawRoot.id}`)
    if (typeof rawRoot.migrationsDir !== 'string' || rawRoot.migrationsDir.trim() !== rawRoot.migrationsDir) {
      throw new Error(`community_strict_policy_root_path_invalid:${rawRoot.id}`)
    }
    if (typeof rawRoot.migrationTable !== 'string' || !SAFE_TABLE.test(rawRoot.migrationTable) ||
        migrationTables.has(rawRoot.migrationTable)) {
      throw new Error(`community_strict_policy_migration_table_invalid:${rawRoot.id}`)
    }
    if (typeof rawRoot.legacyHashColumn !== 'boolean' ||
        typeof rawRoot.journalSha256 !== 'string' || !RAW_SHA256.test(rawRoot.journalSha256) ||
        !Array.isArray(rawRoot.journalSha256History) || rawRoot.journalSha256History.length === 0 ||
        rawRoot.journalSha256History.at(-1) !== rawRoot.journalSha256 ||
        new Set(rawRoot.journalSha256History).size !== rawRoot.journalSha256History.length ||
        rawRoot.journalSha256History.some((digest) => typeof digest !== 'string' || !RAW_SHA256.test(digest))) {
      throw new Error(`community_strict_policy_root_contract_invalid:${rawRoot.id}`)
    }
    if (!Array.isArray(rawRoot.migrations) || rawRoot.migrations.length === 0) {
      throw new Error(`community_strict_policy_migrations_empty:${rawRoot.id}`)
    }
    const tags = new Set<string>()
    for (const [idx, rawMigration] of rawRoot.migrations.entries()) {
      if (!isRecord(rawMigration)) throw new Error(`community_strict_policy_migration_invalid:${rawRoot.id}:${idx}`)
      assertExactKeys('community_strict_policy_migration', rawMigration, ['idx', 'tag', 'sha256', 'risk'])
      if (rawMigration.idx !== idx || typeof rawMigration.tag !== 'string' ||
          !SAFE_TAG.test(rawMigration.tag) || tags.has(rawMigration.tag) ||
          typeof rawMigration.sha256 !== 'string' || !RAW_SHA256.test(rawMigration.sha256) ||
          !['additive', 'destructive-or-dynamic'].includes(String(rawMigration.risk))) {
        throw new Error(`community_strict_policy_migration_invalid:${rawRoot.id}:${idx}`)
      }
      tags.add(rawMigration.tag)
    }
    rootIds.add(rawRoot.id)
    migrationTables.add(rawRoot.migrationTable)
  }
  const validatedRoots = policy.roots as unknown as CommunityStrictMigrationRootV1[]
  if (!Array.isArray(policy.convergence) || policy.convergence.length === 0 ||
      typeof policy.convergenceSha256 !== 'string' || !RAW_SHA256.test(policy.convergenceSha256)) {
    throw new Error('community_strict_policy_convergence_invalid')
  }
  const convergenceIds = new Set<string>()
  for (const [index, rawOperation] of policy.convergence.entries()) {
    if (!isRecord(rawOperation)) throw new Error(`community_strict_policy_convergence_invalid:${index}`)
    assertExactKeys('community_strict_policy_convergence_operation', rawOperation, [
      'id', 'ownerRootId', 'kind', 'table', 'column', 'dataType', 'sha256', 'risk',
    ])
    if (typeof rawOperation.id !== 'string' || !SAFE_ID.test(rawOperation.id) || convergenceIds.has(rawOperation.id) ||
        typeof rawOperation.ownerRootId !== 'string' || !rootIds.has(rawOperation.ownerRootId) ||
        rawOperation.kind !== 'add-column-if-missing' ||
        typeof rawOperation.table !== 'string' || !SAFE_TABLE.test(rawOperation.table) ||
        typeof rawOperation.column !== 'string' || !SAFE_TABLE.test(rawOperation.column) ||
        rawOperation.dataType !== 'timestamp with time zone' ||
        typeof rawOperation.sha256 !== 'string' || !RAW_SHA256.test(rawOperation.sha256) ||
        rawOperation.risk !== 'additive') {
      throw new Error(`community_strict_policy_convergence_invalid:${index}`)
    }
    const operation = rawOperation as unknown as CommunityStrictConvergenceOperationV1
    if (sha256(Buffer.from(renderCommunityStrictConvergenceSql(operation), 'utf8')) !== rawOperation.sha256) {
      throw new Error(`community_strict_policy_convergence_hash_mismatch:${index}`)
    }
    convergenceIds.add(rawOperation.id)
  }
  const validatedConvergence = policy.convergence as unknown as CommunityStrictConvergenceOperationV1[]
  if (fingerprintCommunityStrictConvergence(validatedConvergence) !== policy.convergenceSha256) {
    throw new Error('community_strict_policy_convergence_fingerprint_mismatch')
  }
  if (!Array.isArray(policy.lineages) || policy.lineages.length < 2) {
    throw new Error('community_strict_policy_lineages_invalid')
  }
  const lineageIds = new Set<string>()
  const classifierTuples = new Set<string>()
  for (const rawLineage of policy.lineages) {
    if (!isRecord(rawLineage)) throw new Error('community_strict_policy_lineage_invalid')
    assertExactKeys('community_strict_policy_lineage', rawLineage, [
      'id',
      'kind',
      'postgresMajor',
      'relationCount',
      'schemaFingerprintSha256',
      'appliedCounts',
      'policyId',
      'inventorySha256',
      'convergenceSha256',
    ])
    if (typeof rawLineage.id !== 'string' || !SAFE_ID.test(rawLineage.id) || lineageIds.has(rawLineage.id) ||
        !['legacy', 'strict'].includes(String(rawLineage.kind)) ||
        !Number.isSafeInteger(rawLineage.postgresMajor) || Number(rawLineage.postgresMajor) < 12 ||
        !Number.isSafeInteger(rawLineage.relationCount) || Number(rawLineage.relationCount) < 1 ||
        typeof rawLineage.schemaFingerprintSha256 !== 'string' || !RAW_SHA256.test(rawLineage.schemaFingerprintSha256) ||
        typeof rawLineage.policyId !== 'string' || !SAFE_ID.test(rawLineage.policyId) ||
        typeof rawLineage.inventorySha256 !== 'string' || !RAW_SHA256.test(rawLineage.inventorySha256) ||
        typeof rawLineage.convergenceSha256 !== 'string' || !RAW_SHA256.test(rawLineage.convergenceSha256) ||
        !Array.isArray(rawLineage.appliedCounts) || rawLineage.appliedCounts.length !== validatedRoots.length) {
      throw new Error(`community_strict_policy_lineage_invalid:${String(rawLineage.id)}`)
    }
    rawLineage.appliedCounts.forEach((count, index) => {
      if (!Number.isSafeInteger(count) || Number(count) < 0 || Number(count) > validatedRoots[index].migrations.length) {
        throw new Error(`community_strict_policy_lineage_count_invalid:${rawLineage.id}:${index}`)
      }
    })
    const classifierTuple = JSON.stringify([
      rawLineage.postgresMajor,
      rawLineage.relationCount,
      rawLineage.schemaFingerprintSha256,
      rawLineage.appliedCounts,
    ])
    if (classifierTuples.has(classifierTuple)) {
      throw new Error(`community_strict_policy_lineage_classifier_duplicate:${rawLineage.id}`)
    }
    classifierTuples.add(classifierTuple)
    lineageIds.add(rawLineage.id)
  }
  const validatedLineages = policy.lineages as unknown as CommunityStrictLineageV1[]
  if (!Array.isArray(policy.lineageReconciliations)) {
    throw new Error('community_strict_policy_lineage_reconciliations_invalid')
  }
  const reconciliationIds = new Set<string>()
  const reconciliationTuples = new Set<string>()
  for (const rawReconciliation of policy.lineageReconciliations) {
    if (!isRecord(rawReconciliation)) {
      throw new Error('community_strict_policy_lineage_reconciliation_invalid')
    }
    assertExactKeys('community_strict_policy_lineage_reconciliation', rawReconciliation, [
      'id',
      'postgresMajor',
      'relationCount',
      'schemaFingerprintSha256',
      'appliedCounts',
      'targetLineageId',
      'rootModes',
    ])
    if (typeof rawReconciliation.id !== 'string' || !SAFE_ID.test(rawReconciliation.id) ||
        reconciliationIds.has(rawReconciliation.id) ||
        !Number.isSafeInteger(rawReconciliation.postgresMajor) || Number(rawReconciliation.postgresMajor) < 12 ||
        !Number.isSafeInteger(rawReconciliation.relationCount) || Number(rawReconciliation.relationCount) < 1 ||
        typeof rawReconciliation.schemaFingerprintSha256 !== 'string' ||
        !RAW_SHA256.test(rawReconciliation.schemaFingerprintSha256) ||
        !Array.isArray(rawReconciliation.appliedCounts) ||
        rawReconciliation.appliedCounts.length !== validatedRoots.length ||
        typeof rawReconciliation.targetLineageId !== 'string' ||
        !Array.isArray(rawReconciliation.rootModes) ||
        rawReconciliation.rootModes.length !== validatedRoots.length ||
        rawReconciliation.rootModes.some((mode) => !['apply', 'adopt', 'unchanged'].includes(String(mode)))) {
      throw new Error(`community_strict_policy_lineage_reconciliation_invalid:${String(rawReconciliation.id)}`)
    }
    const reconciliation = rawReconciliation as unknown as CommunityStrictLineageReconciliationV1
    const reconciliationTarget = validatedLineages.find((lineage) => lineage.id === reconciliation.targetLineageId)
    if (!reconciliationTarget || reconciliationTarget.kind !== 'legacy') {
      throw new Error(`community_strict_policy_lineage_reconciliation_target_invalid:${reconciliation.id}`)
    }
    reconciliation.appliedCounts.forEach((count, index) => {
      const targetCount = reconciliationTarget.appliedCounts[index]
      if (!Number.isSafeInteger(count) || count < 0 || count > targetCount) {
        throw new Error(`community_strict_policy_lineage_reconciliation_count_invalid:${reconciliation.id}:${index}`)
      }
      const mode = reconciliation.rootModes[index]
      if ((mode === 'unchanged') !== (count === targetCount)) {
        throw new Error(`community_strict_policy_lineage_reconciliation_mode_invalid:${reconciliation.id}:${index}`)
      }
    })
    if (reconciliation.rootModes.every((mode) => mode === 'unchanged')) {
      throw new Error(`community_strict_policy_lineage_reconciliation_noop:${reconciliation.id}`)
    }
    const tuple = JSON.stringify([
      reconciliation.postgresMajor,
      reconciliation.relationCount,
      reconciliation.schemaFingerprintSha256,
      reconciliation.appliedCounts,
    ])
    if (classifierTuples.has(tuple) || reconciliationTuples.has(tuple)) {
      throw new Error(`community_strict_policy_lineage_reconciliation_classifier_duplicate:${reconciliation.id}`)
    }
    reconciliationTuples.add(tuple)
    reconciliationIds.add(reconciliation.id)
  }
  const target = validatedLineages.find((lineage) => lineage.id === policy.targetLineageId)
  if (!target || target.kind !== 'strict' ||
      target.policyId !== policy.id || target.inventorySha256 !== policy.inventorySha256 ||
      target.convergenceSha256 !== policy.convergenceSha256 ||
      !target.appliedCounts.every((count, index) => count === validatedRoots[index].migrations.length)) {
    throw new Error('community_strict_policy_target_invalid')
  }
}

export function inspectCommunityStrictMigrationBundle(params: {
  policy: CommunityStrictMigrationPolicyV1
  workspaceRoot: string
}): CommunityStrictMigrationBundleV1 {
  validateCommunityStrictMigrationPolicyV1(params.policy)
  const workspaceRoot = path.resolve(params.workspaceRoot)
  const roots = params.policy.roots.map((root) => {
    const migrationsDir = resolvePlainContainedDirectory(workspaceRoot, root.migrationsDir)
    const metaDir = resolvePlainContainedDirectory(workspaceRoot, `${root.migrationsDir}/meta`)
    const journalPath = path.join(metaDir, '_journal.json')
    if (!existsSync(journalPath) || lstatSync(journalPath).isSymbolicLink()) {
      throw new Error(`community_strict_journal_missing:${root.id}`)
    }
    if (!isWithin(metaDir, realpathSync(journalPath))) {
      throw new Error(`community_strict_journal_unsafe:${root.id}`)
    }
    const journalBytes = readFileSync(journalPath)
    if (sha256(journalBytes) !== root.journalSha256) {
      throw new Error(`community_strict_journal_hash_mismatch:${root.id}`)
    }
    const parsed = JSON.parse(journalBytes.toString('utf8')) as { entries?: unknown[] }
    if (!Array.isArray(parsed.entries) || parsed.entries.length !== root.migrations.length) {
      throw new Error(`community_strict_journal_entry_count_mismatch:${root.id}`)
    }
    parsed.entries.forEach((entry, index) => {
      if (!isRecord(entry) || entry.idx !== root.migrations[index].idx || entry.tag !== root.migrations[index].tag) {
        throw new Error(`community_strict_journal_entry_mismatch:${root.id}:${index}`)
      }
    })
    const expectedSql = new Set(root.migrations.map((migration) => `${migration.tag}.sql`))
    const actualSql = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort(codepointCompare)
    const expectedSorted = [...expectedSql].sort(codepointCompare)
    if (JSON.stringify(actualSql) !== JSON.stringify(expectedSorted)) {
      throw new Error(`community_strict_sql_set_mismatch:${root.id}`)
    }
    const migrations = root.migrations.map((migration) => {
      const sqlPath = path.join(migrationsDir, `${migration.tag}.sql`)
      const stats = lstatSync(sqlPath)
      if (!stats.isFile() || stats.isSymbolicLink() || !isWithin(migrationsDir, realpathSync(sqlPath))) {
        throw new Error(`community_strict_sql_unsafe:${root.id}:${migration.tag}`)
      }
      const sqlBytes = readFileSync(sqlPath)
      if (sha256(sqlBytes) !== migration.sha256) {
        throw new Error(`community_strict_sql_hash_mismatch:${root.id}:${migration.tag}`)
      }
      const sql = sqlBytes.toString('utf8')
      const statements = splitMigrationStatements(sql)
      if (statements.length === 0) throw new Error(`community_strict_sql_empty:${root.id}:${migration.tag}`)
      return { root, migration, sqlPath, sql, statements }
    })
    return { root, migrationsDir, migrations }
  })
  return { workspaceRoot, roots }
}

function canonicalPolicyBinding(policy: CommunityStrictMigrationPolicyV1): Record<string, unknown> {
  return {
    schemaVersion: policy.schemaVersion,
    id: policy.id,
    inventorySha256: policy.inventorySha256,
    sourceArtifacts: {
      convergenceFileSha256: policy.sourceArtifacts.convergenceFileSha256,
      lineagesFileSha256: policy.sourceArtifacts.lineagesFileSha256,
    },
    lock: {
      classId: policy.lock.classId,
      objectId: policy.lock.objectId,
    },
    roots: policy.roots.map((root) => ({
      id: root.id,
      ordinal: root.ordinal,
      migrationsDir: root.migrationsDir,
      migrationTable: root.migrationTable,
      legacyHashColumn: root.legacyHashColumn,
      journalSha256: root.journalSha256,
      journalSha256History: [...root.journalSha256History],
      migrations: root.migrations.map((migration) => ({
        idx: migration.idx,
        tag: migration.tag,
        sha256: migration.sha256,
        risk: migration.risk,
      })),
    })),
    convergence: policy.convergence.map((operation) => ({
      id: operation.id,
      ownerRootId: operation.ownerRootId,
      kind: operation.kind,
      table: operation.table,
      column: operation.column,
      dataType: operation.dataType,
      sha256: operation.sha256,
      risk: operation.risk,
    })),
    convergenceSha256: policy.convergenceSha256,
    lineages: policy.lineages.map((lineage) => ({
      id: lineage.id,
      kind: lineage.kind,
      postgresMajor: lineage.postgresMajor,
      relationCount: lineage.relationCount,
      schemaFingerprintSha256: lineage.schemaFingerprintSha256,
      appliedCounts: [...lineage.appliedCounts],
      policyId: lineage.policyId,
      inventorySha256: lineage.inventorySha256,
      convergenceSha256: lineage.convergenceSha256,
    })),
    lineageReconciliations: policy.lineageReconciliations.map((reconciliation) => ({
      id: reconciliation.id,
      postgresMajor: reconciliation.postgresMajor,
      relationCount: reconciliation.relationCount,
      schemaFingerprintSha256: reconciliation.schemaFingerprintSha256,
      appliedCounts: [...reconciliation.appliedCounts],
      targetLineageId: reconciliation.targetLineageId,
      rootModes: [...reconciliation.rootModes],
    })),
    targetLineageId: policy.targetLineageId,
  }
}

function canonicalBundleBinding(params: {
  policy: CommunityStrictMigrationPolicyV1
  bundle: CommunityStrictMigrationBundleV1
}): readonly Record<string, unknown>[] {
  if (params.bundle.roots.length !== params.policy.roots.length) {
    throw new Error('community_strict_plan_bundle_root_count_mismatch')
  }
  return params.policy.roots.map((root, rootOrdinal) => {
    const loadedRoot = params.bundle.roots[rootOrdinal]
    if (!loadedRoot || loadedRoot.root.id !== root.id || loadedRoot.root.ordinal !== rootOrdinal ||
        loadedRoot.root.journalSha256 !== root.journalSha256 ||
        loadedRoot.migrations.length !== root.migrations.length) {
      throw new Error(`community_strict_plan_bundle_root_mismatch:${root.id}`)
    }
    const migrations = root.migrations.map((migration, migrationIdx) => {
      const loaded = loadedRoot.migrations[migrationIdx]
      if (!loaded || loaded.root.id !== root.id || loaded.migration.idx !== migrationIdx ||
          loaded.migration.tag !== migration.tag || loaded.migration.sha256 !== migration.sha256 ||
          loaded.migration.risk !== migration.risk || sha256(Buffer.from(loaded.sql, 'utf8')) !== migration.sha256) {
        throw new Error(`community_strict_plan_bundle_migration_mismatch:${root.id}:${migrationIdx}`)
      }
      return {
        migrationIdx,
        tag: migration.tag,
        sqlSha256: migration.sha256,
        risk: migration.risk,
      }
    })
    return {
      rootId: root.id,
      rootOrdinal,
      journalSha256: root.journalSha256,
      migrations,
    }
  })
}

export function buildCommunityStrictMigrationPlanV1(params: {
  policy: CommunityStrictMigrationPolicyV1
  bundle: CommunityStrictMigrationBundleV1
  postgresMajor: number
  sourceLineageId: 'empty-v1' | string
  sourceSchemaFingerprintSha256: string
  sourceStrictReceiptRowsSha256: string | null
  sourceRoots: readonly CommunityStrictRootState[]
}): CommunityStrictMigrationPlanBindingV1 {
  validateCommunityStrictMigrationPolicyV1(params.policy)
  if (!Number.isSafeInteger(params.postgresMajor) || params.postgresMajor < 12) {
    throw new Error('community_strict_plan_source_postgres_major_invalid')
  }
  if (!RAW_SHA256.test(params.sourceSchemaFingerprintSha256) ||
      (params.sourceStrictReceiptRowsSha256 !== null && !RAW_SHA256.test(params.sourceStrictReceiptRowsSha256))) {
    throw new Error('community_strict_plan_source_fingerprint_invalid')
  }
  if (params.sourceRoots.length !== params.policy.roots.length) {
    throw new Error('community_strict_plan_source_root_count_mismatch')
  }

  const bundleBinding = canonicalBundleBinding({ policy: params.policy, bundle: params.bundle })
  const sourceLineage = params.sourceLineageId === 'empty-v1'
    ? null
    : params.policy.lineages.find((lineage) => lineage.id === params.sourceLineageId)
  const reconciliationPrefix = 'reconciliation:'
  const sourceReconciliation = params.sourceLineageId.startsWith(reconciliationPrefix)
    ? params.policy.lineageReconciliations.find(
      (candidate) => candidate.id === params.sourceLineageId.slice(reconciliationPrefix.length),
    )
    : undefined
  const sourceIsDatabasePrefix = params.sourceLineageId === DATABASE_PREFIX_LINEAGE_ID
  if (params.sourceLineageId !== 'empty-v1' && !sourceLineage && !sourceReconciliation &&
      !sourceIsDatabasePrefix) {
    throw new Error(`community_strict_plan_source_lineage_invalid:${params.sourceLineageId}`)
  }
  if (sourceLineage && (sourceLineage.postgresMajor !== params.postgresMajor ||
      sourceLineage.schemaFingerprintSha256 !== params.sourceSchemaFingerprintSha256)) {
    throw new Error(`community_strict_plan_source_lineage_mismatch:${params.sourceLineageId}`)
  }
  if (sourceReconciliation && (sourceReconciliation.postgresMajor !== params.postgresMajor ||
      sourceReconciliation.schemaFingerprintSha256 !== params.sourceSchemaFingerprintSha256)) {
    throw new Error(`community_strict_plan_source_reconciliation_mismatch:${sourceReconciliation.id}`)
  }
  if ((sourceLineage?.kind === 'strict') !== (params.sourceStrictReceiptRowsSha256 !== null) ||
      (sourceReconciliation !== undefined && params.sourceStrictReceiptRowsSha256 !== null)) {
    throw new Error('community_strict_plan_source_strict_receipts_mismatch')
  }

  const appliedPrefixes: CommunityStrictMigrationPlanAppliedPrefixV1[] = params.policy.roots.map(
    (root, rootOrdinal) => {
      const observed = params.sourceRoots[rootOrdinal]
      if (!observed || observed.rootId !== root.id || observed.rows.length > root.migrations.length ||
          typeof observed.migrationTablePresent !== 'boolean') {
        throw new Error(`community_strict_plan_source_root_mismatch:${root.id}`)
      }
      const migrations = observed.rows.map((row, migrationIdx) => {
        const migration = root.migrations[migrationIdx]
        if (!migration || row.tag !== migration.tag ||
            (row.sha256 !== null && row.sha256 !== migration.sha256)) {
          throw new Error(`community_strict_plan_source_prefix_mismatch:${root.id}:${migrationIdx}`)
        }
        return {
          migrationIdx,
          tag: migration.tag,
          sqlSha256: migration.sha256,
        }
      })
      return {
        rootId: root.id,
        rootOrdinal,
        migrationTablePresent: observed.migrationTablePresent,
        appliedCount: migrations.length,
        migrations,
      }
    },
  )
  const appliedCounts = appliedPrefixes.map((prefix) => prefix.appliedCount)
  if (sourceLineage && !sourceLineage.appliedCounts.every((count, index) => count === appliedCounts[index])) {
    throw new Error(`community_strict_plan_source_counts_mismatch:${sourceLineage.id}`)
  }
  if (sourceReconciliation &&
      !sourceReconciliation.appliedCounts.every((count, index) => count === appliedCounts[index])) {
    throw new Error(`community_strict_plan_source_counts_mismatch:${sourceReconciliation.id}`)
  }
  if (!sourceLineage && !sourceReconciliation && !sourceIsDatabasePrefix &&
      appliedCounts.some((count) => count !== 0)) {
    throw new Error('community_strict_plan_empty_source_not_empty')
  }

  const receiptFingerprintSha256 = fingerprintCommunityStrictReceipts(params.policy, params.sourceRoots)
  const source: CommunityStrictMigrationPlanSourceV1 = {
    postgresMajor: params.postgresMajor,
    lineageId: params.sourceLineageId,
    schemaFingerprintSha256: params.sourceSchemaFingerprintSha256,
    receiptFingerprintSha256,
    strictReceiptRowsSha256: params.sourceStrictReceiptRowsSha256,
    appliedPrefixes,
  }
  const sourceFingerprintSha256 = sha256Json(source)
  const pendingMigrations: CommunityStrictMigrationPlanPendingMigrationV1[] = []
  for (const [rootOrdinal, loadedRoot] of params.bundle.roots.entries()) {
    for (const loaded of loadedRoot.migrations.slice(appliedCounts[rootOrdinal])) {
      pendingMigrations.push({
        order: pendingMigrations.length,
        rootId: loadedRoot.root.id,
        rootOrdinal,
        migrationIdx: loaded.migration.idx,
        tag: loaded.migration.tag,
        sqlSha256: loaded.migration.sha256,
        risk: loaded.migration.risk,
      })
    }
  }
  const target = params.policy.lineages.find((lineage) => lineage.id === params.policy.targetLineageId)
  if (!target) throw new Error('community_strict_target_missing')
  const plan: CommunityStrictMigrationPlanV1 = {
    schemaVersion: 1,
    policyId: params.policy.id,
    policySha256: sha256Json(canonicalPolicyBinding(params.policy)),
    inventorySha256: params.policy.inventorySha256,
    bundleSha256: sha256Json(bundleBinding),
    target: {
      lineageId: target.id,
      postgresMajor: target.postgresMajor,
      relationCount: target.relationCount,
      schemaFingerprintSha256: target.schemaFingerprintSha256,
      appliedCounts: [...target.appliedCounts],
      policyId: target.policyId,
      inventorySha256: target.inventorySha256,
      convergenceSha256: target.convergenceSha256,
    },
    source,
    sourceFingerprintSha256,
    pendingMigrations,
    convergenceSha256: params.policy.convergenceSha256,
    action: params.sourceLineageId === target.id && pendingMigrations.length === 0
      ? 'verify-only'
      : 'migrate',
  }
  return {
    plan,
    planSha256: sha256Json(canonicalMigrationPlanJson(plan)),
    sourceFingerprintSha256,
  }
}

export async function readCommunityStrictCatalogProjection(
  client: CommunityStrictPgClient,
): Promise<CommunityStrictCatalogProjectionV1> {
  const relations = await client.query<Record<string, unknown>>(
    `SELECT c.relname AS "table", c.relkind AS "kind", c.relpersistence AS "persistence",
            c.relrowsecurity AS "rowSecurity", c.relforcerowsecurity AS "forceRowSecurity",
            c.relreplident AS "replicaIdentity", c.relispartition AS "isPartition",
            CASE WHEN c.relkind = 'p' THEN pg_catalog.pg_get_partkeydef(c.oid) ELSE NULL END AS "partitionKey",
            CASE WHEN c.relispartition THEN pg_catalog.pg_get_expr(c.relpartbound, c.oid, false) ELSE NULL END AS "partitionBound",
            ts.spcname AS "tablespace",
            COALESCE((SELECT array_agg(option_value ORDER BY option_value)
                        FROM unnest(c.reloptions) AS option_value), ARRAY[]::text[]) AS "options",
            COALESCE((SELECT array_agg(
                                (CASE WHEN acl_value.grantee = 0 THEN 'PUBLIC'
                                      ELSE pg_catalog.pg_get_userbyid(acl_value.grantee) END) || ':' ||
                                acl_value.privilege_type || ':' ||
                                CASE WHEN acl_value.is_grantable THEN 'grantable' ELSE 'plain' END
                                ORDER BY acl_value.grantee, acl_value.privilege_type,
                                         acl_value.is_grantable)
                        FROM pg_catalog.aclexplode(c.relacl) AS acl_value
                       WHERE acl_value.grantee <> c.relowner), ARRAY[]::text[]) AS "acl"
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_catalog.pg_tablespace ts ON ts.oid = c.reltablespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f', 'c')
        AND NOT EXISTS (
          SELECT 1
            FROM pg_catalog.pg_depend extension_dependency
           WHERE extension_dependency.classid = 'pg_catalog.pg_class'::regclass
             AND extension_dependency.objid = c.oid
             AND extension_dependency.refclassid = 'pg_catalog.pg_extension'::regclass
             AND extension_dependency.deptype = 'e'
        )`,
  )
  const columns = await client.query<Record<string, unknown>>(
    `SELECT c.relname AS "table",
            row_number() OVER (PARTITION BY c.oid ORDER BY a.attnum)::integer AS "ordinal",
            a.attname AS "column",
            pg_catalog.format_type(a.atttypid, a.atttypmod) AS "type",
            a.attnotnull AS "notNull",
            pg_catalog.pg_get_expr(d.adbin, d.adrelid, false) AS "defaultExpression",
            a.attidentity AS "identity", a.attgenerated AS "generated",
            a.attstorage AS "storage", a.attcompression AS "compression",
            a.attstattarget AS "statisticsTarget", a.attislocal AS "isLocal",
            a.attinhcount AS "inheritCount",
            CASE WHEN a.attcollation = 0 THEN NULL
                 ELSE cn.nspname || '.' || coll.collname END AS "collation",
            COALESCE((SELECT array_agg(option_value ORDER BY option_value)
                        FROM unnest(a.attoptions) AS option_value), ARRAY[]::text[]) AS "options",
            COALESCE((SELECT array_agg(acl_value::text ORDER BY acl_value::text)
                        FROM unnest(a.attacl) AS acl_value), ARRAY[]::text[]) AS "acl"
       FROM pg_catalog.pg_attribute a
       JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       LEFT JOIN pg_catalog.pg_collation coll ON coll.oid = a.attcollation
       LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid = coll.collnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'c')
        AND a.attnum > 0 AND NOT a.attisdropped`,
  )
  const constraints = await client.query<Record<string, unknown>>(
    `SELECT c.relname AS "table", x.conname AS "name", x.contype AS "type",
            x.condeferrable AS "deferrable", x.condeferred AS "deferred",
            x.convalidated AS "validated", x.connoinherit AS "noInherit",
            x.conislocal AS "isLocal", x.coninhcount AS "inheritCount",
            pg_catalog.pg_get_constraintdef(x.oid, false) AS "definition"
       FROM pg_catalog.pg_constraint x
       JOIN pg_catalog.pg_class c ON c.oid = x.conrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND x.contype IN ('p', 'f', 'u', 'c', 'x')`,
  )
  const indexes = await client.query<Record<string, unknown>>(
    `SELECT c.relname AS "table", i.relname AS "name", x.indisunique AS "unique",
            x.indnullsnotdistinct AS "nullsNotDistinct", x.indisprimary AS "primary",
            x.indisexclusion AS "exclusion", x.indimmediate AS "immediate",
            x.indisclustered AS "clustered", x.indisvalid AS "valid", x.indisready AS "ready",
            x.indislive AS "live", x.indisreplident AS "replicaIdentity",
            ts.spcname AS "tablespace",
            COALESCE((SELECT array_agg(option_value ORDER BY option_value)
                        FROM unnest(i.reloptions) AS option_value), ARRAY[]::text[]) AS "options",
            pg_catalog.pg_get_indexdef(i.oid) AS "definition",
            pg_catalog.pg_get_expr(x.indpred, x.indrelid, false) AS "predicate"
       FROM pg_catalog.pg_index x
       JOIN pg_catalog.pg_class c ON c.oid = x.indrelid
       JOIN pg_catalog.pg_class i ON i.oid = x.indexrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_catalog.pg_tablespace ts ON ts.oid = i.reltablespace
      WHERE n.nspname = 'public'`,
  )
  const views = await client.query<Record<string, unknown>>(
    `SELECT c.relname AS "name", c.relkind AS "kind",
            pg_catalog.pg_get_viewdef(c.oid, false) AS "definition",
            CASE WHEN c.relkind = 'm' THEN c.relispopulated ELSE NULL END AS "populated"
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')`,
  )
  const sequences = await client.query<Record<string, unknown>>(
    `SELECT c.relname AS "name", pg_catalog.format_type(s.seqtypid, NULL) AS "type",
            s.seqstart::text AS "start", s.seqincrement::text AS "increment",
            s.seqmax::text AS "maximum", s.seqmin::text AS "minimum",
            s.seqcache::text AS "cache", s.seqcycle AS "cycle",
            owned.relname AS "ownedByTable", owned.attname AS "ownedByColumn"
       FROM pg_catalog.pg_sequence s
       JOIN pg_catalog.pg_class c ON c.oid = s.seqrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN LATERAL (
         SELECT target.relname, a.attname
           FROM pg_catalog.pg_depend d
           JOIN pg_catalog.pg_class target ON target.oid = d.refobjid
           JOIN pg_catalog.pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
          WHERE d.classid = 'pg_catalog.pg_class'::regclass AND d.objid = c.oid
            AND d.refclassid = 'pg_catalog.pg_class'::regclass
            AND d.deptype IN ('a', 'i') AND d.refobjsubid > 0
          ORDER BY target.relname, a.attname
          LIMIT 1
       ) owned ON true
      WHERE n.nspname = 'public'`,
  )
  const inheritance = await client.query<Record<string, unknown>>(
    `SELECT child.relname AS "child", parent.relname AS "parent", i.inhseqno AS "sequence"
       FROM pg_catalog.pg_inherits i
       JOIN pg_catalog.pg_class child ON child.oid = i.inhrelid
       JOIN pg_catalog.pg_namespace child_ns ON child_ns.oid = child.relnamespace
       JOIN pg_catalog.pg_class parent ON parent.oid = i.inhparent
       JOIN pg_catalog.pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
      WHERE child_ns.nspname = 'public' OR parent_ns.nspname = 'public'`,
  )
  const routines = await client.query<Record<string, unknown>>(
    `SELECT p.proname AS "name", p.prokind AS "kind",
            pg_catalog.pg_get_function_identity_arguments(p.oid) AS "identityArguments",
            pg_catalog.pg_get_function_result(p.oid) AS "result",
            l.lanname AS "language", p.provolatile AS "volatility",
            p.proparallel AS "parallel", p.proisstrict AS "strict",
            p.prosecdef AS "securityDefiner", p.proleakproof AS "leakproof",
            p.proretset AS "returnsSet", p.procost AS "cost", p.prorows AS "rows",
            COALESCE((SELECT array_agg(config_value ORDER BY config_value)
                        FROM unnest(p.proconfig) AS config_value), ARRAY[]::text[]) AS "configuration",
            COALESCE((SELECT array_agg(acl_value::text ORDER BY acl_value::text)
                        FROM unnest(p.proacl) AS acl_value), ARRAY[]::text[]) AS "acl",
            p.prosrc AS "source", p.probin AS "binary",
            CASE WHEN p.prokind IN ('f', 'p')
                 THEN pg_catalog.pg_get_functiondef(p.oid) ELSE NULL END AS "definition"
       FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      WHERE n.nspname = 'public'
        AND NOT EXISTS (
          SELECT 1
            FROM pg_catalog.pg_depend extension_dependency
           WHERE extension_dependency.classid = 'pg_catalog.pg_proc'::regclass
             AND extension_dependency.objid = p.oid
             AND extension_dependency.refclassid = 'pg_catalog.pg_extension'::regclass
             AND extension_dependency.deptype = 'e'
        )`,
  )
  const triggers = await client.query<Record<string, unknown>>(
    `SELECT c.relname AS "table",
            CASE WHEN t.tgisinternal THEN NULL ELSE t.tgname END AS "name",
            t.tgisinternal AS "internal", t.tgtype AS "type", t.tgenabled AS "enabled",
            t.tgdeferrable AS "deferrable", t.tginitdeferred AS "initiallyDeferred",
            x.conname AS "constraint", ref_ns.nspname AS "referencedSchema",
            ref.relname AS "referencedTable", fn_ns.nspname AS "functionSchema",
            fn.proname AS "functionName",
            pg_catalog.pg_get_function_identity_arguments(fn.oid) AS "functionIdentityArguments",
            CASE WHEN t.tgisinternal THEN NULL
                 ELSE pg_catalog.pg_get_triggerdef(t.oid, false) END AS "definition"
       FROM pg_catalog.pg_trigger t
       JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_catalog.pg_proc fn ON fn.oid = t.tgfoid
       JOIN pg_catalog.pg_namespace fn_ns ON fn_ns.oid = fn.pronamespace
       LEFT JOIN pg_catalog.pg_constraint x ON x.oid = t.tgconstraint
       LEFT JOIN pg_catalog.pg_class ref ON ref.oid = t.tgconstrrelid
       LEFT JOIN pg_catalog.pg_namespace ref_ns ON ref_ns.oid = ref.relnamespace
      WHERE n.nspname = 'public' AND (NOT t.tgisinternal OR t.tgenabled <> 'O')`,
  )
  const rules = await client.query<Record<string, unknown>>(
    `SELECT c.relname AS "table", r.rulename AS "name", r.ev_enabled AS "enabled",
            pg_catalog.pg_get_ruledef(r.oid, false) AS "definition"
       FROM pg_catalog.pg_rewrite r
       JOIN pg_catalog.pg_class c ON c.oid = r.ev_class
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND r.rulename <> '_RETURN'`,
  )
  const policies = await client.query<Record<string, unknown>>(
    `SELECT c.relname AS "table", p.polname AS "name", p.polcmd AS "command",
            p.polpermissive AS "permissive",
            COALESCE((SELECT array_agg(CASE WHEN role_oid = 0 THEN 'public'
                                           ELSE pg_catalog.pg_get_userbyid(role_oid) END
                                       ORDER BY CASE WHEN role_oid = 0 THEN 'public'
                                                     ELSE pg_catalog.pg_get_userbyid(role_oid) END)
                        FROM unnest(p.polroles) AS role_oid), ARRAY[]::text[]) AS "roles",
            pg_catalog.pg_get_expr(p.polqual, p.polrelid, false) AS "qual",
            pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid, false) AS "withCheck"
       FROM pg_catalog.pg_policy p
       JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'`,
  )
  const types = await client.query<Record<string, unknown>>(
    `SELECT t.typname AS "name", t.typtype AS "kind", t.typcategory AS "category",
            t.typispreferred AS "preferred", t.typdelim AS "delimiter",
            t.typnotnull AS "notNull",
            CASE WHEN t.typdefaultbin IS NOT NULL
                 THEN pg_catalog.pg_get_expr(t.typdefaultbin, 0, false)
                 ELSE t.typdefault END AS "defaultExpression",
            CASE WHEN t.typbasetype = 0 THEN NULL
                 ELSE pg_catalog.format_type(t.typbasetype, t.typtypmod) END AS "baseType",
            CASE WHEN t.typcollation = 0 THEN NULL
                 ELSE cn.nspname || '.' || coll.collname END AS "collation",
            COALESCE((SELECT array_agg(acl_value::text ORDER BY acl_value::text)
                        FROM unnest(t.typacl) AS acl_value), ARRAY[]::text[]) AS "acl",
            COALESCE((SELECT jsonb_agg(jsonb_build_object('label', e.enumlabel, 'order', e.enumsortorder)
                                       ORDER BY e.enumsortorder)
                        FROM pg_catalog.pg_enum e WHERE e.enumtypid = t.oid), '[]'::jsonb) AS "enumLabels",
            COALESCE((SELECT jsonb_agg(jsonb_build_object(
                                         'name', dc.conname,
                                         'validated', dc.convalidated,
                                         'definition', pg_catalog.pg_get_constraintdef(dc.oid, false))
                                       ORDER BY dc.conname)
                        FROM pg_catalog.pg_constraint dc
                       WHERE dc.contypid = t.oid), '[]'::jsonb) AS "domainConstraints",
            CASE WHEN r.rngsubtype = 0 THEN NULL
                 ELSE pg_catalog.format_type(r.rngsubtype, NULL) END AS "rangeSubtype",
            CASE WHEN r.rngcollation = 0 THEN NULL
                 ELSE rn.nspname || '.' || rc.collname END AS "rangeCollation",
            opc.opcname AS "rangeOperatorClass",
            CASE WHEN r.rngcanonical = 0 THEN NULL ELSE r.rngcanonical::regprocedure::text END AS "rangeCanonical",
            CASE WHEN r.rngsubdiff = 0 THEN NULL ELSE r.rngsubdiff::regprocedure::text END AS "rangeSubdiff",
            CASE WHEN r.rngmultitypid = 0 THEN NULL
                 ELSE pg_catalog.format_type(r.rngmultitypid, NULL) END AS "multirangeType"
       FROM pg_catalog.pg_type t
       JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
       LEFT JOIN pg_catalog.pg_class composite ON composite.oid = t.typrelid
       LEFT JOIN pg_catalog.pg_collation coll ON coll.oid = t.typcollation
       LEFT JOIN pg_catalog.pg_namespace cn ON cn.oid = coll.collnamespace
       LEFT JOIN pg_catalog.pg_range r ON r.rngtypid = t.oid
       LEFT JOIN pg_catalog.pg_collation rc ON rc.oid = r.rngcollation
       LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid = rc.collnamespace
       LEFT JOIN pg_catalog.pg_opclass opc ON opc.oid = r.rngsubopc
      WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd', 'r', 'm', 'c')
        AND (t.typtype <> 'c' OR composite.relkind = 'c')
        AND NOT EXISTS (
          SELECT 1
            FROM pg_catalog.pg_depend extension_dependency
           WHERE extension_dependency.classid = 'pg_catalog.pg_type'::regclass
             AND extension_dependency.objid = t.oid
             AND extension_dependency.refclassid = 'pg_catalog.pg_extension'::regclass
             AND extension_dependency.deptype = 'e'
        )`,
  )
  const ownedRelations = new Set(relations.rows.map((row) => String(row.table)))
  const ownedTableRows = (rows: readonly Record<string, unknown>[]) =>
    rows.filter((row) => ownedRelations.has(String(row.table)))
  return Object.freeze({
    relations: Object.freeze(sortCatalogRows(relations.rows)),
    columns: Object.freeze(sortCatalogRows(ownedTableRows(columns.rows))),
    constraints: Object.freeze(sortCatalogRows(ownedTableRows(constraints.rows))),
    indexes: Object.freeze(sortCatalogRows(ownedTableRows(indexes.rows))),
    views: Object.freeze(sortCatalogRows(views.rows.filter((row) => ownedRelations.has(String(row.name))))),
    sequences: Object.freeze(sortCatalogRows(sequences.rows.filter((row) => ownedRelations.has(String(row.name))))),
    inheritance: Object.freeze(sortCatalogRows(inheritance.rows.filter((row) =>
      ownedRelations.has(String(row.child)) || ownedRelations.has(String(row.parent))))),
    routines: Object.freeze(sortCatalogRows(routines.rows)),
    triggers: Object.freeze(sortCatalogRows(ownedTableRows(triggers.rows))),
    // PostgreSQL event triggers and extensions are database/provider-owned ambient
    // capabilities. They are intentionally outside the AOPS application lineage;
    // exact AOPS-owned post-DDL verification still catches mutations to AOPS objects.
    eventTriggers: Object.freeze([]),
    rules: Object.freeze(sortCatalogRows(ownedTableRows(rules.rows))),
    policies: Object.freeze(sortCatalogRows(ownedTableRows(policies.rows))),
    types: Object.freeze(sortCatalogRows(types.rows)),
    extensions: Object.freeze([]),
  })
}

export function fingerprintCommunityStrictCatalog(projection: CommunityStrictCatalogProjectionV1): string {
  // Column position is a restore/DDL-history artifact: PostgreSQL preserves
  // attnum gaps and append order even when the effective table contract is
  // identical. Keep ordinal in the projection for deterministic data
  // sentinels, but bind lineage identity to the semantic column contract.
  const columns = sortCatalogRows(projection.columns.map((column) => {
    const { ordinal: _ordinal, ...semanticColumn } = column
    return semanticColumn
  }))
  return sha256Json({ ...projection, columns, eventTriggers: [], extensions: [] })
}

function relationNames(projection: CommunityStrictCatalogProjectionV1): Set<string> {
  return new Set(projection.relations
    .filter((row) => row.kind === 'r' || row.kind === 'p')
    .map((row) => String(row.table)))
}

function isEmptyCatalogProjection(projection: CommunityStrictCatalogProjectionV1): boolean {
  return Object.entries(projection)
    .filter(([section]) => section !== 'eventTriggers' && section !== 'extensions')
    .every(([, rows]) => rows.length === 0)
}

async function readLegacyRootState(params: {
  client: CommunityStrictPgClient
  root: CommunityStrictMigrationRootV1
  relations: ReadonlySet<string>
}): Promise<CommunityStrictRootState> {
  if (!params.relations.has(params.root.migrationTable)) {
    return { rootId: params.root.id, migrationTablePresent: false, rows: [] }
  }
  const table = quoteIdentifier(params.root.migrationTable)
  const hashSelection = params.root.legacyHashColumn ? 'sha256' : 'NULL::text AS sha256'
  const result = await params.client.query<{ tag: unknown; sha256: unknown; appliedAt: unknown }>(
    `SELECT tag, ${hashSelection},
            to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z' AS "appliedAt"
       FROM public.${table}`,
  )
  const byTag = new Map<string, CommunityStrictLegacyMigrationRow>()
  for (const raw of result.rows) {
    const tag = String(raw.tag ?? '')
    if (byTag.has(tag)) throw new Error(`community_strict_legacy_duplicate_tag:${params.root.id}:${tag}`)
    const migration = params.root.migrations.find((candidate) => candidate.tag === tag)
    if (!migration) throw new Error(`community_strict_legacy_unknown_tag:${params.root.id}:${tag}`)
    const appliedAt = String(raw.appliedAt ?? '')
    if (!CANONICAL_APPLIED_AT.test(appliedAt)) {
      throw new Error(`community_strict_legacy_applied_at_invalid:${params.root.id}:${tag}`)
    }
    const digest = raw.sha256 === null || raw.sha256 === undefined ? null : String(raw.sha256)
    if (params.root.legacyHashColumn && digest !== migration.sha256) {
      throw new Error(`community_strict_legacy_hash_mismatch:${params.root.id}:${tag}`)
    }
    byTag.set(tag, { tag, sha256: digest, appliedAt })
  }
  const rows: CommunityStrictLegacyMigrationRow[] = []
  for (const migration of params.root.migrations) {
    const row = byTag.get(migration.tag)
    if (!row) break
    rows.push(row)
  }
  if (rows.length !== byTag.size) {
    throw new Error(`community_strict_legacy_non_prefix:${params.root.id}`)
  }
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].appliedAt < rows[index - 1].appliedAt) {
      throw new Error(`community_strict_legacy_reordered:${params.root.id}:${rows[index].tag}`)
    }
  }
  return { rootId: params.root.id, migrationTablePresent: true, rows }
}

async function readStrictReceipts(
  client: CommunityStrictPgClient,
  relations: ReadonlySet<string>,
): Promise<readonly StrictReceiptRow[] | null> {
  if (!relations.has(STRICT_RECEIPT_TABLE)) return null
  const result = await client.query<{
    rootId: unknown
    rootOrdinal: unknown
    migrationIdx: unknown
    tag: unknown
    sqlSha256: unknown
    journalSha256: unknown
    appliedAt: unknown
    provenance: unknown
  }>(
    `SELECT root_id AS "rootId", root_ordinal AS "rootOrdinal", migration_idx AS "migrationIdx",
            tag, sql_sha256 AS "sqlSha256", journal_sha256 AS "journalSha256",
            to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z' AS "appliedAt",
            provenance
       FROM public.${STRICT_RECEIPT_TABLE}
      ORDER BY root_ordinal, migration_idx`,
  )
  const rows = result.rows.map((row) => ({
    rootId: String(row.rootId),
    rootOrdinal: Number(row.rootOrdinal),
    migrationIdx: Number(row.migrationIdx),
    tag: String(row.tag),
    sqlSha256: String(row.sqlSha256),
    journalSha256: String(row.journalSha256),
    appliedAt: String(row.appliedAt),
    provenance: String(row.provenance) as StrictReceiptRow['provenance'],
  }))
  for (const [index, row] of rows.entries()) {
    if (!CANONICAL_APPLIED_AT.test(row.appliedAt)) {
      throw new Error(`community_strict_receipt_applied_at_invalid:${index}`)
    }
  }
  return rows
}

async function readStrictState(
  client: CommunityStrictPgClient,
  relations: ReadonlySet<string>,
  allowUninitialized = false,
): Promise<StrictStateRow | null> {
  if (!relations.has(STRICT_STATE_TABLE)) return null
  const result = await client.query<{
    policyId: unknown
    inventorySha256: unknown
    convergenceSha256: unknown
    lineageId: unknown
    schemaFingerprintSha256: unknown
    receiptFingerprintSha256: unknown
    strictReceiptRowsSha256: unknown
  }>(
    `SELECT policy_id AS "policyId", inventory_sha256 AS "inventorySha256",
            convergence_sha256 AS "convergenceSha256",
            lineage_id AS "lineageId", schema_fingerprint_sha256 AS "schemaFingerprintSha256",
            receipt_fingerprint_sha256 AS "receiptFingerprintSha256",
            strict_receipt_rows_sha256 AS "strictReceiptRowsSha256"
       FROM public.${STRICT_STATE_TABLE} WHERE id = 1`,
  )
  if (allowUninitialized && result.rows.length === 0) return null
  if (result.rows.length !== 1) throw new Error('community_strict_state_row_invalid')
  const row = result.rows[0]
  return {
    policyId: String(row.policyId),
    inventorySha256: String(row.inventorySha256),
    convergenceSha256: String(row.convergenceSha256),
    lineageId: String(row.lineageId),
    schemaFingerprintSha256: String(row.schemaFingerprintSha256),
    receiptFingerprintSha256: String(row.receiptFingerprintSha256),
    strictReceiptRowsSha256: String(row.strictReceiptRowsSha256),
  }
}

async function observeState(params: {
  client: CommunityStrictPgClient
  policy: CommunityStrictMigrationPolicyV1
  allowUninitializedStrictTables?: boolean
}): Promise<ObservedState> {
  const projection = await readCommunityStrictCatalogProjection(params.client)
  const names = relationNames(projection)
  const roots: CommunityStrictRootState[] = []
  for (const root of params.policy.roots) {
    roots.push(await readLegacyRootState({ client: params.client, root, relations: names }))
  }
  const hasReceipt = names.has(STRICT_RECEIPT_TABLE)
  const hasState = names.has(STRICT_STATE_TABLE)
  if (hasReceipt !== hasState) throw new Error('community_strict_tables_partial')
  return {
    projection,
    schemaFingerprintSha256: fingerprintCommunityStrictCatalog(projection),
    roots,
    strictReceipts: await readStrictReceipts(params.client, names),
    strictState: await readStrictState(params.client, names, params.allowUninitializedStrictTables),
    relationNames: names,
  }
}

export function fingerprintCommunityStrictReceipts(
  policy: CommunityStrictMigrationPolicyV1,
  roots: readonly CommunityStrictRootState[],
): string {
  const tuples = policy.roots.flatMap((root, rootOrdinal) => {
    const observed = roots[rootOrdinal]
    if (!observed || observed.rootId !== root.id) {
      throw new Error(`community_strict_receipt_root_order_invalid:${root.id}`)
    }
    return observed.rows.map((row, migrationIdx) => {
      const migration = root.migrations[migrationIdx]
      if (!migration || row.tag !== migration.tag) {
        throw new Error(`community_strict_receipt_migration_order_invalid:${root.id}:${migrationIdx}`)
      }
      return {
        rootOrdinal,
        rootId: root.id,
        migrationIdx,
        tag: migration.tag,
        sqlSha256: migration.sha256,
      }
    })
  })
  return sha256Json(tuples)
}

function fingerprintStrictReceiptRows(receipts: readonly StrictReceiptRow[]): string {
  return sha256Json(receipts)
}

function expectedStrictReceiptRows(
  policy: CommunityStrictMigrationPolicyV1,
  roots: readonly CommunityStrictRootState[],
): Array<Omit<StrictReceiptRow, 'provenance' | 'journalSha256'>> {
  return policy.roots.flatMap((root, rootOrdinal) => roots[rootOrdinal].rows.map((row, migrationIdx) => ({
    rootId: root.id,
    rootOrdinal,
    migrationIdx,
    tag: root.migrations[migrationIdx].tag,
    sqlSha256: root.migrations[migrationIdx].sha256,
    appliedAt: row.appliedAt,
  })))
}

function assertStrictReceipts(params: {
  policy: CommunityStrictMigrationPolicyV1
  observed: ObservedState
  lineage: CommunityStrictLineageV1
}): void {
  const receipts = params.observed.strictReceipts
  const state = params.observed.strictState
  if (!receipts || !state) throw new Error('community_strict_receipts_missing')
  const expected = expectedStrictReceiptRows(params.policy, params.observed.roots)
  if (receipts.length !== expected.length) throw new Error('community_strict_receipt_count_mismatch')
  receipts.forEach((receipt, index) => {
    const wanted = expected[index]
    if (!wanted || receipt.rootId !== wanted.rootId || receipt.rootOrdinal !== wanted.rootOrdinal ||
        receipt.migrationIdx !== wanted.migrationIdx || receipt.tag !== wanted.tag ||
        receipt.sqlSha256 !== wanted.sqlSha256 ||
        !params.policy.roots[receipt.rootOrdinal]?.journalSha256History.includes(receipt.journalSha256) ||
        receipt.appliedAt !== wanted.appliedAt ||
        !['applied', 'exact-lineage-adoption'].includes(receipt.provenance)) {
      throw new Error(`community_strict_receipt_mismatch:${index}`)
    }
  })
  const receiptFingerprint = fingerprintCommunityStrictReceipts(params.policy, params.observed.roots)
  const strictReceiptRowsSha256 = fingerprintStrictReceiptRows(receipts)
  if (state.policyId !== params.lineage.policyId || state.inventorySha256 !== params.lineage.inventorySha256 ||
      state.convergenceSha256 !== params.lineage.convergenceSha256 ||
      state.lineageId !== params.lineage.id ||
      state.schemaFingerprintSha256 !== params.observed.schemaFingerprintSha256 ||
      state.receiptFingerprintSha256 !== receiptFingerprint ||
      state.strictReceiptRowsSha256 !== strictReceiptRowsSha256) {
    throw new Error('community_strict_state_mismatch')
  }
}

function classifyObservedState(params: {
  policy: CommunityStrictMigrationPolicyV1
  observed: ObservedState
  postgresMajor: number
}): ObservedClassification {
  const relationCount = params.observed.projection.relations.length
  const appliedCounts = params.observed.roots.map((root) => root.rows.length)
  if (isEmptyCatalogProjection(params.observed.projection) && appliedCounts.every((count) => count === 0) &&
      params.observed.strictReceipts === null && params.observed.strictState === null) {
    return 'empty-v1'
  }
  const lineage = params.policy.lineages.find((candidate) =>
    candidate.postgresMajor === params.postgresMajor &&
    candidate.relationCount === relationCount &&
    candidate.schemaFingerprintSha256 === params.observed.schemaFingerprintSha256 &&
    candidate.appliedCounts.every((count, index) => count === appliedCounts[index]),
  )
  if (!lineage) {
    const migrationTableCount = params.policy.roots
      .filter((root) => params.observed.relationNames.has(root.migrationTable)).length
    if (migrationTableCount > 0 && params.observed.strictReceipts === null &&
        params.observed.strictState === null) {
      const namedCountsMatch = params.policy.lineages.some((candidate) =>
        candidate.postgresMajor === params.postgresMajor &&
        candidate.appliedCounts.every((count, index) => count === appliedCounts[index]))
      if (namedCountsMatch) {
        throw new Error(`community_strict_lineage_unknown:${params.observed.schemaFingerprintSha256}`)
      }
      // Migration tables are the resumable source of truth. readLegacyRootState
      // has already proved every present root is a known, ordered prefix. The
      // target fingerprint and data sentinels still reject real schema drift.
      return { id: DATABASE_PREFIX_LINEAGE_ID, kind: 'database-prefix' }
    }
    if (migrationTableCount === 0 && !isEmptyCatalogProjection(params.observed.projection)) {
      throw new Error('community_strict_lineage_heuristic_only')
    }
    throw new Error(`community_strict_lineage_unknown:${params.observed.schemaFingerprintSha256}`)
  }
  if (lineage.kind === 'strict') {
    assertStrictReceipts({ policy: params.policy, observed: params.observed, lineage })
  } else if (params.observed.strictReceipts !== null || params.observed.strictState !== null) {
    throw new Error('community_strict_legacy_lineage_contains_strict_state')
  }
  return lineage
}

async function readPostgresMajor(client: CommunityStrictPgClient): Promise<number> {
  const result = await client.query<{ major: unknown }>(
    `SELECT current_setting('server_version_num')::integer / 10000 AS major`,
  )
  const major = Number(result.rows[0]?.major)
  if (!Number.isSafeInteger(major)) throw new Error('community_strict_postgres_version_invalid')
  return major
}

async function configureCanonicalSession(client: CommunityStrictPgClient): Promise<void> {
  await client.query(`SET SESSION TIME ZONE 'UTC'`)
  await client.query(`SET SESSION DateStyle TO 'ISO, YMD'`)
  await client.query(`SET SESSION IntervalStyle TO 'iso_8601'`)
  await client.query(`SET SESSION extra_float_digits TO 3`)
  await client.query(`SET SESSION standard_conforming_strings TO on`)
  await client.query(`SET SESSION client_encoding TO 'UTF8'`)
  await client.query(`SET SESSION bytea_output TO 'hex'`)
  await client.query(`SET SESSION lock_timeout TO '30s'`)
  // Keep public as the DDL target while leaving pg_catalog implicit-first. Listing
  // pg_catalog after public would let extension functions shadow built-ins and
  // produce a different stored default-expression lineage from the legacy runners.
  await client.query('SET SESSION search_path TO public')
}

async function lockObservedRelations(
  client: CommunityStrictPgClient,
  projection: CommunityStrictCatalogProjectionV1,
): Promise<void> {
  const tables = [...relationNames(projection)].sort(codepointCompare)
  for (const table of tables) {
    await client.query(`LOCK TABLE public.${quoteIdentifier(table)} IN ACCESS EXCLUSIVE MODE`)
  }
}

async function normalizeCommunityOwnedRelationPrivileges(
  client: CommunityStrictPgClient,
): Promise<number> {
  const result = await client.query<{
    table: unknown
    kind: unknown
    grantee: unknown
    publicGrantee: unknown
  }>(
    `SELECT DISTINCT relation.relname AS "table", relation.relkind AS "kind",
            CASE WHEN expanded_acl.grantee = 0 THEN NULL
                 ELSE pg_catalog.pg_get_userbyid(expanded_acl.grantee) END AS "grantee",
            expanded_acl.grantee = 0 AS "publicGrantee"
       FROM pg_catalog.pg_class relation
       JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS expanded_acl
      WHERE namespace.nspname = 'public'
        AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
        AND expanded_acl.grantee <> relation.relowner
        AND NOT EXISTS (
          SELECT 1
            FROM pg_catalog.pg_depend extension_dependency
           WHERE extension_dependency.classid = 'pg_catalog.pg_class'::regclass
             AND extension_dependency.objid = relation.oid
             AND extension_dependency.refclassid = 'pg_catalog.pg_extension'::regclass
             AND extension_dependency.deptype = 'e'
        )
      ORDER BY relation.relname, relation.relkind, "publicGrantee", "grantee"`,
  )
  for (const row of result.rows) {
    const table = quoteIdentifier(String(row.table))
    const objectKind = String(row.kind) === 'S' ? 'SEQUENCE' : 'TABLE'
    const principal = row.publicGrantee === true ? 'PUBLIC' : quoteIdentifier(String(row.grantee))
    await client.query(`REVOKE ALL PRIVILEGES ON ${objectKind} public.${table} FROM ${principal}`)
  }
  return result.rows.length
}

async function captureDataSentinels(
  client: CommunityStrictPgClient,
  currentProjection: CommunityStrictCatalogProjectionV1,
  policy: CommunityStrictMigrationPolicyV1,
  baselineProjection: CommunityStrictCatalogProjectionV1 = currentProjection,
): Promise<CommunityStrictDataSentinel[]> {
  const excluded = new Set([
    STRICT_RECEIPT_TABLE,
    STRICT_STATE_TABLE,
    ...policy.roots.map((root) => root.migrationTable),
  ])
  const currentTables = relationNames(currentProjection)
  const tables = [...relationNames(baselineProjection)]
    .filter((table) => !excluded.has(table))
    .sort(codepointCompare)
  const sentinels: CommunityStrictDataSentinel[] = []
  for (const [tableIndex, table] of tables.entries()) {
    if (!currentTables.has(table)) throw new Error(`community_strict_data_table_missing:${table}`)
    const columns = baselineProjection.columns
      .filter((row) => String(row.table) === table)
      .sort((left, right) => Number(left.ordinal) - Number(right.ordinal))
      .map((row) => String(row.column))
    const currentColumns = new Set(currentProjection.columns
      .filter((row) => String(row.table) === table)
      .map((row) => String(row.column)))
    for (const column of columns) {
      if (!currentColumns.has(column)) throw new Error(`community_strict_data_column_missing:${table}:${column}`)
    }
    const values = columns.map((column) => `row_value.${quoteIdentifier(column)}`).join(', ')
    const cursor = `aops_community_sentinel_${tableIndex}`
    await client.query(
      `DECLARE ${cursor} NO SCROLL CURSOR FOR
       SELECT row_json AS "rowJson"
         FROM (SELECT jsonb_build_array(${values})::text AS row_json
                 FROM public.${quoteIdentifier(table)} AS row_value) sentinel_rows
        ORDER BY row_json`,
    )
    const digest = createHash('sha256')
    let rowCount = 0n
    try {
      for (;;) {
        const result = await client.query<{ rowJson: unknown }>(`FETCH FORWARD 512 FROM ${cursor}`)
        if (result.rows.length === 0) break
        for (const row of result.rows) {
          const bytes = Buffer.from(String(row.rowJson), 'utf8')
          digest.update(`${bytes.length}:`, 'utf8')
          digest.update(bytes)
          rowCount += 1n
        }
      }
    } finally {
      await client.query(`CLOSE ${cursor}`).catch(() => undefined)
    }
    sentinels.push({
      table,
      columns,
      rowCount: rowCount.toString(),
      rowDigest: digest.digest('hex'),
    })
  }
  return sentinels
}

function createStateReceipt(params: {
  policy: CommunityStrictMigrationPolicyV1
  lineageId: string
  observed: ObservedState
  dataSentinels: readonly CommunityStrictDataSentinel[]
}): CommunityStrictStateReceiptV1 {
  const receiptFingerprintSha256 = fingerprintCommunityStrictReceipts(params.policy, params.observed.roots)
  const base = {
    schemaVersion: 1 as const,
    policyId: params.policy.id,
    inventorySha256: params.policy.inventorySha256,
    convergenceSha256: params.policy.convergenceSha256,
    lineageId: params.lineageId,
    schemaFingerprintSha256: params.observed.schemaFingerprintSha256,
    receiptFingerprintSha256,
    strictReceiptRowsSha256: params.observed.strictReceipts === null
      ? null
      : fingerprintStrictReceiptRows(params.observed.strictReceipts),
    roots: params.observed.roots,
    dataSentinels: params.dataSentinels,
  }
  return { ...base, stateFingerprintSha256: sha256Json(base) }
}

type CommunityStrictManagedBackupGuard = Readonly<{
  fd: number
  path: string
  parentPath: string
  device: bigint
  inode: bigint
  size: bigint
  parentDevice: bigint
  parentInode: bigint
  sha256: string
}>

type CommunityStrictManagedBackupRescue = {
  fd: number
  closed: boolean
  path: string
  device: bigint
  inode: bigint
  size: bigint
  sha256: string
}

function hashHeldFile(fd: number, size: bigint): string {
  if (size < 1n || size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('community_strict_backup_file_invalid')
  }
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(SNAPSHOT_HASH_BUFFER_BYTES)
  let position = 0
  while (position < Number(size)) {
    const count = readSync(fd, buffer, 0, Math.min(buffer.length, Number(size) - position), position)
    if (count < 1) throw new Error('community_strict_backup_file_short_read')
    hash.update(buffer.subarray(0, count))
    position += count
  }
  return `sha256:${hash.digest('hex')}`
}

function openManagedBackupGuard(
  backupPath: string,
  expectedByteLength: number,
  expectedSha256: string,
): CommunityStrictManagedBackupGuard {
  const parentPath = path.dirname(backupPath)
  const parentStats = lstatSync(parentPath, { bigint: true })
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink() ||
      !sameResolvedPath(realpathSync.native(parentPath), parentPath)) {
    throw new Error('community_strict_backup_root_invalid')
  }
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
  const fd = openSync(backupPath, constants.O_RDONLY | noFollow)
  try {
    const pathStats = lstatSync(backupPath, { bigint: true })
    const heldStats = fstatSync(fd, { bigint: true })
    if (!pathStats.isFile() || pathStats.isSymbolicLink() || heldStats.nlink !== 1n ||
        pathStats.dev !== heldStats.dev || pathStats.ino !== heldStats.ino ||
        heldStats.size !== BigInt(expectedByteLength) ||
        !sameResolvedPath(realpathSync.native(backupPath), backupPath) ||
        hashHeldFile(fd, heldStats.size) !== expectedSha256) {
      throw new Error('community_strict_backup_file_mismatch')
    }
    return {
      fd,
      path: backupPath,
      parentPath,
      device: heldStats.dev,
      inode: heldStats.ino,
      size: heldStats.size,
      parentDevice: parentStats.dev,
      parentInode: parentStats.ino,
      sha256: expectedSha256,
    }
  } catch (error) {
    closeSync(fd)
    throw error
  }
}

function assertManagedBackupGuard(guard: CommunityStrictManagedBackupGuard): void {
  const parentStats = lstatSync(guard.parentPath, { bigint: true })
  const pathStats = lstatSync(guard.path, { bigint: true })
  const heldStats = fstatSync(guard.fd, { bigint: true })
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink() ||
      parentStats.dev !== guard.parentDevice || parentStats.ino !== guard.parentInode ||
      !sameResolvedPath(realpathSync.native(guard.parentPath), guard.parentPath) ||
      !pathStats.isFile() || pathStats.isSymbolicLink() ||
      pathStats.dev !== guard.device || pathStats.ino !== guard.inode ||
      heldStats.dev !== guard.device || heldStats.ino !== guard.inode ||
      heldStats.size !== guard.size || heldStats.nlink !== 1n ||
      !sameResolvedPath(realpathSync.native(guard.path), guard.path) ||
      hashHeldFile(guard.fd, guard.size) !== guard.sha256) {
    throw new Error('community_strict_backup_guard_changed')
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

function assertManagedBackupRescue(
  guard: CommunityStrictManagedBackupGuard,
  rescue: CommunityStrictManagedBackupRescue,
): void {
  if (rescue.closed) throw new Error('community_strict_backup_rescue_closed')
  const parentStats = lstatSync(guard.parentPath, { bigint: true })
  const pathStats = lstatSync(rescue.path, { bigint: true })
  const heldStats = fstatSync(rescue.fd, { bigint: true })
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink() ||
      parentStats.dev !== guard.parentDevice || parentStats.ino !== guard.parentInode ||
      !sameResolvedPath(realpathSync.native(guard.parentPath), guard.parentPath) ||
      !pathStats.isFile() || pathStats.isSymbolicLink() ||
      pathStats.dev !== rescue.device || pathStats.ino !== rescue.inode ||
      heldStats.dev !== rescue.device || heldStats.ino !== rescue.inode ||
      heldStats.size !== rescue.size || heldStats.nlink !== 1n ||
      !sameResolvedPath(realpathSync.native(rescue.path), rescue.path) ||
      hashHeldFile(rescue.fd, rescue.size) !== rescue.sha256) {
    throw new Error('community_strict_backup_rescue_changed')
  }
}

function closeManagedBackupRescue(rescue: CommunityStrictManagedBackupRescue): void {
  if (!rescue.closed) {
    closeSync(rescue.fd)
    rescue.closed = true
  }
}

function stageManagedBackupRescue(
  guard: CommunityStrictManagedBackupGuard,
): CommunityStrictManagedBackupRescue {
  assertManagedBackupGuard(guard)
  const rescuePath = path.join(
    guard.parentPath,
    `.${path.basename(guard.path)}.${process.pid}.${randomBytes(8).toString('hex')}.commit-rescue`,
  )
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
  const fd = openSync(
    rescuePath,
    constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | noFollow,
    0o600,
  )
  let keep = false
  try {
    const buffer = Buffer.allocUnsafe(SNAPSHOT_HASH_BUFFER_BYTES)
    let position = 0
    while (position < Number(guard.size)) {
      const count = readSync(
        guard.fd,
        buffer,
        0,
        Math.min(buffer.length, Number(guard.size) - position),
        position,
      )
      if (count < 1) throw new Error('community_strict_backup_rescue_short_read')
      let written = 0
      while (written < count) {
        const writeCount = writeSync(fd, buffer, written, count - written, position + written)
        if (writeCount < 1) throw new Error('community_strict_backup_rescue_short_write')
        written += writeCount
      }
      position += count
    }
    fsyncSync(fd)
    const stats = fstatSync(fd, { bigint: true })
    if (stats.size !== guard.size || hashHeldFile(fd, stats.size) !== guard.sha256) {
      throw new Error('community_strict_backup_rescue_mismatch')
    }
    const rescue: CommunityStrictManagedBackupRescue = {
      fd,
      closed: false,
      path: rescuePath,
      device: stats.dev,
      inode: stats.ino,
      size: stats.size,
      sha256: guard.sha256,
    }
    fsyncDirectoryBestEffortOnWindows(guard.parentPath)
    assertManagedBackupRescue(guard, rescue)
    keep = true
    return rescue
  } finally {
    if (!keep) {
      closeSync(fd)
      rmSync(rescuePath, { force: true })
      fsyncDirectoryBestEffortOnWindows(guard.parentPath)
    }
  }
}

function discardManagedBackupRescue(
  guard: CommunityStrictManagedBackupGuard,
  rescue: CommunityStrictManagedBackupRescue,
): void {
  assertManagedBackupRescue(guard, rescue)
  closeManagedBackupRescue(rescue)
  rmSync(rescue.path, { force: true })
  fsyncDirectoryBestEffortOnWindows(guard.parentPath)
}

function preserveManagedBackupAfterCommit(
  guard: CommunityStrictManagedBackupGuard,
  rescue: CommunityStrictManagedBackupRescue,
): { preservedPath: string; consumed: boolean } {
  assertManagedBackupRescue(guard, rescue)
  if (!existsSync(guard.path)) {
    try {
      linkSync(rescue.path, guard.path)
      fsyncDirectoryBestEffortOnWindows(guard.parentPath)
      closeManagedBackupRescue(rescue)
      rmSync(rescue.path, { force: true })
      fsyncDirectoryBestEffortOnWindows(guard.parentPath)
      return { preservedPath: guard.path, consumed: true }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  return { preservedPath: rescue.path, consumed: false }
}

function validEvidenceText(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= maximumLength &&
    !/[\u0000-\u001f\u007f]/.test(value)
}

function validEvidenceReference(value: unknown, maximumLength: number): value is string {
  return validEvidenceText(value, maximumLength) && !value.includes('?') &&
    !/^(?:[a-z][a-z0-9+.-]*:)?\/\/[^/\s]*@/i.test(value) &&
    !/(?:token|secret|password|signature|credential|sig)\s*=/i.test(value)
}

async function verifySnapshotEvidence(params: {
  evidencePath: string | undefined
  preflight: CommunityStrictStateReceiptV1
  policy: CommunityStrictMigrationPolicyV1
  plan: CommunityStrictMigrationPlanBindingV1
  snapshotPolicy: CommunityStrictSnapshotPolicyV1
}): Promise<{
  evidence: CommunityStrictSnapshotEvidenceV1
  evidenceSha256: string
  managedBackupGuard: CommunityStrictManagedBackupGuard | null
}> {
  if (!params.evidencePath) throw new Error('community_strict_snapshot_evidence_required')
  const evidencePath = path.resolve(params.evidencePath)
  if (!existsSync(evidencePath)) throw new Error('community_strict_snapshot_evidence_invalid')
  const evidenceStats = lstatSync(evidencePath)
  if (!evidenceStats.isFile() || evidenceStats.isSymbolicLink() || evidenceStats.size < 1 ||
      evidenceStats.size > MAX_SNAPSHOT_EVIDENCE_BYTES ||
      !sameResolvedPath(realpathSync.native(evidencePath), evidencePath)) {
    throw new Error('community_strict_snapshot_evidence_invalid')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(evidencePath, 'utf8')) as unknown
  } catch {
    throw new Error('community_strict_snapshot_evidence_invalid')
  }
  if (!isRecord(parsed)) throw new Error('community_strict_snapshot_evidence_invalid')
  const commonKeys = [
    'schemaVersion', 'kind', 'evidencePolicy', 'createdAt', 'acceptedPlanSha256',
    'sourceMigrationStateFingerprintSha256',
    'sourceLineageId',
    'sourceSchemaFingerprintSha256',
    'sourceReceiptFingerprintSha256',
    'sourceDataFingerprintSha256',
    'sourceStateFingerprintSha256',
    'targetInventorySha256',
  ]
  const sourceDataFingerprintSha256 = sha256Json(params.preflight.dataSentinels)
  if (parsed.schemaVersion !== 1 || Number.isNaN(Date.parse(String(parsed.createdAt))) ||
      parsed.acceptedPlanSha256 !== params.plan.planSha256 ||
      parsed.sourceMigrationStateFingerprintSha256 !== params.plan.sourceFingerprintSha256 ||
      parsed.sourceLineageId !== params.preflight.lineageId ||
      parsed.sourceSchemaFingerprintSha256 !== params.preflight.schemaFingerprintSha256 ||
      parsed.sourceReceiptFingerprintSha256 !== params.preflight.receiptFingerprintSha256 ||
      parsed.sourceDataFingerprintSha256 !== sourceDataFingerprintSha256 ||
      parsed.sourceStateFingerprintSha256 !== params.preflight.stateFingerprintSha256 ||
      parsed.targetInventorySha256 !== params.policy.inventorySha256) {
    throw new Error('community_strict_snapshot_evidence_mismatch')
  }

  let managedBackupGuard: CommunityStrictManagedBackupGuard | null = null
  if (parsed.kind === 'managed-verified-backup') {
    assertExactKeys('community_strict_verified_backup_evidence', parsed, [
      ...commonKeys, 'backupPath', 'sha256', 'byteLength', 'restoreProof',
    ])
    if (parsed.evidencePolicy !== 'managed-restore-verified-v1' ||
        typeof parsed.backupPath !== 'string' || !path.isAbsolute(parsed.backupPath) ||
        typeof parsed.sha256 !== 'string' || !PREFIXED_SHA256.test(parsed.sha256) ||
        !Number.isSafeInteger(parsed.byteLength) || Number(parsed.byteLength) < 1 ||
        !isRecord(parsed.restoreProof)) {
      throw new Error('community_strict_verified_backup_evidence_invalid')
    }
    assertExactKeys('community_strict_backup_restore_proof', parsed.restoreProof, [
      'method', 'backupSha256', 'backupByteLength', 'restoredSchemaFingerprintSha256',
      'restoredReceiptFingerprintSha256', 'restoredDataFingerprintSha256',
      'restoredStateFingerprintSha256',
    ])
    if (parsed.restoreProof.method !== 'pg-restore-disposable-v1' ||
        parsed.restoreProof.backupSha256 !== parsed.sha256 ||
        parsed.restoreProof.backupByteLength !== parsed.byteLength ||
        parsed.restoreProof.restoredSchemaFingerprintSha256 !== params.preflight.schemaFingerprintSha256 ||
        parsed.restoreProof.restoredReceiptFingerprintSha256 !== params.preflight.receiptFingerprintSha256 ||
        parsed.restoreProof.restoredDataFingerprintSha256 !== sourceDataFingerprintSha256 ||
        parsed.restoreProof.restoredStateFingerprintSha256 !== params.preflight.stateFingerprintSha256) {
      throw new Error('community_strict_backup_restore_proof_mismatch')
    }
    const backupPath = path.resolve(parsed.backupPath)
    if (!existsSync(backupPath)) throw new Error('community_strict_backup_file_invalid')
    managedBackupGuard = openManagedBackupGuard(backupPath, Number(parsed.byteLength), String(parsed.sha256))
  } else if (parsed.kind === 'external-snapshot-attestation') {
    assertExactKeys('community_strict_external_snapshot_evidence', parsed, [
      ...commonKeys, 'recoveryOwner', 'provider', 'snapshotRef', 'snapshotDigest',
      'attestedBy', 'restoreInstructionsRef',
    ])
    if (params.snapshotPolicy !== 'managed-or-external-attested-v1') {
      throw new Error('community_strict_external_snapshot_policy_not_accepted')
    }
    if (parsed.evidencePolicy !== 'external-recovery-owner-attested-v1' ||
        parsed.recoveryOwner !== 'external' || !validEvidenceText(parsed.provider, 128) ||
        !validEvidenceReference(parsed.snapshotRef, 1_024) ||
        (parsed.snapshotDigest !== null &&
          (typeof parsed.snapshotDigest !== 'string' || !PREFIXED_SHA256.test(parsed.snapshotDigest))) ||
        !validEvidenceText(parsed.attestedBy, 256) ||
        !validEvidenceReference(parsed.restoreInstructionsRef, 2_048)) {
      throw new Error('community_strict_external_snapshot_evidence_invalid')
    }
  } else {
    throw new Error('community_strict_snapshot_evidence_kind_invalid')
  }
  const evidence = parsed as unknown as CommunityStrictSnapshotEvidenceV1
  return { evidence, evidenceSha256: sha256Json(evidence), managedBackupGuard }
}

async function ensureLegacyMigrationTable(
  client: CommunityStrictPgClient,
  root: CommunityStrictMigrationRootV1,
): Promise<void> {
  const hashColumn = root.legacyHashColumn ? ', sha256 text NOT NULL' : ''
  await client.query(
    `CREATE TABLE IF NOT EXISTS public.${quoteIdentifier(root.migrationTable)} (
       tag text PRIMARY KEY${hashColumn},
       applied_at timestamp with time zone NOT NULL DEFAULT now()
     )`,
  )
}

export async function ensureCommunityStrictMetadataTablesV1(
  client: CommunityStrictPgClient,
): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS public.${STRICT_RECEIPT_TABLE} (
       root_id text NOT NULL,
       root_ordinal integer NOT NULL,
       migration_idx integer NOT NULL,
       tag text NOT NULL,
       sql_sha256 text NOT NULL,
       journal_sha256 text NOT NULL,
       applied_at timestamp with time zone NOT NULL,
       provenance text NOT NULL CHECK (provenance IN ('applied', 'exact-lineage-adoption')),
       PRIMARY KEY (root_id, migration_idx),
       UNIQUE (root_id, tag),
       UNIQUE (root_ordinal, migration_idx)
     )`,
  )
  await client.query(
    `CREATE TABLE IF NOT EXISTS public.${STRICT_STATE_TABLE} (
       id smallint PRIMARY KEY CHECK (id = 1),
       policy_id text NOT NULL,
       inventory_sha256 text NOT NULL,
       convergence_sha256 text NOT NULL,
       lineage_id text NOT NULL,
       schema_fingerprint_sha256 text NOT NULL,
       receipt_fingerprint_sha256 text NOT NULL,
       strict_receipt_rows_sha256 text NOT NULL,
       verified_at timestamp with time zone NOT NULL DEFAULT now()
     )`,
  )
}

async function applyPendingMigrations(params: {
  client: CommunityStrictPgClient
  bundle: CommunityStrictMigrationBundleV1
  preflightCounts: readonly number[]
  logs: string[]
}): Promise<void> {
  for (const [rootOrdinal, loadedRoot] of params.bundle.roots.entries()) {
    await ensureLegacyMigrationTable(params.client, loadedRoot.root)
    const pending = loadedRoot.migrations.slice(params.preflightCounts[rootOrdinal])
    for (const loaded of pending) {
      params.logs.push(`Applying strict Community migration ${loaded.root.id}/${loaded.migration.tag}`)
      for (const statement of loaded.statements) await params.client.query(statement)
      const table = quoteIdentifier(loaded.root.migrationTable)
      if (loaded.root.legacyHashColumn) {
        await params.client.query(
          `INSERT INTO public.${table} (tag, sha256) VALUES ($1, $2)`,
          [loaded.migration.tag, loaded.migration.sha256],
        )
      } else {
        await params.client.query(`INSERT INTO public.${table} (tag) VALUES ($1)`, [loaded.migration.tag])
      }
    }
  }
}

function findCommunityStrictLineageReconciliation(params: {
  policy: CommunityStrictMigrationPolicyV1
  observed: ObservedState
  postgresMajor: number
}): CommunityStrictLineageReconciliationV1 | null {
  if (params.observed.strictReceipts !== null || params.observed.strictState !== null) return null
  const relationCount = params.observed.projection.relations.length
  const appliedCounts = params.observed.roots.map((root) => root.rows.length)
  return params.policy.lineageReconciliations.find((candidate) =>
    candidate.postgresMajor === params.postgresMajor &&
    candidate.relationCount === relationCount &&
    candidate.schemaFingerprintSha256 === params.observed.schemaFingerprintSha256 &&
    candidate.appliedCounts.every((count, index) => count === appliedCounts[index])) ?? null
}

async function applyCommunityStrictLineageReconciliation(params: {
  client: CommunityStrictPgClient
  policy: CommunityStrictMigrationPolicyV1
  bundle: CommunityStrictMigrationBundleV1
  reconciliation: CommunityStrictLineageReconciliationV1
  postgresMajor: number
  logs: string[]
}): Promise<void> {
  const before = await observeState({ client: params.client, policy: params.policy })
  const matched = findCommunityStrictLineageReconciliation({
    policy: params.policy,
    observed: before,
    postgresMajor: params.postgresMajor,
  })
  if (!matched || matched.id !== params.reconciliation.id) {
    throw new Error(`community_strict_lineage_reconciliation_source_changed:${params.reconciliation.id}`)
  }
  const target = params.policy.lineages.find((lineage) => lineage.id === matched.targetLineageId)
  if (!target || target.kind !== 'legacy') {
    throw new Error(`community_strict_lineage_reconciliation_target_missing:${matched.id}`)
  }
  const beforeSentinels = await captureDataSentinels(params.client, before.projection, params.policy)
  if (matched.rootModes.some((mode) => mode === 'apply')) {
    await params.client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
  }
  for (const [rootOrdinal, loadedRoot] of params.bundle.roots.entries()) {
    const mode = matched.rootModes[rootOrdinal]
    const sourceCount = matched.appliedCounts[rootOrdinal]
    const targetCount = target.appliedCounts[rootOrdinal]
    if (mode === 'unchanged') continue
    await ensureLegacyMigrationTable(params.client, loadedRoot.root)
    for (const loaded of loadedRoot.migrations.slice(sourceCount, targetCount)) {
      if (mode === 'apply') {
        params.logs.push(
          `Applying exact Community lineage reconciliation ${matched.id}: ${loaded.root.id}/${loaded.migration.tag}`,
        )
        for (const statement of loaded.statements) await params.client.query(statement)
      } else {
        params.logs.push(
          `Adopting exact Community lineage reconciliation ${matched.id}: ${loaded.root.id}/${loaded.migration.tag}`,
        )
      }
      const table = quoteIdentifier(loaded.root.migrationTable)
      if (loaded.root.legacyHashColumn) {
        await params.client.query(
          `INSERT INTO public.${table} (tag, sha256) VALUES ($1, $2)`,
          [loaded.migration.tag, loaded.migration.sha256],
        )
      } else {
        await params.client.query(`INSERT INTO public.${table} (tag) VALUES ($1)`, [loaded.migration.tag])
      }
    }
  }
  const after = await observeState({ client: params.client, policy: params.policy })
  const classification = classifyObservedState({
    policy: params.policy,
    observed: after,
    postgresMajor: params.postgresMajor,
  })
  if (classification === 'empty-v1' || classification.id !== target.id) {
    throw new Error(`community_strict_lineage_reconciliation_target_mismatch:${matched.id}`)
  }
  const afterSentinels = await captureDataSentinels(
    params.client,
    after.projection,
    params.policy,
    before.projection,
  )
  assertSameSentinels(beforeSentinels, afterSentinels)
}

async function applyConvergenceOperations(params: {
  client: CommunityStrictPgClient
  policy: CommunityStrictMigrationPolicyV1
  logs: string[]
}): Promise<void> {
  for (const operation of params.policy.convergence) {
    params.logs.push(`Applying strict Community convergence ${operation.ownerRootId}/${operation.id}`)
    await params.client.query(renderCommunityStrictConvergenceSql(operation))
  }
}

async function writeStrictReceipts(params: {
  client: CommunityStrictPgClient
  policy: CommunityStrictMigrationPolicyV1
  roots: readonly CommunityStrictRootState[]
  preflightCounts: readonly number[]
  sourceLineage: CommunityStrictLineageV1 | DatabasePrefixLineage | null
}): Promise<void> {
  const existing = await params.client.query<{ count: unknown }>(
    `SELECT COUNT(*)::text AS count FROM public.${STRICT_RECEIPT_TABLE}`,
  )
  const existingCount = Number(existing.rows[0]?.count)
  const sourceWasStrict = params.sourceLineage?.kind === 'strict'
  const expectedExistingCount = sourceWasStrict
    ? params.preflightCounts.reduce((total, count) => total + count, 0)
    : 0
  if (!Number.isSafeInteger(existingCount) || existingCount !== expectedExistingCount) {
    throw new Error('community_strict_receipt_append_base_mismatch')
  }
  for (const [rootOrdinal, root] of params.policy.roots.entries()) {
    const observed = params.roots[rootOrdinal]
    const startIndex = sourceWasStrict ? params.preflightCounts[rootOrdinal] : 0
    for (let migrationIdx = startIndex; migrationIdx < observed.rows.length; migrationIdx += 1) {
      const row = observed.rows[migrationIdx]
      const migration = root.migrations[migrationIdx]
      await params.client.query(
        `INSERT INTO public.${STRICT_RECEIPT_TABLE}
           (root_id, root_ordinal, migration_idx, tag, sql_sha256, journal_sha256, applied_at, provenance)
         VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8)`,
        [
          root.id,
          rootOrdinal,
          migrationIdx,
          migration.tag,
          migration.sha256,
          root.journalSha256,
          row.appliedAt,
          !sourceWasStrict && migrationIdx < params.preflightCounts[rootOrdinal]
            ? 'exact-lineage-adoption'
            : 'applied',
        ],
      )
    }
  }
}

async function writeStrictState(params: {
  client: CommunityStrictPgClient
  policy: CommunityStrictMigrationPolicyV1
  target: CommunityStrictLineageV1
  receiptFingerprintSha256: string
  strictReceiptRowsSha256: string
  previousState: StrictStateRow | null
}): Promise<void> {
  const targetValues = [
    params.policy.id,
    params.policy.inventorySha256,
    params.policy.convergenceSha256,
    params.target.id,
    params.target.schemaFingerprintSha256,
    params.receiptFingerprintSha256,
    params.strictReceiptRowsSha256,
  ]
  if (params.previousState === null) {
    await params.client.query(
      `INSERT INTO public.${STRICT_STATE_TABLE}
         (id, policy_id, inventory_sha256, convergence_sha256, lineage_id, schema_fingerprint_sha256,
          receipt_fingerprint_sha256, strict_receipt_rows_sha256)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7)`,
      targetValues,
    )
    return
  }
  const updated = await params.client.query<{ id: unknown }>(
      `UPDATE public.${STRICT_STATE_TABLE}
        SET policy_id = $1, inventory_sha256 = $2, convergence_sha256 = $3, lineage_id = $4,
            schema_fingerprint_sha256 = $5, receipt_fingerprint_sha256 = $6,
            strict_receipt_rows_sha256 = $7, verified_at = now()
      WHERE id = 1 AND policy_id = $8 AND inventory_sha256 = $9 AND convergence_sha256 = $10
        AND lineage_id = $11 AND schema_fingerprint_sha256 = $12 AND receipt_fingerprint_sha256 = $13
        AND strict_receipt_rows_sha256 = $14
      RETURNING id`,
    [
      ...targetValues,
      params.previousState.policyId,
      params.previousState.inventorySha256,
      params.previousState.convergenceSha256,
      params.previousState.lineageId,
      params.previousState.schemaFingerprintSha256,
      params.previousState.receiptFingerprintSha256,
      params.previousState.strictReceiptRowsSha256,
    ],
  )
  if (updated.rows.length !== 1) throw new Error('community_strict_state_compare_and_swap_failed')
}

async function ensureMigrationPlanAcceptanceTableV1(client: CommunityStrictPgClient): Promise<void> {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${STRICT_AUDIT_SCHEMA}`)
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${STRICT_AUDIT_SCHEMA}.${STRICT_PLAN_ACCEPTANCE_TABLE} (
       accepted_plan_sha256 text PRIMARY KEY,
       action text NOT NULL CHECK (action IN ('migrate', 'verify-only')),
       source_fingerprint_sha256 text NOT NULL,
       target_lineage_id text NOT NULL,
       result_lineage_id text NOT NULL,
       result_schema_fingerprint_sha256 text NOT NULL,
       result_receipt_fingerprint_sha256 text NOT NULL,
       result_state_fingerprint_sha256 text NOT NULL,
       evidence_kind text NULL CHECK (evidence_kind IS NULL OR evidence_kind IN
         ('managed-verified-backup', 'external-snapshot-attestation')),
       evidence_sha256 text NULL,
       plan_json jsonb NOT NULL,
       accepted_at timestamp with time zone NOT NULL,
       CHECK ((evidence_kind IS NULL) = (evidence_sha256 IS NULL))
     )`,
  )
}

function parseMigrationPlanAcceptanceRowUnbound(
  row: Record<string, unknown>,
): { acceptance: CommunityStrictMigrationPlanAcceptanceV1; planJson: unknown } {
  const rawPlanJson = typeof row.planJson === 'string' ? JSON.parse(row.planJson) as unknown : row.planJson
  let planJson: CommunityStrictMigrationPlanV1
  try {
    // PostgreSQL jsonb does not preserve object key insertion order. Rebuild the
    // typed plan order before hashing so a semantic round-trip retains the
    // accepted digest without weakening exact-key validation.
    planJson = canonicalMigrationPlanJson(rawPlanJson)
  } catch {
    throw new Error('community_strict_plan_acceptance_corrupt')
  }
  const evidenceKind = row.evidenceKind === null || row.evidenceKind === undefined
    ? null
    : String(row.evidenceKind) as CommunityStrictSnapshotEvidenceV1['kind']
  const evidenceSha256 = row.evidenceSha256 === null || row.evidenceSha256 === undefined
    ? null
    : String(row.evidenceSha256)
  const acceptance: CommunityStrictMigrationPlanAcceptanceV1 = {
    schemaVersion: 1,
    acceptedPlanSha256: String(row.acceptedPlanSha256),
    action: String(row.action) as CommunityStrictMigrationPlanAcceptanceV1['action'],
    sourceFingerprintSha256: String(row.sourceFingerprintSha256),
    targetLineageId: String(row.targetLineageId),
    resultLineageId: String(row.resultLineageId),
    resultSchemaFingerprintSha256: String(row.resultSchemaFingerprintSha256),
    resultReceiptFingerprintSha256: String(row.resultReceiptFingerprintSha256),
    resultStateFingerprintSha256: String(row.resultStateFingerprintSha256),
    evidenceKind,
    evidenceSha256,
    acceptedAt: String(row.acceptedAt),
  }
  if (!RAW_SHA256.test(acceptance.acceptedPlanSha256) ||
      !['migrate', 'verify-only'].includes(acceptance.action) ||
      !RAW_SHA256.test(acceptance.sourceFingerprintSha256) ||
      !validEvidenceText(acceptance.targetLineageId, 256) ||
      !validEvidenceText(acceptance.resultLineageId, 256) ||
      !RAW_SHA256.test(acceptance.resultSchemaFingerprintSha256) ||
      !RAW_SHA256.test(acceptance.resultReceiptFingerprintSha256) ||
      !RAW_SHA256.test(acceptance.resultStateFingerprintSha256) ||
      (acceptance.evidenceSha256 !== null && !RAW_SHA256.test(acceptance.evidenceSha256)) ||
      (acceptance.evidenceKind === null) !== (acceptance.evidenceSha256 === null) ||
      !['managed-verified-backup', 'external-snapshot-attestation', null].includes(acceptance.evidenceKind) ||
      Number.isNaN(Date.parse(acceptance.acceptedAt)) || sha256Json(planJson) !== acceptance.acceptedPlanSha256) {
    throw new Error('community_strict_plan_acceptance_corrupt')
  }
  return { acceptance, planJson }
}

function parseMigrationPlanAcceptanceRow(
  row: Record<string, unknown>,
  expectedPlan: CommunityStrictMigrationPlanBindingV1,
): CommunityStrictMigrationPlanAcceptanceV1 {
  const { acceptance } = parseMigrationPlanAcceptanceRowUnbound(row)
  if (acceptance.acceptedPlanSha256 !== expectedPlan.planSha256 ||
      acceptance.action !== expectedPlan.plan.action ||
      acceptance.sourceFingerprintSha256 !== expectedPlan.sourceFingerprintSha256 ||
      acceptance.targetLineageId !== expectedPlan.plan.target.lineageId) {
    throw new Error('community_strict_plan_acceptance_conflict')
  }
  return acceptance
}

async function writeMigrationPlanAcceptanceV1(params: {
  client: CommunityStrictPgClient
  plan: CommunityStrictMigrationPlanBindingV1
  result: CommunityStrictStateReceiptV1
  evidence: { evidence: CommunityStrictSnapshotEvidenceV1; evidenceSha256: string } | null
  acceptedAt: string
}): Promise<CommunityStrictMigrationPlanAcceptanceV1> {
  await ensureMigrationPlanAcceptanceTableV1(params.client)
  await params.client.query(
    `INSERT INTO ${STRICT_AUDIT_SCHEMA}.${STRICT_PLAN_ACCEPTANCE_TABLE}
       (accepted_plan_sha256, action, source_fingerprint_sha256, target_lineage_id,
        result_lineage_id, result_schema_fingerprint_sha256, result_receipt_fingerprint_sha256,
        result_state_fingerprint_sha256, evidence_kind, evidence_sha256, plan_json, accepted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::timestamptz)
     ON CONFLICT (accepted_plan_sha256) DO UPDATE
       SET action = EXCLUDED.action,
           source_fingerprint_sha256 = EXCLUDED.source_fingerprint_sha256,
           target_lineage_id = EXCLUDED.target_lineage_id,
           result_lineage_id = EXCLUDED.result_lineage_id,
           result_schema_fingerprint_sha256 = EXCLUDED.result_schema_fingerprint_sha256,
           result_receipt_fingerprint_sha256 = EXCLUDED.result_receipt_fingerprint_sha256,
           result_state_fingerprint_sha256 = EXCLUDED.result_state_fingerprint_sha256,
           evidence_kind = EXCLUDED.evidence_kind,
           evidence_sha256 = EXCLUDED.evidence_sha256,
           plan_json = EXCLUDED.plan_json,
           accepted_at = EXCLUDED.accepted_at`,
    [
      params.plan.planSha256,
      params.plan.plan.action,
      params.plan.sourceFingerprintSha256,
      params.plan.plan.target.lineageId,
      params.result.lineageId,
      params.result.schemaFingerprintSha256,
      params.result.receiptFingerprintSha256,
      params.result.stateFingerprintSha256,
      params.evidence?.evidence.kind ?? null,
      params.evidence?.evidenceSha256 ?? null,
      JSON.stringify(params.plan.plan),
      params.acceptedAt,
    ],
  )
  const selected = await params.client.query<Record<string, unknown>>(
    `SELECT accepted_plan_sha256 AS "acceptedPlanSha256", action,
            source_fingerprint_sha256 AS "sourceFingerprintSha256",
            target_lineage_id AS "targetLineageId",
            result_lineage_id AS "resultLineageId",
            result_schema_fingerprint_sha256 AS "resultSchemaFingerprintSha256",
            result_receipt_fingerprint_sha256 AS "resultReceiptFingerprintSha256",
            result_state_fingerprint_sha256 AS "resultStateFingerprintSha256",
            evidence_kind AS "evidenceKind", evidence_sha256 AS "evidenceSha256",
            plan_json AS "planJson",
            to_char(accepted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z' AS "acceptedAt"
       FROM ${STRICT_AUDIT_SCHEMA}.${STRICT_PLAN_ACCEPTANCE_TABLE}
      WHERE accepted_plan_sha256 = $1`,
    [params.plan.planSha256],
  )
  if (selected.rows.length !== 1) throw new Error('community_strict_plan_acceptance_missing')
  const acceptance = parseMigrationPlanAcceptanceRow(selected.rows[0], params.plan)
  if (acceptance.resultStateFingerprintSha256 !== params.result.stateFingerprintSha256 ||
      acceptance.resultLineageId !== params.result.lineageId ||
      acceptance.resultSchemaFingerprintSha256 !== params.result.schemaFingerprintSha256 ||
      acceptance.resultReceiptFingerprintSha256 !== params.result.receiptFingerprintSha256 ||
      acceptance.evidenceKind !== (params.evidence?.evidence.kind ?? null) ||
      acceptance.evidenceSha256 !== (params.evidence?.evidenceSha256 ?? null)) {
    throw new Error('community_strict_plan_acceptance_conflict')
  }
  return acceptance
}

async function readLatestAppliedPlanAcceptance(
  client: CommunityStrictPgClient,
  result: CommunityStrictStateReceiptV1,
): Promise<CommunityStrictMigrationPlanAcceptanceV1 | null> {
  const selected = await client.query<Record<string, unknown>>(
    `SELECT accepted_plan_sha256 AS "acceptedPlanSha256", action,
            source_fingerprint_sha256 AS "sourceFingerprintSha256",
            target_lineage_id AS "targetLineageId", result_lineage_id AS "resultLineageId",
            result_schema_fingerprint_sha256 AS "resultSchemaFingerprintSha256",
            result_receipt_fingerprint_sha256 AS "resultReceiptFingerprintSha256",
            result_state_fingerprint_sha256 AS "resultStateFingerprintSha256",
            evidence_kind AS "evidenceKind", evidence_sha256 AS "evidenceSha256",
            plan_json AS "planJson",
            to_char(accepted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z' AS "acceptedAt"
       FROM ${STRICT_AUDIT_SCHEMA}.${STRICT_PLAN_ACCEPTANCE_TABLE}
      WHERE action = 'migrate' AND result_lineage_id = $1
        AND result_schema_fingerprint_sha256 = $2 AND result_receipt_fingerprint_sha256 = $3
      ORDER BY accepted_at DESC, accepted_plan_sha256 DESC
      LIMIT 1`,
    [result.lineageId, result.schemaFingerprintSha256, result.receiptFingerprintSha256],
  )
  if (selected.rows.length === 0) return null
  return parseMigrationPlanAcceptanceRowUnbound(selected.rows[0]).acceptance
}

function pendingRiskyMigrations(
  policy: CommunityStrictMigrationPolicyV1,
  roots: readonly CommunityStrictRootState[],
): CommunityStrictMigrationV1[] {
  return policy.roots.flatMap((root, index) =>
    root.migrations.slice(roots[index].rows.length).filter((migration) => migration.risk === 'destructive-or-dynamic'),
  )
}

function pendingRiskyMigrationsAfterReconciliation(
  policy: CommunityStrictMigrationPolicyV1,
  reconciliation: CommunityStrictLineageReconciliationV1,
): CommunityStrictMigrationV1[] {
  const reconciliationTarget = policy.lineages.find(
    (lineage) => lineage.id === reconciliation.targetLineageId,
  )
  if (!reconciliationTarget || reconciliationTarget.kind !== 'legacy') {
    throw new Error(`community_strict_lineage_reconciliation_target_missing:${reconciliation.id}`)
  }
  return policy.roots.flatMap((root, rootOrdinal) =>
    root.migrations
      .slice(reconciliationTarget.appliedCounts[rootOrdinal])
      .filter((migration) => migration.risk === 'destructive-or-dynamic'),
  )
}

function assertSameSentinels(
  before: readonly CommunityStrictDataSentinel[],
  after: readonly CommunityStrictDataSentinel[],
): void {
  if (JSON.stringify(before) !== JSON.stringify(after.filter((entry) =>
    before.some((candidate) => candidate.table === entry.table)))) {
    throw new Error('community_strict_data_sentinel_mismatch')
  }
}

function buildPlanFromObservedState(params: {
  policy: CommunityStrictMigrationPolicyV1
  bundle: CommunityStrictMigrationBundleV1
  postgresMajor: number
  classification: ObservedClassification
  observed: ObservedState
}): CommunityStrictMigrationPlanBindingV1 {
  return buildCommunityStrictMigrationPlanV1({
    policy: params.policy,
    bundle: params.bundle,
    postgresMajor: params.postgresMajor,
    sourceLineageId: params.classification === 'empty-v1'
      ? params.classification
      : params.classification.id,
    sourceSchemaFingerprintSha256: params.observed.schemaFingerprintSha256,
    sourceStrictReceiptRowsSha256: params.observed.strictReceipts === null
      ? null
      : fingerprintStrictReceiptRows(params.observed.strictReceipts),
    sourceRoots: params.observed.roots,
  })
}

function buildPlanFromReconciliationState(params: {
  policy: CommunityStrictMigrationPolicyV1
  bundle: CommunityStrictMigrationBundleV1
  postgresMajor: number
  reconciliation: CommunityStrictLineageReconciliationV1
  observed: ObservedState
}): CommunityStrictMigrationPlanBindingV1 {
  return buildCommunityStrictMigrationPlanV1({
    policy: params.policy,
    bundle: params.bundle,
    postgresMajor: params.postgresMajor,
    sourceLineageId: `reconciliation:${params.reconciliation.id}`,
    sourceSchemaFingerprintSha256: params.observed.schemaFingerprintSha256,
    sourceStrictReceiptRowsSha256: null,
    sourceRoots: params.observed.roots,
  })
}

function assertExpectedPlanSha256(
  expectedPlanSha256: string | undefined,
  binding: CommunityStrictMigrationPlanBindingV1,
): void {
  if (expectedPlanSha256 !== undefined && expectedPlanSha256 !== binding.planSha256) {
    throw new Error(
      `community_strict_migration_plan_mismatch:expected=${expectedPlanSha256}:actual=${binding.planSha256}`,
    )
  }
}

function attachAcceptedPlan(
  receipt: CommunityStrictStateReceiptV1,
  binding: CommunityStrictMigrationPlanBindingV1,
  durableAcceptance: CommunityStrictMigrationPlanAcceptanceV1,
  latestAppliedAcceptance: CommunityStrictMigrationPlanAcceptanceV1 | null,
): CommunityStrictMigrationApplyResultV1 {
  return {
    ...receipt,
    migrationPlan: binding.plan,
    acceptedPlanSha256: binding.planSha256,
    sourceFingerprintSha256: binding.sourceFingerprintSha256,
    durableAcceptance,
    latestAppliedPlanSha256: latestAppliedAcceptance?.acceptedPlanSha256 ?? null,
    latestAppliedAcceptance,
  }
}

export async function inspectCommunityStrictPgSchema(params: {
  client: CommunityStrictPgClient
  policy: CommunityStrictMigrationPolicyV1
}): Promise<CommunityStrictStateReceiptV1> {
  validateCommunityStrictMigrationPolicyV1(params.policy)
  await configureCanonicalSession(params.client)
  let transactionOpen = false
  try {
    await params.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    transactionOpen = true
    await params.client.query('SELECT pg_advisory_xact_lock($1, $2)', [
      params.policy.lock.classId,
      params.policy.lock.objectId,
    ])
    const postgresMajor = await readPostgresMajor(params.client)
    const observed = await observeState({ client: params.client, policy: params.policy })
    const classification = classifyObservedState({ policy: params.policy, observed, postgresMajor })
    const dataSentinels = classification === 'empty-v1'
      ? []
      : await captureDataSentinels(params.client, observed.projection, params.policy)
    const receipt = createStateReceipt({
      policy: params.policy,
      lineageId: classification === 'empty-v1' ? classification : classification.id,
      observed,
      dataSentinels,
    })
    await params.client.query('COMMIT')
    transactionOpen = false
    return receipt
  } catch (error) {
    if (transactionOpen) await params.client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

export async function planCommunityStrictPgSchema(params: {
  repoUrl: string
  workspaceRoot: string
  policy: CommunityStrictMigrationPolicyV1
  clientFactory?: (repoUrl: string) => CommunityStrictPgClient
}): Promise<CommunityStrictMigrationPlanningResultV1> {
  if (!params.repoUrl) throw new Error('community_strict_repo_url_required')
  validateCommunityStrictMigrationPolicyV1(params.policy)
  const bundle = inspectCommunityStrictMigrationBundle({
    policy: params.policy,
    workspaceRoot: params.workspaceRoot,
  })
  const client = params.clientFactory?.(params.repoUrl) ?? new Client({ connectionString: params.repoUrl })
  await client.connect()
  let transactionOpen = false
  try {
    await configureCanonicalSession(client)
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    transactionOpen = true
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [
      params.policy.lock.classId,
      params.policy.lock.objectId,
    ])
    const postgresMajor = await readPostgresMajor(client)
    const observed = await observeState({ client, policy: params.policy })
    const reconciliation = findCommunityStrictLineageReconciliation({
      policy: params.policy,
      observed,
      postgresMajor,
    })
    const classification = reconciliation
      ? null
      : classifyObservedState({ policy: params.policy, observed, postgresMajor })
    const dataSentinels = classification === 'empty-v1'
      ? []
      : await captureDataSentinels(client, observed.projection, params.policy)
    const receipt = createStateReceipt({
      policy: params.policy,
      lineageId: reconciliation
        ? `reconciliation:${reconciliation.id}`
        : classification === 'empty-v1'
          ? classification
          : classification!.id,
      observed,
      dataSentinels,
    })
    const binding = reconciliation
      ? buildPlanFromReconciliationState({
        policy: params.policy,
        bundle,
        postgresMajor,
        reconciliation,
        observed,
      })
      : buildPlanFromObservedState({
        policy: params.policy,
        bundle,
        postgresMajor,
        classification: classification!,
        observed,
      })
    await client.query('COMMIT')
    transactionOpen = false
    return {
      ...receipt,
      migrationPlan: binding.plan,
      acceptedPlanSha256: binding.planSha256,
      sourceFingerprintSha256: binding.sourceFingerprintSha256,
      // Exact reconciliation runs under the policy-bound source fingerprint,
      // one transaction, and full before/after data sentinels. A snapshot is
      // needed only for risky work that remains after its legacy target.
      requiresSnapshotEvidence: reconciliation
        ? pendingRiskyMigrationsAfterReconciliation(params.policy, reconciliation).length > 0
        : classification !== 'empty-v1' &&
          binding.plan.pendingMigrations.some((migration) => migration.risk === 'destructive-or-dynamic'),
    }
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.end().catch(() => undefined)
  }
}

export async function applyCommunityStrictPgSchema(params: {
  repoUrl: string
  workspaceRoot: string
  policy: CommunityStrictMigrationPolicyV1
  snapshotEvidencePath?: string
  snapshotPolicy?: CommunityStrictSnapshotPolicyV1
  /** @deprecated Use snapshotEvidencePath. */
  backupEvidencePath?: string
  expectedPlanSha256?: string
  logs?: string[]
  clientFactory?: (repoUrl: string) => CommunityStrictPgClient
  now?: () => Date
  onPlanAccepted?: (context: CommunityStrictMigrationPlanAcceptedContextV1) => void | Promise<void>
}): Promise<CommunityStrictMigrationApplyResultV1> {
  if (!params.repoUrl) throw new Error('community_strict_repo_url_required')
  if (params.expectedPlanSha256 !== undefined && !RAW_SHA256.test(params.expectedPlanSha256)) {
    throw new Error('community_strict_expected_plan_sha256_invalid')
  }
  if (params.snapshotEvidencePath && params.backupEvidencePath &&
      !sameResolvedPath(params.snapshotEvidencePath, params.backupEvidencePath)) {
    throw new Error('community_strict_snapshot_evidence_path_conflict')
  }
  const snapshotPolicy = params.snapshotPolicy ?? 'managed-verified-only-v1'
  if (!['managed-verified-only-v1', 'managed-or-external-attested-v1'].includes(snapshotPolicy)) {
    throw new Error('community_strict_snapshot_policy_invalid')
  }
  const snapshotEvidencePath = params.snapshotEvidencePath ?? params.backupEvidencePath
  validateCommunityStrictMigrationPolicyV1(params.policy)
  const bundle = inspectCommunityStrictMigrationBundle({
    policy: params.policy,
    workspaceRoot: params.workspaceRoot,
  })
  const logs = params.logs ?? []
  const client = params.clientFactory?.(params.repoUrl) ?? new Client({ connectionString: params.repoUrl })
  await client.connect()
  let locked = false
  let transactionOpen = false
  let committed = false
  let managedBackupGuard: CommunityStrictManagedBackupGuard | null = null
  let managedBackupRescue: CommunityStrictManagedBackupRescue | null = null
  let reconciliationPlanContext: Readonly<{
    binding: CommunityStrictMigrationPlanBindingV1
    preflight: CommunityStrictStateReceiptV1
    snapshotEvidence: Readonly<{
      evidence: CommunityStrictSnapshotEvidenceV1
      evidenceSha256: string
    }> | null
  }> | null = null
  const assertPostCommitManagedBackup = (): void => {
    const guard = managedBackupGuard
    const rescue = managedBackupRescue
    if (!guard || !rescue) return
    try {
      assertManagedBackupGuard(guard)
    } catch {
      const preserved = preserveManagedBackupAfterCommit(guard, rescue)
      if (preserved.consumed) managedBackupRescue = null
      throw new Error(
        `community_strict_backup_guard_changed_after_commit:backup_preserved=${preserved.preservedPath}`,
      )
    }
  }
  try {
    const lock = await client.query<{ acquired: unknown }>(
      'SELECT pg_try_advisory_lock($1, $2) AS acquired',
      [params.policy.lock.classId, params.policy.lock.objectId],
    )
    if (lock.rows[0]?.acquired !== true) throw new Error('community_strict_lock_busy')
    locked = true
    await configureCanonicalSession(client)
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    transactionOpen = true
    const postgresMajor = await readPostgresMajor(client)
    let discovered = await observeState({ client, policy: params.policy })
    const reconciliation = findCommunityStrictLineageReconciliation({
      policy: params.policy,
      observed: discovered,
      postgresMajor,
    })
    if (reconciliation) {
      const binding = buildPlanFromReconciliationState({
        policy: params.policy,
        bundle,
        postgresMajor,
        reconciliation,
        observed: discovered,
      })
      assertExpectedPlanSha256(params.expectedPlanSha256, binding)
      const dataSentinels = await captureDataSentinels(client, discovered.projection, params.policy)
      const preflight = createStateReceipt({
        policy: params.policy,
        lineageId: `reconciliation:${reconciliation.id}`,
        observed: discovered,
        dataSentinels,
      })
      let snapshotEvidence: {
        evidence: CommunityStrictSnapshotEvidenceV1
        evidenceSha256: string
      } | null = null
      if (pendingRiskyMigrationsAfterReconciliation(params.policy, reconciliation).length > 0) {
        const verifiedSnapshot = await verifySnapshotEvidence({
          evidencePath: snapshotEvidencePath,
          preflight,
          policy: params.policy,
          plan: binding,
          snapshotPolicy,
        })
        snapshotEvidence = {
          evidence: verifiedSnapshot.evidence,
          evidenceSha256: verifiedSnapshot.evidenceSha256,
        }
        managedBackupGuard = verifiedSnapshot.managedBackupGuard
      }
      await params.onPlanAccepted?.({
        migrationPlan: binding.plan,
        acceptedPlanSha256: binding.planSha256,
        sourceFingerprintSha256: binding.sourceFingerprintSha256,
        preflight,
        snapshotEvidenceKind: snapshotEvidence?.evidence.kind ?? null,
        snapshotEvidenceSha256: snapshotEvidence?.evidenceSha256 ?? null,
      })
      if (managedBackupGuard) assertManagedBackupGuard(managedBackupGuard)
      reconciliationPlanContext = { binding, preflight, snapshotEvidence }
      await client.query('COMMIT')
      transactionOpen = false
      await client.query('BEGIN')
      transactionOpen = true
      await lockObservedRelations(client, discovered.projection)
      await applyCommunityStrictLineageReconciliation({
        client,
        policy: params.policy,
        bundle,
        reconciliation,
        postgresMajor,
        logs,
      })
      await client.query('COMMIT')
      transactionOpen = false
      logs.push(
        `Community PostgreSQL partial lineage ${reconciliation.id} reconciled to ${reconciliation.targetLineageId} without changing existing data.`,
      )
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      transactionOpen = true
      discovered = await observeState({ client, policy: params.policy })
    }
    const discoveredClassification = classifyObservedState({
      policy: params.policy,
      observed: discovered,
      postgresMajor,
    })
    const target = params.policy.lineages.find((lineage) => lineage.id === params.policy.targetLineageId)
    if (!target) throw new Error('community_strict_target_missing')
    if (discoveredClassification !== 'empty-v1' && discoveredClassification.id === target.id) {
      const acceptedPlan = buildPlanFromObservedState({
        policy: params.policy,
        bundle,
        postgresMajor,
        classification: discoveredClassification,
        observed: discovered,
      })
      assertExpectedPlanSha256(params.expectedPlanSha256, acceptedPlan)
      logs.push(`Community PostgreSQL lineage ${target.id} is already exact; no DDL applied.`)
      const exactReceipt = createStateReceipt({
        policy: params.policy,
        lineageId: target.id,
        observed: discovered,
        dataSentinels: [],
      })
      await client.query('COMMIT')
      transactionOpen = false
      await client.query('BEGIN')
      transactionOpen = true
      const durableAcceptance = await writeMigrationPlanAcceptanceV1({
        client,
        plan: acceptedPlan,
        result: exactReceipt,
        evidence: null,
        acceptedAt: (params.now ?? (() => new Date()))().toISOString(),
      })
      await client.query('COMMIT')
      transactionOpen = false
      committed = true
      const latestAppliedAcceptance = await readLatestAppliedPlanAcceptance(
        client,
        exactReceipt,
      )
      return attachAcceptedPlan(exactReceipt, acceptedPlan, durableAcceptance, latestAppliedAcceptance)
    }

    await client.query('COMMIT')
    transactionOpen = false
    await client.query('BEGIN')
    transactionOpen = true
    const mutationDiscovery = await observeState({ client, policy: params.policy })
    classifyObservedState({ policy: params.policy, observed: mutationDiscovery, postgresMajor })
    await lockObservedRelations(client, mutationDiscovery.projection)
    const before = await observeState({ client, policy: params.policy })
    const classification = classifyObservedState({ policy: params.policy, observed: before, postgresMajor })
    const acceptedPlan = reconciliationPlanContext?.binding ?? buildPlanFromObservedState({
      policy: params.policy,
      bundle,
      postgresMajor,
      classification,
      observed: before,
    })
    if (!reconciliationPlanContext) assertExpectedPlanSha256(params.expectedPlanSha256, acceptedPlan)
    if (classification !== 'empty-v1' && classification.id === target.id) {
      logs.push(`Community PostgreSQL lineage ${target.id} became exact before table locking; no DDL applied.`)
      const exactReceipt = createStateReceipt({
        policy: params.policy,
        lineageId: target.id,
        observed: before,
        dataSentinels: [],
      })
      const durableAcceptance = await writeMigrationPlanAcceptanceV1({
        client,
        plan: acceptedPlan,
        result: exactReceipt,
        evidence: null,
        acceptedAt: (params.now ?? (() => new Date()))().toISOString(),
      })
      await client.query('COMMIT')
      transactionOpen = false
      committed = true
      const latestAppliedAcceptance = await readLatestAppliedPlanAcceptance(
        client,
        exactReceipt,
      )
      return attachAcceptedPlan(exactReceipt, acceptedPlan, durableAcceptance, latestAppliedAcceptance)
    }
    const beforeSentinels = reconciliationPlanContext?.preflight.dataSentinels ?? (
      classification === 'empty-v1'
        ? []
        : await captureDataSentinels(client, before.projection, params.policy)
    )
    const preflight = reconciliationPlanContext?.preflight ?? createStateReceipt({
      policy: params.policy,
      lineageId: classification === 'empty-v1' ? classification : classification.id,
      observed: before,
      dataSentinels: beforeSentinels,
    })
    const risky = pendingRiskyMigrations(params.policy, before.roots)
    let snapshotEvidence: { evidence: CommunityStrictSnapshotEvidenceV1; evidenceSha256: string } | null =
      reconciliationPlanContext?.snapshotEvidence ?? null
    if (!reconciliationPlanContext && classification !== 'empty-v1' && risky.length > 0) {
      const verifiedSnapshot = await verifySnapshotEvidence({
        evidencePath: snapshotEvidencePath,
        preflight,
        policy: params.policy,
        plan: acceptedPlan,
        snapshotPolicy,
      })
      snapshotEvidence = {
        evidence: verifiedSnapshot.evidence,
        evidenceSha256: verifiedSnapshot.evidenceSha256,
      }
      managedBackupGuard = verifiedSnapshot.managedBackupGuard
    }
    if (!reconciliationPlanContext) {
      await params.onPlanAccepted?.({
        migrationPlan: acceptedPlan.plan,
        acceptedPlanSha256: acceptedPlan.planSha256,
        sourceFingerprintSha256: acceptedPlan.sourceFingerprintSha256,
        preflight,
        snapshotEvidenceKind: snapshotEvidence?.evidence.kind ?? null,
        snapshotEvidenceSha256: snapshotEvidence?.evidenceSha256 ?? null,
      })
    }
    if (managedBackupGuard) assertManagedBackupGuard(managedBackupGuard)

    const preflightCounts = before.roots.map((root) => root.rows.length)
    if (params.policy.roots.some((root, index) => root.migrations.length > preflightCounts[index])) {
      await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    }
    await applyPendingMigrations({ client, bundle, preflightCounts, logs })
    await applyConvergenceOperations({ client, policy: params.policy, logs })
    await ensureCommunityStrictMetadataTablesV1(client)
    const normalizedPrivilegeCount = await normalizeCommunityOwnedRelationPrivileges(client)
    if (normalizedPrivilegeCount > 0) {
      logs.push(
        `Removed ${normalizedPrivilegeCount} provider-applied non-owner relation privilege grants from the AOPS schema.`,
      )
    }
    const afterApply = await observeState({
      client,
      policy: params.policy,
      allowUninitializedStrictTables: true,
    })
    const afterApplyCounts = afterApply.roots.map((root) => root.rows.length)
    if (!target.appliedCounts.every((count, index) => count === afterApplyCounts[index])) {
      throw new Error('community_strict_target_receipt_count_mismatch')
    }
    if (afterApply.schemaFingerprintSha256 !== target.schemaFingerprintSha256 ||
        afterApply.projection.relations.length !== target.relationCount) {
      throw new Error(
        `community_strict_target_schema_mismatch:expected=${target.schemaFingerprintSha256}:actual=${afterApply.schemaFingerprintSha256}`,
      )
    }
    const afterSentinels = await captureDataSentinels(
      client,
      afterApply.projection,
      params.policy,
      before.projection,
    )
    assertSameSentinels(beforeSentinels, afterSentinels)
    await writeStrictReceipts({
      client,
      policy: params.policy,
      roots: afterApply.roots,
      preflightCounts,
      sourceLineage: classification === 'empty-v1' ? null : classification,
    })
    const receiptFingerprintSha256 = fingerprintCommunityStrictReceipts(params.policy, afterApply.roots)
    const writtenStrictReceipts = await readStrictReceipts(client, afterApply.relationNames)
    if (!writtenStrictReceipts) throw new Error('community_strict_receipt_backfill_missing')
    await writeStrictState({
      client,
      policy: params.policy,
      target,
      receiptFingerprintSha256,
      strictReceiptRowsSha256: fingerprintStrictReceiptRows(writtenStrictReceipts),
      previousState: before.strictState,
    })

    const finalInTransaction = await observeState({ client, policy: params.policy })
    const finalClassification = classifyObservedState({
      policy: params.policy,
      observed: finalInTransaction,
      postgresMajor,
    })
    if (finalClassification === 'empty-v1' || finalClassification.id !== target.id) {
      throw new Error('community_strict_final_lineage_mismatch')
    }
    const finalReceipt = createStateReceipt({
      policy: params.policy,
      lineageId: target.id,
      observed: finalInTransaction,
      dataSentinels: afterSentinels,
    })
    if (managedBackupGuard) assertManagedBackupGuard(managedBackupGuard)
    const durableAcceptance = await writeMigrationPlanAcceptanceV1({
      client,
      plan: acceptedPlan,
      result: finalReceipt,
      evidence: snapshotEvidence,
      acceptedAt: (params.now ?? (() => new Date()))().toISOString(),
    })

    if (managedBackupGuard) {
      assertManagedBackupGuard(managedBackupGuard)
      managedBackupRescue = stageManagedBackupRescue(managedBackupGuard)
      assertManagedBackupGuard(managedBackupGuard)
    }

    await client.query('COMMIT')
    transactionOpen = false
    committed = true
    assertPostCommitManagedBackup()
    const postCommit = await observeState({ client, policy: params.policy })
    const postClassification = classifyObservedState({ policy: params.policy, observed: postCommit, postgresMajor })
    const postReceipt = createStateReceipt({
      policy: params.policy,
      lineageId: postClassification === 'empty-v1' ? postClassification : postClassification.id,
      observed: postCommit,
      dataSentinels: afterSentinels,
    })
    if (postReceipt.stateFingerprintSha256 !== finalReceipt.stateFingerprintSha256) {
      throw new Error('community_strict_post_commit_verification_mismatch')
    }
    const latestAppliedAcceptance = await readLatestAppliedPlanAcceptance(
      client,
      postReceipt,
    )
    if (acceptedPlan.plan.action === 'migrate' &&
        latestAppliedAcceptance?.acceptedPlanSha256 !== acceptedPlan.planSha256) {
      throw new Error('community_strict_plan_acceptance_post_commit_mismatch')
    }
    assertPostCommitManagedBackup()
    if (managedBackupGuard && managedBackupRescue) {
      discardManagedBackupRescue(managedBackupGuard, managedBackupRescue)
      managedBackupRescue = null
    }
    logs.push(`Community PostgreSQL strict lineage ${target.id} verified under the shared lock.`)
    return attachAcceptedPlan(postReceipt, acceptedPlan, durableAcceptance, latestAppliedAcceptance)
  } catch (error) {
    if (transactionOpen && !committed) await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    if (managedBackupRescue) {
      if (!committed && managedBackupGuard) {
        discardManagedBackupRescue(managedBackupGuard, managedBackupRescue)
      } else {
        closeManagedBackupRescue(managedBackupRescue)
      }
      managedBackupRescue = null
    }
    if (locked) {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [
        params.policy.lock.classId,
        params.policy.lock.objectId,
      ]).catch(() => undefined)
    }
    if (managedBackupGuard) closeSync(managedBackupGuard.fd)
    await client.end().catch(() => undefined)
  }
}

export const COMMUNITY_STRICT_MIGRATION_TABLES_V1 = Object.freeze({
  receipt: STRICT_RECEIPT_TABLE,
  state: STRICT_STATE_TABLE,
})
