import { createHash } from 'node:crypto'
import {
  createReadStream,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs'
import path from 'node:path'

import { Client } from 'pg'

const STATEMENT_BREAKPOINT = '--> statement-breakpoint'
const STRICT_RECEIPT_TABLE = 'aops_community_migration_receipts_v1'
const STRICT_STATE_TABLE = 'aops_community_migration_state_v1'
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

export type CommunityStrictBackupEvidenceV1 = Readonly<{
  schemaVersion: 1
  backupPath: string
  sha256: string
  byteLength: number
  verified: true
  sourceLineageId: string
  sourceSchemaFingerprintSha256: string
  sourceReceiptFingerprintSha256: string
  sourceDataFingerprintSha256: string
  sourceStateFingerprintSha256: string
  targetInventorySha256: string
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
  for (const lineage of validatedLineages) {
    const pendingRisky = validatedRoots.some((root, index) =>
      root.migrations
        .slice(lineage.appliedCounts[index])
        .some((migration) => migration.risk === 'destructive-or-dynamic'),
    )
    if (pendingRisky) {
      throw new Error(`community_strict_policy_risky_nonempty_lineage_unsupported_v1:${lineage.id}`)
    }
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
            COALESCE((SELECT array_agg(acl_value::text ORDER BY acl_value::text)
                        FROM unnest(c.relacl) AS acl_value), ARRAY[]::text[]) AS "acl"
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_catalog.pg_tablespace ts ON ts.oid = c.reltablespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f', 'c')`,
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
      WHERE n.nspname = 'public'`,
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
  const eventTriggers = await client.query<Record<string, unknown>>(
    `SELECT e.evtname AS "name", e.evtevent AS "event", e.evtenabled AS "enabled",
            COALESCE((SELECT array_agg(tag_value ORDER BY tag_value)
                        FROM unnest(e.evttags) AS tag_value), ARRAY[]::text[]) AS "tags",
            fn_ns.nspname AS "functionSchema", fn.proname AS "functionName",
            pg_catalog.pg_get_function_identity_arguments(fn.oid) AS "functionIdentityArguments"
       FROM pg_catalog.pg_event_trigger e
       JOIN pg_catalog.pg_proc fn ON fn.oid = e.evtfoid
       JOIN pg_catalog.pg_namespace fn_ns ON fn_ns.oid = fn.pronamespace`,
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
        AND (t.typtype <> 'c' OR composite.relkind = 'c')`,
  )
  const extensions = await client.query<Record<string, unknown>>(
    `SELECT e.extname AS "name", e.extversion AS "version", n.nspname AS "schema",
            e.extrelocatable AS "relocatable"
       FROM pg_catalog.pg_extension e
       JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
      WHERE e.extname <> 'plpgsql'`,
  )
  return Object.freeze({
    relations: Object.freeze(sortCatalogRows(relations.rows)),
    columns: Object.freeze(sortCatalogRows(columns.rows)),
    constraints: Object.freeze(sortCatalogRows(constraints.rows)),
    indexes: Object.freeze(sortCatalogRows(indexes.rows)),
    views: Object.freeze(sortCatalogRows(views.rows)),
    sequences: Object.freeze(sortCatalogRows(sequences.rows)),
    inheritance: Object.freeze(sortCatalogRows(inheritance.rows)),
    routines: Object.freeze(sortCatalogRows(routines.rows)),
    triggers: Object.freeze(sortCatalogRows(triggers.rows)),
    eventTriggers: Object.freeze(sortCatalogRows(eventTriggers.rows)),
    rules: Object.freeze(sortCatalogRows(rules.rows)),
    policies: Object.freeze(sortCatalogRows(policies.rows)),
    types: Object.freeze(sortCatalogRows(types.rows)),
    extensions: Object.freeze(sortCatalogRows(extensions.rows)),
  })
}

export function fingerprintCommunityStrictCatalog(projection: CommunityStrictCatalogProjectionV1): string {
  return sha256Json(projection)
}

function relationNames(projection: CommunityStrictCatalogProjectionV1): Set<string> {
  return new Set(projection.relations
    .filter((row) => row.kind === 'r' || row.kind === 'p')
    .map((row) => String(row.table)))
}

function isEmptyCatalogProjection(projection: CommunityStrictCatalogProjectionV1): boolean {
  return Object.values(projection).every((rows) => rows.length === 0)
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
}): 'empty-v1' | CommunityStrictLineageV1 {
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
    if (migrationTableCount > 0 && migrationTableCount < params.policy.roots.length) {
      throw new Error('community_strict_lineage_partial_migration_tables')
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

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return `sha256:${hash.digest('hex')}`
}

async function verifyBackupEvidence(params: {
  evidencePath: string | undefined
  preflight: CommunityStrictStateReceiptV1
  policy: CommunityStrictMigrationPolicyV1
}): Promise<void> {
  if (!params.evidencePath) throw new Error('community_strict_backup_evidence_required')
  const evidencePath = path.resolve(params.evidencePath)
  if (!existsSync(evidencePath) || !lstatSync(evidencePath).isFile() || lstatSync(evidencePath).isSymbolicLink()) {
    throw new Error('community_strict_backup_evidence_invalid')
  }
  const raw = JSON.parse(readFileSync(evidencePath, 'utf8')) as unknown
  if (!isRecord(raw)) throw new Error('community_strict_backup_evidence_invalid')
  assertExactKeys('community_strict_backup_evidence', raw, [
    'schemaVersion',
    'backupPath',
    'sha256',
    'byteLength',
    'verified',
    'sourceLineageId',
    'sourceSchemaFingerprintSha256',
    'sourceReceiptFingerprintSha256',
    'sourceDataFingerprintSha256',
    'sourceStateFingerprintSha256',
    'targetInventorySha256',
    'restoreProof',
  ])
  const sourceDataFingerprintSha256 = sha256Json(params.preflight.dataSentinels)
  if (raw.schemaVersion !== 1 || raw.verified !== true || typeof raw.backupPath !== 'string' ||
      !path.isAbsolute(raw.backupPath) || typeof raw.sha256 !== 'string' || !PREFIXED_SHA256.test(raw.sha256) ||
      !Number.isSafeInteger(raw.byteLength) || Number(raw.byteLength) < 1 ||
      raw.sourceLineageId !== params.preflight.lineageId ||
      raw.sourceSchemaFingerprintSha256 !== params.preflight.schemaFingerprintSha256 ||
      raw.sourceReceiptFingerprintSha256 !== params.preflight.receiptFingerprintSha256 ||
      raw.sourceDataFingerprintSha256 !== sourceDataFingerprintSha256 ||
      raw.sourceStateFingerprintSha256 !== params.preflight.stateFingerprintSha256 ||
      raw.targetInventorySha256 !== params.policy.inventorySha256 || !isRecord(raw.restoreProof)) {
    throw new Error('community_strict_backup_evidence_mismatch')
  }
  assertExactKeys('community_strict_backup_restore_proof', raw.restoreProof, [
    'method',
    'backupSha256',
    'backupByteLength',
    'restoredSchemaFingerprintSha256',
    'restoredReceiptFingerprintSha256',
    'restoredDataFingerprintSha256',
    'restoredStateFingerprintSha256',
  ])
  if (raw.restoreProof.method !== 'pg-restore-disposable-v1' ||
      raw.restoreProof.backupSha256 !== raw.sha256 ||
      raw.restoreProof.backupByteLength !== raw.byteLength ||
      raw.restoreProof.restoredSchemaFingerprintSha256 !== params.preflight.schemaFingerprintSha256 ||
      raw.restoreProof.restoredReceiptFingerprintSha256 !== params.preflight.receiptFingerprintSha256 ||
      raw.restoreProof.restoredDataFingerprintSha256 !== sourceDataFingerprintSha256 ||
      raw.restoreProof.restoredStateFingerprintSha256 !== params.preflight.stateFingerprintSha256) {
    throw new Error('community_strict_backup_restore_proof_mismatch')
  }
  const backupPath = path.resolve(raw.backupPath)
  if (!existsSync(backupPath) || !lstatSync(backupPath).isFile() || lstatSync(backupPath).isSymbolicLink()) {
    throw new Error('community_strict_backup_file_invalid')
  }
  const stat = statSync(backupPath)
  if (stat.size !== raw.byteLength || await hashFile(backupPath) !== raw.sha256) {
    throw new Error('community_strict_backup_file_mismatch')
  }
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
  sourceLineage: CommunityStrictLineageV1 | null
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

function pendingRiskyMigrations(
  policy: CommunityStrictMigrationPolicyV1,
  roots: readonly CommunityStrictRootState[],
): CommunityStrictMigrationV1[] {
  return policy.roots.flatMap((root, index) =>
    root.migrations.slice(roots[index].rows.length).filter((migration) => migration.risk === 'destructive-or-dynamic'),
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

export async function applyCommunityStrictPgSchema(params: {
  repoUrl: string
  workspaceRoot: string
  policy: CommunityStrictMigrationPolicyV1
  backupEvidencePath?: string
  logs?: string[]
  clientFactory?: (repoUrl: string) => CommunityStrictPgClient
}): Promise<CommunityStrictStateReceiptV1> {
  if (!params.repoUrl) throw new Error('community_strict_repo_url_required')
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
    const discovered = await observeState({ client, policy: params.policy })
    const discoveredClassification = classifyObservedState({
      policy: params.policy,
      observed: discovered,
      postgresMajor,
    })
    const target = params.policy.lineages.find((lineage) => lineage.id === params.policy.targetLineageId)
    if (!target) throw new Error('community_strict_target_missing')
    if (discoveredClassification !== 'empty-v1' && discoveredClassification.id === target.id) {
      logs.push(`Community PostgreSQL lineage ${target.id} is already exact; no DDL applied.`)
      const exactReceipt = createStateReceipt({
        policy: params.policy,
        lineageId: target.id,
        observed: discovered,
        dataSentinels: [],
      })
      await client.query('COMMIT')
      transactionOpen = false
      committed = true
      return exactReceipt
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
    if (classification !== 'empty-v1' && classification.id === target.id) {
      logs.push(`Community PostgreSQL lineage ${target.id} became exact before table locking; no DDL applied.`)
      const exactReceipt = createStateReceipt({
        policy: params.policy,
        lineageId: target.id,
        observed: before,
        dataSentinels: [],
      })
      await client.query('COMMIT')
      transactionOpen = false
      committed = true
      return exactReceipt
    }
    const beforeSentinels = classification === 'empty-v1'
      ? []
      : await captureDataSentinels(client, before.projection, params.policy)
    const preflight = createStateReceipt({
      policy: params.policy,
      lineageId: classification === 'empty-v1' ? classification : classification.id,
      observed: before,
      dataSentinels: beforeSentinels,
    })
    const risky = pendingRiskyMigrations(params.policy, before.roots)
    if (classification !== 'empty-v1' && risky.length > 0) {
      await verifyBackupEvidence({
        evidencePath: params.backupEvidencePath,
        preflight,
        policy: params.policy,
      })
    }

    const preflightCounts = before.roots.map((root) => root.rows.length)
    if (params.policy.roots.some((root, index) => root.migrations.length > preflightCounts[index])) {
      await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    }
    await applyPendingMigrations({ client, bundle, preflightCounts, logs })
    await applyConvergenceOperations({ client, policy: params.policy, logs })
    await ensureCommunityStrictMetadataTablesV1(client)
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

    await client.query('COMMIT')
    transactionOpen = false
    committed = true
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
    logs.push(`Community PostgreSQL strict lineage ${target.id} verified under the shared lock.`)
    return postReceipt
  } catch (error) {
    if (transactionOpen && !committed) await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock($1, $2)', [
        params.policy.lock.classId,
        params.policy.lock.objectId,
      ]).catch(() => undefined)
    }
    await client.end().catch(() => undefined)
  }
}

export const COMMUNITY_STRICT_MIGRATION_TABLES_V1 = Object.freeze({
  receipt: STRICT_RECEIPT_TABLE,
  state: STRICT_STATE_TABLE,
})
