import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  applyCommunityStrictPgSchema,
  buildCommunityStrictMigrationPlanV1,
  fingerprintCommunityStrictCatalog,
  fingerprintCommunityStrictConvergence,
  fingerprintCommunityStrictReceipts,
  inspectCommunityStrictMigrationBundle,
  inspectCommunityStrictPgSchema,
  planCommunityStrictPgSchema,
  readCommunityStrictCatalogProjection,
  validateCommunityStrictMigrationPolicyV1,
} from '../dist/index.js'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const platformCaseVariant = (value) => process.platform === 'win32' && /^[A-Z]:/.test(value)
  ? `${value[0].toLowerCase()}${value.slice(1)}`
  : value
const ROOT_IDS = ['sys', 'agentspace', 'docman', 'projectman', 'chatv3']
const MIGRATION_TABLES = Object.freeze({
  sys: 'sys_schema_migrations',
  agentspace: 'aops_community_schema_migrations',
  docman: 'docman_schema_migrations',
  projectman: 'projectman_schema_migrations',
  chatv3: 'chatv3_schema_migrations',
})

function projectionForTables(tables) {
  return {
    relations: [...tables].sort().map((table) => ({
      forceRowSecurity: false,
      kind: 'r',
      persistence: 'p',
      rowSecurity: false,
      table,
    })),
    columns: [],
    constraints: [],
    indexes: [],
    views: [],
    sequences: [],
    inheritance: [],
    routines: [],
    triggers: [],
    eventTriggers: [],
    rules: [],
    policies: [],
    types: [],
    extensions: [],
  }
}

function createPolicy({ workspaceRoot, legacyProjection, strictProjection }) {
  const roots = ROOT_IDS.map((id, ordinal) => {
    const migrationsDir = `roots/${id}`
    const sql = `CREATE TABLE ${id}_product (id text PRIMARY KEY);\n`
    const tag = `0000_${id}`
    const journal = `${JSON.stringify({ entries: [{ idx: 0, tag }] }, null, 2)}\n`
    const absolute = path.join(workspaceRoot, ...migrationsDir.split('/'))
    mkdirSync(path.join(absolute, 'meta'), { recursive: true })
    writeFileSync(path.join(absolute, `${tag}.sql`), sql)
    writeFileSync(path.join(absolute, 'meta', '_journal.json'), journal)
    return {
      id,
      ordinal,
      migrationsDir,
      migrationTable: MIGRATION_TABLES[id],
      legacyHashColumn: id === 'agentspace',
      journalSha256: sha256(journal),
      journalSha256History: [sha256(journal)],
      migrations: [{ idx: 0, tag, sha256: sha256(sql), risk: 'additive' }],
    }
  })
  const fullCounts = roots.map((root) => root.migrations.length)
  const convergenceSql = 'ALTER TABLE public."sys_product" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp with time zone'
  const convergence = [{
    id: 'sys-product-archived-at-v1',
    ownerRootId: 'sys',
    kind: 'add-column-if-missing',
    table: 'sys_product',
    column: 'archivedAt',
    dataType: 'timestamp with time zone',
    sha256: sha256(convergenceSql),
    risk: 'additive',
  }]
  const convergenceSha256 = fingerprintCommunityStrictConvergence(convergence)
  return {
    schemaVersion: 1,
    id: 'aops-community-strict-migration-v1',
    inventorySha256: sha256('inventory'),
    sourceArtifacts: {
      convergenceFileSha256: sha256('convergence-file'),
      lineagesFileSha256: sha256('lineages-file'),
    },
    lock: { classId: 28015, objectId: 71 },
    roots,
    convergence,
    convergenceSha256,
    lineages: [
      {
        id: 'legacy-v1',
        kind: 'legacy',
        postgresMajor: 17,
        relationCount: legacyProjection.relations.length,
        schemaFingerprintSha256: fingerprintCommunityStrictCatalog(legacyProjection),
        appliedCounts: fullCounts,
        policyId: 'aops-community-legacy-migration-v1',
        inventorySha256: sha256('legacy-inventory'),
        convergenceSha256,
      },
      {
        id: 'strict-v1',
        kind: 'strict',
        postgresMajor: 17,
        relationCount: strictProjection.relations.length,
        schemaFingerprintSha256: fingerprintCommunityStrictCatalog(strictProjection),
        appliedCounts: fullCounts,
        policyId: 'aops-community-strict-migration-v1',
        inventorySha256: sha256('inventory'),
        convergenceSha256,
      },
    ],
    lineageReconciliations: [],
    targetLineageId: 'strict-v1',
  }
}

function createFixture() {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'aops-community-strict-'))
  const legacyProjection = projectionForTables(Object.values(MIGRATION_TABLES))
  const strictProjection = projectionForTables([
    ...Object.values(MIGRATION_TABLES),
    'aops_community_migration_receipts_v1',
    'aops_community_migration_state_v1',
  ])
  const policy = createPolicy({ workspaceRoot, legacyProjection, strictProjection })
  return { workspaceRoot, legacyProjection, strictProjection, policy }
}

function legacyRows(policy) {
  return Object.fromEntries(policy.roots.map((root, ordinal) => [
    root.migrationTable,
    root.migrations.map((migration, migrationIdx) => ({
      tag: migration.tag,
      sha256: root.legacyHashColumn ? migration.sha256 : null,
      appliedAt: `2026-01-${String(ordinal + migrationIdx + 1).padStart(2, '0')}T00:00:00.000000Z`,
    })),
  ]))
}

function strictTrackedState(policy, strictProjection) {
  const rowsByTable = legacyRows(policy)
  const rootStates = policy.roots.map((root) => ({
    rootId: root.id,
    migrationTablePresent: true,
    rows: rowsByTable[root.migrationTable],
  }))
  const strictReceipts = policy.roots.flatMap((root, rootOrdinal) =>
    root.migrations.map((migration, migrationIdx) => ({
      rootId: root.id,
      rootOrdinal,
      migrationIdx,
      tag: migration.tag,
      sqlSha256: migration.sha256,
      journalSha256: root.journalSha256,
      appliedAt: rowsByTable[root.migrationTable][migrationIdx].appliedAt,
      provenance: 'exact-lineage-adoption',
    })),
  )
  const strictRowsSha256 = sha256(JSON.stringify(strictReceipts))
  const strictState = {
    policyId: policy.id,
    inventorySha256: policy.inventorySha256,
    convergenceSha256: policy.convergenceSha256,
    lineageId: policy.targetLineageId,
    schemaFingerprintSha256: fingerprintCommunityStrictCatalog(strictProjection),
    receiptFingerprintSha256: fingerprintCommunityStrictReceipts(policy, rootStates),
    strictReceiptRowsSha256: strictRowsSha256,
  }
  return { rowsByTable, rootStates, strictReceipts, strictRowsSha256, strictState }
}

function createInspectClient({
  projection,
  policy,
  rowsByTable = legacyRows(policy),
  strictReceipts,
  strictState,
  queries = [],
  acceptances = new Map(),
}) {
  return {
    async connect() {},
    async end() {},
    async query(text, params = []) {
      queries.push(text)
      if (text.startsWith('SET SESSION')) return { rows: [] }
      if (text.startsWith('BEGIN') || text === 'COMMIT' || text === 'ROLLBACK' ||
          text.includes('pg_advisory_xact_lock')) return { rows: [] }
      if (text.startsWith('CREATE SCHEMA IF NOT EXISTS aops_community_meta') ||
          text.startsWith('CREATE TABLE IF NOT EXISTS aops_community_meta.migration_plan_acceptances_v1')) {
        return { rows: [] }
      }
      if (text.startsWith('INSERT INTO aops_community_meta.migration_plan_acceptances_v1')) {
        if (!acceptances.has(String(params[0]))) {
          acceptances.set(String(params[0]), {
            acceptedPlanSha256: params[0],
            action: params[1],
            sourceFingerprintSha256: params[2],
            targetLineageId: params[3],
            resultLineageId: params[4],
            resultSchemaFingerprintSha256: params[5],
            resultReceiptFingerprintSha256: params[6],
            resultStateFingerprintSha256: params[7],
            evidenceKind: params[8],
            evidenceSha256: params[9],
            planJson: JSON.parse(params[10]),
            acceptedAt: params[11],
          })
        }
        return { rows: [] }
      }
      if (text.includes('FROM aops_community_meta.migration_plan_acceptances_v1') &&
          text.includes('WHERE accepted_plan_sha256 = $1')) {
        const row = acceptances.get(String(params[0]))
        return { rows: row ? [row] : [] }
      }
      if (text.includes('FROM aops_community_meta.migration_plan_acceptances_v1') &&
          text.includes("WHERE action = 'migrate'")) {
        const rows = [...acceptances.values()].filter((entry) => entry.action === 'migrate' &&
          entry.resultLineageId === params[0] && entry.resultSchemaFingerprintSha256 === params[1] &&
          entry.resultReceiptFingerprintSha256 === params[2])
        return { rows: rows.length === 0 ? [] : [rows.at(-1)] }
      }
      if (text.includes("current_setting('server_version_num')")) return { rows: [{ major: 17 }] }
      if (text.includes('FROM pg_catalog.pg_class c') && text.includes("c.relkind IN ('r', 'p', 'v'")) {
        return { rows: projection.relations }
      }
      if (text.includes('FROM pg_catalog.pg_attribute')) return { rows: projection.columns }
      if (text.includes('FROM pg_catalog.pg_constraint x')) return { rows: projection.constraints }
      if (text.includes('FROM pg_catalog.pg_index')) return { rows: projection.indexes }
      if (text.includes("c.relkind IN ('v', 'm')")) return { rows: projection.views }
      if (text.includes('FROM pg_catalog.pg_sequence')) return { rows: projection.sequences }
      if (text.includes('FROM pg_catalog.pg_inherits')) return { rows: projection.inheritance }
      if (text.includes('FROM pg_catalog.pg_proc')) return { rows: projection.routines }
      if (text.includes('FROM pg_catalog.pg_trigger')) return { rows: projection.triggers }
      if (text.includes('FROM pg_catalog.pg_event_trigger')) return { rows: projection.eventTriggers }
      if (text.includes('FROM pg_catalog.pg_rewrite')) return { rows: projection.rules }
      if (text.includes('FROM pg_catalog.pg_policy')) return { rows: projection.policies }
      if (text.includes('FROM pg_catalog.pg_type')) return { rows: projection.types }
      if (text.includes('FROM pg_catalog.pg_extension')) return { rows: projection.extensions }
      if (text.includes('FROM public.aops_community_migration_receipts_v1')) {
        return { rows: strictReceipts ?? [] }
      }
      if (text.includes('FROM public.aops_community_migration_state_v1')) {
        return { rows: strictState ? [strictState] : [] }
      }
      const match = /FROM public\."([^"]+)"/.exec(text)
      if (match) return { rows: rowsByTable[match[1]] ?? [] }
      throw new Error(`unexpected_test_query:${text}`)
    },
  }
}

function createRiskyFixture() {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'aops-community-strict-risky-'))
  const legacyProjection = projectionForTables(Object.values(MIGRATION_TABLES))
  const strictProjection = projectionForTables([
    ...Object.values(MIGRATION_TABLES),
    'sys_product',
    'aops_community_migration_receipts_v1',
    'aops_community_migration_state_v1',
  ])
  strictProjection.columns.push(
    { column: 'archivedAt', ordinal: 2, table: 'sys_product' },
    { column: 'id', ordinal: 1, table: 'sys_product' },
  )
  const policy = createPolicy({ workspaceRoot, legacyProjection, strictProjection })
  policy.roots[0].migrations[0].risk = 'destructive-or-dynamic'
  policy.lineages[0].appliedCounts = [...policy.lineages[0].appliedCounts]
  policy.lineages[0].appliedCounts[0] = 0
  const rowsByTable = legacyRows(policy)
  rowsByTable[MIGRATION_TABLES.sys] = []
  return { workspaceRoot, legacyProjection, strictProjection, policy, rowsByTable }
}

async function planRiskyFixture(fixture) {
  return planCommunityStrictPgSchema({
    repoUrl: 'postgresql://user:pass@localhost:5432/community',
    workspaceRoot: fixture.workspaceRoot,
    policy: fixture.policy,
    clientFactory: () => createInspectClient({
      projection: fixture.legacyProjection,
      policy: fixture.policy,
      rowsByTable: fixture.rowsByTable,
    }),
  })
}

function externalSnapshotEvidence(plan, policy, overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'external-snapshot-attestation',
    evidencePolicy: 'external-recovery-owner-attested-v1',
    createdAt: '2026-07-16T12:00:00.000Z',
    acceptedPlanSha256: plan.acceptedPlanSha256,
    sourceMigrationStateFingerprintSha256: plan.sourceFingerprintSha256,
    sourceLineageId: plan.lineageId,
    sourceSchemaFingerprintSha256: plan.schemaFingerprintSha256,
    sourceReceiptFingerprintSha256: plan.receiptFingerprintSha256,
    sourceDataFingerprintSha256: sha256(JSON.stringify(plan.dataSentinels)),
    sourceStateFingerprintSha256: plan.stateFingerprintSha256,
    targetInventorySha256: policy.inventorySha256,
    recoveryOwner: 'external',
    provider: 'operator-managed-postgresql',
    snapshotRef: 'snapshot/community-before-risky-migration',
    snapshotDigest: `sha256:${'a'.repeat(64)}`,
    attestedBy: 'test-operator',
    restoreInstructionsRef: 'runbook://community/external-postgresql-restore',
    ...overrides,
  }
}

function managedSnapshotEvidence(plan, policy, backupPath, backup) {
  const backupSha256 = `sha256:${sha256(backup)}`
  const dataSha256 = sha256(JSON.stringify(plan.dataSentinels))
  return {
    schemaVersion: 1,
    kind: 'managed-verified-backup',
    evidencePolicy: 'managed-restore-verified-v1',
    createdAt: '2026-07-16T12:00:00.000Z',
    acceptedPlanSha256: plan.acceptedPlanSha256,
    sourceMigrationStateFingerprintSha256: plan.sourceFingerprintSha256,
    sourceLineageId: plan.lineageId,
    sourceSchemaFingerprintSha256: plan.schemaFingerprintSha256,
    sourceReceiptFingerprintSha256: plan.receiptFingerprintSha256,
    sourceDataFingerprintSha256: dataSha256,
    sourceStateFingerprintSha256: plan.stateFingerprintSha256,
    targetInventorySha256: policy.inventorySha256,
    backupPath: platformCaseVariant(backupPath),
    sha256: backupSha256,
    byteLength: backup.byteLength,
    restoreProof: {
      method: 'pg-restore-disposable-v1',
      backupSha256,
      backupByteLength: backup.byteLength,
      restoredSchemaFingerprintSha256: plan.schemaFingerprintSha256,
      restoredReceiptFingerprintSha256: plan.receiptFingerprintSha256,
      restoredDataFingerprintSha256: dataSha256,
      restoredStateFingerprintSha256: plan.stateFingerprintSha256,
    },
  }
}

function reorderJsonObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reorderJsonObjectKeys)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([key, candidate]) => [key, reorderJsonObjectKeys(candidate)]),
  )
}

function createRiskyApplyHarness(
  fixture,
  { failAcceptanceRead = false, beforeCommit, jsonbPlanRoundTrip = false, relationGrants = [] } = {},
) {
  const rowsByTable = structuredClone(fixture.rowsByTable)
  const strictReceipts = []
  const committedAcceptances = new Map()
  let transactionAcceptances = null
  let strictState = null
  let metadataReady = false
  let transactionOpen = false
  let commitCount = 0
  const queries = []

  const activeAcceptances = () => transactionAcceptances ?? committedAcceptances
  const client = {
    async connect() {},
    async end() {},
    async query(text, params = []) {
      queries.push(text)
      if (text.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] }
      if (text.includes('pg_advisory_unlock')) return { rows: [{ unlocked: true }] }
      if (text.startsWith('SET SESSION') || text.startsWith('LOCK TABLE')) return { rows: [] }
      if (text.startsWith('BEGIN')) {
        transactionOpen = true
        transactionAcceptances = new Map(committedAcceptances)
        return { rows: [] }
      }
      if (text === 'COMMIT') {
        commitCount += 1
        await beforeCommit?.(commitCount)
        if (transactionOpen && transactionAcceptances) {
          committedAcceptances.clear()
          for (const [key, value] of transactionAcceptances) committedAcceptances.set(key, value)
        }
        transactionOpen = false
        transactionAcceptances = null
        return { rows: [] }
      }
      if (text === 'ROLLBACK') {
        transactionOpen = false
        transactionAcceptances = null
        return { rows: [] }
      }
      if (text.includes("current_setting('server_version_num')")) return { rows: [{ major: 17 }] }
      if (text.includes('FROM pg_catalog.pg_class relation')) return { rows: relationGrants }
      if (text.startsWith('REVOKE ALL PRIVILEGES ON ')) return { rows: [] }

      const projection = metadataReady ? fixture.strictProjection : fixture.legacyProjection
      if (text.includes('FROM pg_catalog.pg_class c') &&
          text.includes("c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f', 'c')")) {
        return { rows: projection.relations }
      }
      if (text.includes('FROM pg_catalog.pg_attribute')) return { rows: projection.columns }
      if (text.includes('FROM pg_catalog.pg_constraint x')) return { rows: projection.constraints }
      if (text.includes('FROM pg_catalog.pg_index')) return { rows: projection.indexes }
      if (text.includes("c.relkind IN ('v', 'm')")) return { rows: projection.views }
      if (text.includes('FROM pg_catalog.pg_sequence')) return { rows: projection.sequences }
      if (text.includes('FROM pg_catalog.pg_inherits')) return { rows: projection.inheritance }
      if (text.includes('FROM pg_catalog.pg_proc')) return { rows: projection.routines }
      if (text.includes('FROM pg_catalog.pg_trigger')) return { rows: projection.triggers }
      if (text.includes('FROM pg_catalog.pg_event_trigger')) return { rows: projection.eventTriggers }
      if (text.includes('FROM pg_catalog.pg_rewrite')) return { rows: projection.rules }
      if (text.includes('FROM pg_catalog.pg_policy')) return { rows: projection.policies }
      if (text.includes('FROM pg_catalog.pg_type')) return { rows: projection.types }
      if (text.includes('FROM pg_catalog.pg_extension')) return { rows: projection.extensions }

      if (text === 'CREATE EXTENSION IF NOT EXISTS pgcrypto' ||
          text.startsWith('CREATE TABLE IF NOT EXISTS public."') ||
          text.startsWith('CREATE TABLE sys_product') ||
          text.startsWith('ALTER TABLE public."sys_product"')) {
        return { rows: [] }
      }
      const legacyInsert = /^INSERT INTO public\."([^"]+)" \(tag(?:, sha256)?\) VALUES/.exec(text)
      if (legacyInsert) {
        rowsByTable[legacyInsert[1]].push({
          tag: String(params[0]),
          sha256: params.length > 1 ? String(params[1]) : null,
          appliedAt: '2026-07-16T12:00:00.000000Z',
        })
        return { rows: [] }
      }
      if (text.includes('CREATE TABLE IF NOT EXISTS public.aops_community_migration_receipts_v1')) {
        return { rows: [] }
      }
      if (text.includes('CREATE TABLE IF NOT EXISTS public.aops_community_migration_state_v1')) {
        metadataReady = true
        return { rows: [] }
      }
      if (text.includes('SELECT COUNT(*)::text AS count FROM public.aops_community_migration_receipts_v1')) {
        return { rows: [{ count: String(strictReceipts.length) }] }
      }
      if (text.includes('INSERT INTO public.aops_community_migration_receipts_v1')) {
        strictReceipts.push({
          rootId: params[0],
          rootOrdinal: params[1],
          migrationIdx: params[2],
          tag: params[3],
          sqlSha256: params[4],
          journalSha256: params[5],
          appliedAt: params[6],
          provenance: params[7],
        })
        return { rows: [] }
      }
      if (text.includes('INSERT INTO public.aops_community_migration_state_v1')) {
        strictState = {
          policyId: params[0],
          inventorySha256: params[1],
          convergenceSha256: params[2],
          lineageId: params[3],
          schemaFingerprintSha256: params[4],
          receiptFingerprintSha256: params[5],
          strictReceiptRowsSha256: params[6],
        }
        return { rows: [] }
      }
      if (text.startsWith('CREATE SCHEMA IF NOT EXISTS aops_community_meta') ||
          text.startsWith('CREATE TABLE IF NOT EXISTS aops_community_meta.migration_plan_acceptances_v1')) {
        return { rows: [] }
      }
      if (text.startsWith('INSERT INTO aops_community_meta.migration_plan_acceptances_v1')) {
        activeAcceptances().set(String(params[0]), {
          acceptedPlanSha256: params[0],
          action: params[1],
          sourceFingerprintSha256: params[2],
          targetLineageId: params[3],
          resultLineageId: params[4],
          resultSchemaFingerprintSha256: params[5],
          resultReceiptFingerprintSha256: params[6],
          resultStateFingerprintSha256: params[7],
          evidenceKind: params[8],
          evidenceSha256: params[9],
          planJson: jsonbPlanRoundTrip
            ? reorderJsonObjectKeys(JSON.parse(params[10]))
            : JSON.parse(params[10]),
          acceptedAt: params[11],
        })
        return { rows: [] }
      }
      if (text.includes('FROM aops_community_meta.migration_plan_acceptances_v1') &&
          text.includes('WHERE accepted_plan_sha256 = $1')) {
        if (failAcceptanceRead) throw new Error('forced_acceptance_read_failure')
        const row = activeAcceptances().get(String(params[0]))
        return { rows: row ? [row] : [] }
      }
      if (text.includes('FROM aops_community_meta.migration_plan_acceptances_v1') &&
          text.includes("WHERE action = 'migrate'")) {
        const rows = [...committedAcceptances.values()].filter((entry) => entry.action === 'migrate' &&
          entry.resultLineageId === params[0] && entry.resultSchemaFingerprintSha256 === params[1] &&
          entry.resultReceiptFingerprintSha256 === params[2])
        return { rows: rows.length === 0 ? [] : [rows.at(-1)] }
      }
      if (text.includes('FROM public.aops_community_migration_receipts_v1')) {
        return { rows: strictReceipts }
      }
      if (text.includes('FROM public.aops_community_migration_state_v1')) {
        return { rows: strictState ? [strictState] : [] }
      }
      const tableMatch = /FROM public\."([^"]+)"/.exec(text)
      if (tableMatch) return { rows: rowsByTable[tableMatch[1]] ?? [] }
      throw new Error(`unexpected_test_query:${text}`)
    },
  }
  return { client, committedAcceptances, queries }
}

function publicMutationQueries(queries) {
  return queries.filter((query) =>
    query === 'CREATE EXTENSION IF NOT EXISTS pgcrypto' ||
    query.startsWith('CREATE TABLE IF NOT EXISTS public.') ||
    query.startsWith('CREATE TABLE sys_product') ||
    query.startsWith('ALTER TABLE public.') ||
    query.startsWith('INSERT INTO public.') ||
    query.startsWith('UPDATE public.') ||
    query.startsWith('DELETE FROM public.') ||
    query.startsWith('REVOKE ALL PRIVILEGES ON ') ||
    query.startsWith('DROP '),
  )
}

test('strict policy and bundle pin all five journals and exact SQL bytes', () => {
  const fixture = createFixture()
  try {
    validateCommunityStrictMigrationPolicyV1(fixture.policy)
    const bundle = inspectCommunityStrictMigrationBundle({
      policy: fixture.policy,
      workspaceRoot: fixture.workspaceRoot,
    })
    assert.deepEqual(bundle.roots.map((entry) => entry.root.id), ROOT_IDS)
    assert.equal(bundle.roots.flatMap((entry) => entry.migrations).length, 5)

    const first = bundle.roots[0].migrations[0]
    writeFileSync(first.sqlPath, `${first.sql}-- tampered\n`)
    assert.throws(
      () => inspectCommunityStrictMigrationBundle({ policy: fixture.policy, workspaceRoot: fixture.workspaceRoot }),
      /community_strict_sql_hash_mismatch:sys:0000_sys/,
    )
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('bundle rejects orphan SQL and policy rejects shape/order drift', () => {
  const fixture = createFixture()
  try {
    writeFileSync(path.join(fixture.workspaceRoot, 'roots', 'sys', 'orphan.sql'), 'SELECT 1;\n')
    assert.throws(
      () => inspectCommunityStrictMigrationBundle({ policy: fixture.policy, workspaceRoot: fixture.workspaceRoot }),
      /community_strict_sql_set_mismatch:sys/,
    )

    const reordered = structuredClone(fixture.policy)
    ;[reordered.roots[0], reordered.roots[1]] = [reordered.roots[1], reordered.roots[0]]
    assert.throws(() => validateCommunityStrictMigrationPolicyV1(reordered), /root_order_invalid/)

    const widened = structuredClone(fixture.policy)
    widened.roots[0].hidden = true
    assert.throws(() => validateCommunityStrictMigrationPolicyV1(widened), /root_keys_invalid/)

    const convergenceTamper = structuredClone(fixture.policy)
    convergenceTamper.convergence[0].column = 'changedAt'
    assert.throws(
      () => validateCommunityStrictMigrationPolicyV1(convergenceTamper),
      /community_strict_policy_convergence_hash_mismatch:0/,
    )

    const ambiguousClassifier = structuredClone(fixture.policy)
    ambiguousClassifier.lineages.push({ ...ambiguousClassifier.lineages[0], id: 'legacy-v1-copy' })
    assert.throws(
      () => validateCommunityStrictMigrationPolicyV1(ambiguousClassifier),
      /community_strict_policy_lineage_classifier_duplicate:legacy-v1-copy/,
    )
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('bundle rejects a journal meta directory symlink or junction', () => {
  const fixture = createFixture()
  const externalMeta = mkdtempSync(path.join(tmpdir(), 'aops-community-external-meta-'))
  try {
    const metaPath = path.join(fixture.workspaceRoot, 'roots', 'sys', 'meta')
    const journal = readFileSync(path.join(metaPath, '_journal.json'))
    rmSync(metaPath, { recursive: true, force: true })
    writeFileSync(path.join(externalMeta, '_journal.json'), journal)
    symlinkSync(externalMeta, metaPath, process.platform === 'win32' ? 'junction' : 'dir')
    assert.throws(
      () => inspectCommunityStrictMigrationBundle({ policy: fixture.policy, workspaceRoot: fixture.workspaceRoot }),
      /community_strict_migration_root_unsafe:roots\/sys\/meta/,
    )
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
    rmSync(externalMeta, { recursive: true, force: true })
  }
})

test('every AOPS-owned catalog object family contributes to the exact fingerprint', () => {
  const baseline = projectionForTables([])
  const baselineFingerprint = fingerprintCommunityStrictCatalog(baseline)
  for (const section of [
    'relations', 'columns', 'constraints', 'indexes', 'views', 'sequences', 'inheritance',
    'routines', 'triggers', 'rules', 'policies', 'types',
  ]) {
    const changed = structuredClone(baseline)
    changed[section].push({ name: `tamper-${section}` })
    assert.notEqual(
      fingerprintCommunityStrictCatalog(changed),
      baselineFingerprint,
      `${section} must be fingerprinted`,
    )
  }
})

test('provider-owned extensions and event triggers stay outside the AOPS lineage fingerprint', () => {
  const baseline = projectionForTables([])
  const providerManaged = structuredClone(baseline)
  providerManaged.extensions.push({ name: 'pg_stat_statements', schema: 'extensions', version: '1.11' })
  providerManaged.eventTriggers.push({
    name: 'provider_ddl_watch',
    event: 'ddl_command_end',
    functionSchema: 'provider_internal',
  })
  assert.equal(
    fingerprintCommunityStrictCatalog(providerManaged),
    fingerprintCommunityStrictCatalog(baseline),
  )
})

test('catalog projection keeps logical column order for sentinels but excludes it from lineage identity', async () => {
  const fixture = createFixture()
  try {
    const queries = []
    await readCommunityStrictCatalogProjection(createInspectClient({
      projection: fixture.legacyProjection,
      policy: fixture.policy,
      queries,
    }))
    const columnQuery = queries.find((query) => query.includes('FROM pg_catalog.pg_attribute'))
    const relationQuery = queries.find((query) => query.includes('FROM pg_catalog.pg_class c'))
    const routineQuery = queries.find((query) => query.includes('FROM pg_catalog.pg_proc p'))
    const typeQuery = queries.find((query) => query.includes('FROM pg_catalog.pg_type t'))
    assert.match(columnQuery, /row_number\(\) OVER \(PARTITION BY c\.oid ORDER BY a\.attnum\)::integer/)
    assert.doesNotMatch(columnQuery, /atthasmissing|attmissingval/)
    assert.match(relationQuery, /pg_catalog\.pg_extension/)
    assert.match(routineQuery, /pg_catalog\.pg_extension/)
    assert.match(typeQuery, /pg_catalog\.pg_extension/)
    assert.equal(queries.some((query) => query.includes('FROM pg_catalog.pg_event_trigger')), false)

    const firstOrder = projectionForTables(['restored_table'])
    firstOrder.columns.push(
      { table: 'restored_table', column: 'id', ordinal: 1, type: 'uuid' },
      { table: 'restored_table', column: 'name', ordinal: 2, type: 'text' },
    )
    const restoredOrder = structuredClone(firstOrder)
    restoredOrder.columns[0].ordinal = 2
    restoredOrder.columns[1].ordinal = 1
    assert.equal(
      fingerprintCommunityStrictCatalog(restoredOrder),
      fingerprintCommunityStrictCatalog(firstOrder),
    )
    restoredOrder.columns[1].type = 'character varying'
    assert.notEqual(
      fingerprintCommunityStrictCatalog(restoredOrder),
      fingerprintCommunityStrictCatalog(firstOrder),
    )
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('inspection accepts only an exact named legacy lineage', async () => {
  const fixture = createFixture()
  try {
    const queries = []
    const receipt = await inspectCommunityStrictPgSchema({
      client: createInspectClient({
        projection: fixture.legacyProjection,
        policy: fixture.policy,
        queries,
      }),
      policy: fixture.policy,
    })
    assert.equal(receipt.lineageId, 'legacy-v1')
    assert.equal(receipt.strictReceiptRowsSha256, null)
    assert.deepEqual(receipt.roots.map((root) => root.rows.length), [1, 1, 1, 1, 1])
    assert.ok(queries.includes('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'))
    assert.ok(queries.some((query) => query.includes('pg_advisory_xact_lock')))
    assert.equal(queries.at(-1), 'COMMIT')
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('inspection treats an untracked routine as a non-empty unknown lineage', async () => {
  const fixture = createFixture()
  try {
    const projection = projectionForTables([])
    projection.routines.push({ name: 'unexpected', kind: 'f', definition: 'CREATE FUNCTION unexpected()' })
    await assert.rejects(
      inspectCommunityStrictPgSchema({
        client: createInspectClient({ projection, policy: fixture.policy }),
        policy: fixture.policy,
      }),
      /community_strict_lineage_heuristic_only/,
    )
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('inspection rejects internal constraint-trigger overrides but ignores provider event triggers', async () => {
  const fixture = createFixture()
  try {
    const triggerOverride = structuredClone(fixture.legacyProjection)
    triggerOverride.triggers.push({
      table: String(fixture.legacyProjection.relations[0].table),
      name: null,
      internal: true,
      type: 9,
      enabled: 'D',
      constraint: 'sys_product_fk',
    })
    await assert.rejects(
      inspectCommunityStrictPgSchema({
        client: createInspectClient({ projection: triggerOverride, policy: fixture.policy }),
        policy: fixture.policy,
      }),
      /community_strict_lineage_unknown/,
    )

    const providerManaged = structuredClone(fixture.legacyProjection)
    providerManaged.eventTriggers.push({
      name: 'provider_ddl_watch',
      event: 'ddl_command_end',
      enabled: 'O',
      tags: [],
      functionSchema: 'provider_internal',
      functionName: 'watch_ddl',
      functionIdentityArguments: '',
    })
    providerManaged.extensions.push({ name: 'provider_extension', schema: 'extensions', version: '1.0' })
    const receipt = await inspectCommunityStrictPgSchema({
      client: createInspectClient({ projection: providerManaged, policy: fixture.policy }),
      policy: fixture.policy,
    })
    assert.equal(receipt.lineageId, 'legacy-v1')
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('inspection rejects partial migration tables and duplicate legacy tags', async () => {
  const fixture = createFixture()
  try {
    const partialProjection = projectionForTables(Object.values(MIGRATION_TABLES).slice(0, 2))
    await assert.rejects(
      inspectCommunityStrictPgSchema({
        client: createInspectClient({ projection: partialProjection, policy: fixture.policy }),
        policy: fixture.policy,
      }),
      /community_strict_lineage_partial_migration_tables/,
    )

    const duplicates = legacyRows(fixture.policy)
    duplicates[MIGRATION_TABLES.sys] = [
      duplicates[MIGRATION_TABLES.sys][0],
      duplicates[MIGRATION_TABLES.sys][0],
    ]
    await assert.rejects(
      inspectCommunityStrictPgSchema({
        client: createInspectClient({
          projection: fixture.legacyProjection,
          policy: fixture.policy,
          rowsByTable: duplicates,
        }),
        policy: fixture.policy,
      }),
      /community_strict_legacy_duplicate_tag:sys/,
    )
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('apply reconciles one exact partial five-root lineage without replaying existing Agentspace DDL', async () => {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'aops-community-strict-reconcile-'))
  try {
    const products = ROOT_IDS.map((id) => `${id}_product`)
    const legacyProjection = projectionForTables([...Object.values(MIGRATION_TABLES), ...products])
    const strictProjection = projectionForTables([
      ...Object.values(MIGRATION_TABLES),
      ...products,
      'aops_community_migration_receipts_v1',
      'aops_community_migration_state_v1',
    ])
    const policy = createPolicy({ workspaceRoot, legacyProjection, strictProjection })
    policy.roots[0].migrations[0].risk = 'destructive-or-dynamic'
    const sourceTables = new Set([
      'agentspace_product', 'docman_product', 'projectman_product', 'chatv3_product',
      MIGRATION_TABLES.docman, MIGRATION_TABLES.projectman, MIGRATION_TABLES.chatv3,
    ])
    const sourceProjection = projectionForTables(sourceTables)
    policy.lineageReconciliations = [{
      id: 'known-partial-v1',
      postgresMajor: 17,
      relationCount: sourceProjection.relations.length,
      schemaFingerprintSha256: fingerprintCommunityStrictCatalog(sourceProjection),
      appliedCounts: [0, 0, 1, 1, 1],
      targetLineageId: 'legacy-v1',
      rootModes: ['apply', 'adopt', 'unchanged', 'unchanged', 'unchanged'],
    }]
    const canonicalRows = legacyRows(policy)
    const rowsByTable = {
      [MIGRATION_TABLES.sys]: [],
      [MIGRATION_TABLES.agentspace]: [],
      [MIGRATION_TABLES.docman]: canonicalRows[MIGRATION_TABLES.docman],
      [MIGRATION_TABLES.projectman]: canonicalRows[MIGRATION_TABLES.projectman],
      [MIGRATION_TABLES.chatv3]: canonicalRows[MIGRATION_TABLES.chatv3],
    }
    const strictReceipts = []
    const acceptances = new Map()
    let strictState = null
    const queries = []
    const currentProjection = () => projectionForTables(sourceTables)
    const client = {
      async connect() {},
      async end() {},
      async query(text, params = []) {
        queries.push(text)
        if (text.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] }
        if (text.includes('pg_advisory_xact_lock')) return { rows: [] }
        if (text.includes('pg_advisory_unlock')) return { rows: [{ unlocked: true }] }
        if (text.startsWith('SET SESSION') || text.startsWith('BEGIN') || text === 'COMMIT' ||
            text === 'ROLLBACK' || text.startsWith('LOCK TABLE') ||
            text === 'CREATE EXTENSION IF NOT EXISTS pgcrypto') return { rows: [] }
        if (text.includes("current_setting('server_version_num')")) return { rows: [{ major: 17 }] }
        if (text.includes('FROM pg_catalog.pg_class relation')) return { rows: [] }
        if (text.startsWith('REVOKE ALL PRIVILEGES ON ')) return { rows: [] }

        const projection = currentProjection()
        if (text.includes('FROM pg_catalog.pg_class c') && text.includes("c.relkind IN ('r', 'p', 'v'")) {
          return { rows: projection.relations }
        }
        if (text.includes('FROM pg_catalog.pg_attribute')) return { rows: projection.columns }
        if (text.includes('FROM pg_catalog.pg_constraint x')) return { rows: projection.constraints }
        if (text.includes('FROM pg_catalog.pg_index')) return { rows: projection.indexes }
        if (text.includes("c.relkind IN ('v', 'm')")) return { rows: projection.views }
        if (text.includes('FROM pg_catalog.pg_sequence')) return { rows: projection.sequences }
        if (text.includes('FROM pg_catalog.pg_inherits')) return { rows: projection.inheritance }
        if (text.includes('FROM pg_catalog.pg_proc')) return { rows: projection.routines }
        if (text.includes('FROM pg_catalog.pg_trigger')) return { rows: projection.triggers }
        if (text.includes('FROM pg_catalog.pg_event_trigger')) return { rows: projection.eventTriggers }
        if (text.includes('FROM pg_catalog.pg_rewrite')) return { rows: projection.rules }
        if (text.includes('FROM pg_catalog.pg_policy')) return { rows: projection.policies }
        if (text.includes('FROM pg_catalog.pg_type')) return { rows: projection.types }
        if (text.includes('FROM pg_catalog.pg_extension')) return { rows: projection.extensions }

        if (text.startsWith('DECLARE aops_community_sentinel_') ||
            text.startsWith('CLOSE aops_community_sentinel_')) return { rows: [] }
        if (text.startsWith('FETCH FORWARD 512 FROM aops_community_sentinel_')) return { rows: [] }

        const legacyTableCreate = /^CREATE TABLE IF NOT EXISTS public\."([^"]+)"/.exec(text)
        if (legacyTableCreate && Object.values(MIGRATION_TABLES).includes(legacyTableCreate[1])) {
          sourceTables.add(legacyTableCreate[1])
          rowsByTable[legacyTableCreate[1]] ??= []
          return { rows: [] }
        }
        const productCreate = /^CREATE TABLE (\w+_product)/.exec(text)
        if (productCreate) {
          sourceTables.add(productCreate[1])
          return { rows: [] }
        }
        const migrationInsert = /^INSERT INTO public\."([^"]+)" \(tag(?:, sha256)?\)/.exec(text)
        if (migrationInsert) {
          const table = migrationInsert[1]
          rowsByTable[table].push({
            tag: params[0],
            sha256: table === MIGRATION_TABLES.agentspace ? params[1] : null,
            appliedAt: '2026-07-21T00:00:00.000000Z',
          })
          return { rows: [] }
        }
        if (text.startsWith('ALTER TABLE public."sys_product"')) return { rows: [] }

        if (text.includes('CREATE TABLE IF NOT EXISTS public.aops_community_migration_receipts_v1')) {
          sourceTables.add('aops_community_migration_receipts_v1')
          return { rows: [] }
        }
        if (text.includes('CREATE TABLE IF NOT EXISTS public.aops_community_migration_state_v1')) {
          sourceTables.add('aops_community_migration_state_v1')
          return { rows: [] }
        }
        if (text.includes('SELECT COUNT(*)::text AS count FROM public.aops_community_migration_receipts_v1')) {
          return { rows: [{ count: String(strictReceipts.length) }] }
        }
        if (text.includes('INSERT INTO public.aops_community_migration_receipts_v1')) {
          strictReceipts.push({
            rootId: params[0], rootOrdinal: params[1], migrationIdx: params[2], tag: params[3],
            sqlSha256: params[4], journalSha256: params[5], appliedAt: params[6], provenance: params[7],
          })
          return { rows: [] }
        }
        if (text.includes('INSERT INTO public.aops_community_migration_state_v1')) {
          strictState = {
            policyId: params[0], inventorySha256: params[1], convergenceSha256: params[2],
            lineageId: params[3], schemaFingerprintSha256: params[4],
            receiptFingerprintSha256: params[5], strictReceiptRowsSha256: params[6],
          }
          return { rows: [] }
        }
        if (text.includes('FROM public.aops_community_migration_receipts_v1')) {
          return { rows: strictReceipts }
        }
        if (text.includes('FROM public.aops_community_migration_state_v1')) {
          return { rows: strictState ? [strictState] : [] }
        }

        if (text.startsWith('CREATE SCHEMA IF NOT EXISTS aops_community_meta') ||
            text.startsWith('CREATE TABLE IF NOT EXISTS aops_community_meta.migration_plan_acceptances_v1')) {
          return { rows: [] }
        }
        if (text.startsWith('INSERT INTO aops_community_meta.migration_plan_acceptances_v1')) {
          acceptances.set(String(params[0]), {
            acceptedPlanSha256: params[0], action: params[1], sourceFingerprintSha256: params[2],
            targetLineageId: params[3], resultLineageId: params[4],
            resultSchemaFingerprintSha256: params[5], resultReceiptFingerprintSha256: params[6],
            resultStateFingerprintSha256: params[7], evidenceKind: params[8], evidenceSha256: params[9],
            planJson: JSON.parse(params[10]), acceptedAt: params[11],
          })
          return { rows: [] }
        }
        if (text.includes('FROM aops_community_meta.migration_plan_acceptances_v1') &&
            text.includes('WHERE accepted_plan_sha256 = $1')) {
          const row = acceptances.get(String(params[0]))
          return { rows: row ? [row] : [] }
        }
        if (text.includes('FROM aops_community_meta.migration_plan_acceptances_v1') &&
            text.includes("WHERE action = 'migrate'")) {
          const row = [...acceptances.values()].find((entry) => entry.action === 'migrate' &&
            entry.resultLineageId === params[0] && entry.resultSchemaFingerprintSha256 === params[1] &&
            entry.resultReceiptFingerprintSha256 === params[2])
          return { rows: row ? [row] : [] }
        }

        const legacyRead = /FROM public\."([^"]+)"/.exec(text)
        if (legacyRead && Object.values(MIGRATION_TABLES).includes(legacyRead[1])) {
          return { rows: rowsByTable[legacyRead[1]] ?? [] }
        }
        throw new Error(`unexpected_reconciliation_query:${text}`)
      },
    }
    const logs = []
    const planning = await planCommunityStrictPgSchema({
      repoUrl: 'postgresql://user:pass@localhost:5432/community',
      workspaceRoot,
      policy,
      clientFactory: () => client,
    })
    assert.equal(planning.lineageId, 'reconciliation:known-partial-v1')
    assert.equal(planning.migrationPlan.source.lineageId, 'reconciliation:known-partial-v1')
    assert.equal(planning.migrationPlan.action, 'migrate')
    assert.equal(planning.requiresSnapshotEvidence, false)
    const receipt = await applyCommunityStrictPgSchema({
      repoUrl: 'postgresql://user:pass@localhost:5432/community',
      workspaceRoot,
      policy,
      logs,
      expectedPlanSha256: planning.acceptedPlanSha256,
      clientFactory: () => client,
    })
    assert.equal(receipt.lineageId, 'strict-v1')
    assert.equal(receipt.acceptedPlanSha256, planning.acceptedPlanSha256)
    assert.equal(receipt.sourceFingerprintSha256, planning.sourceFingerprintSha256)
    assert.ok(sourceTables.has('sys_product'))
    assert.equal(rowsByTable[MIGRATION_TABLES.agentspace].length, 1)
    assert.ok(logs.some((line) => /Applying exact Community lineage reconciliation.*sys/.test(line)))
    assert.ok(logs.some((line) => /Adopting exact Community lineage reconciliation.*agentspace/.test(line)))
    assert.equal(queries.some((query) => /^CREATE TABLE agentspace_product/.test(query)), false)
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true })
  }
})

test('strict lineage binds exact receipt rows including provenance', async () => {
  const fixture = createFixture()
  try {
    const rowsByTable = legacyRows(fixture.policy)
    const rootStates = fixture.policy.roots.map((root) => ({
      rootId: root.id,
      migrationTablePresent: true,
      rows: rowsByTable[root.migrationTable],
    }))
    const strictReceipts = fixture.policy.roots.map((root, rootOrdinal) => ({
      rootId: root.id,
      rootOrdinal,
      migrationIdx: 0,
      tag: root.migrations[0].tag,
      sqlSha256: root.migrations[0].sha256,
      journalSha256: root.journalSha256,
      appliedAt: rowsByTable[root.migrationTable][0].appliedAt,
      provenance: 'exact-lineage-adoption',
    }))
    const strictRowsSha = sha256(JSON.stringify(strictReceipts))
    const strictState = {
      policyId: fixture.policy.id,
      inventorySha256: fixture.policy.inventorySha256,
      convergenceSha256: fixture.policy.convergenceSha256,
      lineageId: 'strict-v1',
      schemaFingerprintSha256: fingerprintCommunityStrictCatalog(fixture.strictProjection),
      receiptFingerprintSha256: fingerprintCommunityStrictReceipts(fixture.policy, rootStates),
      strictReceiptRowsSha256: strictRowsSha,
    }
    const exact = await inspectCommunityStrictPgSchema({
      client: createInspectClient({
        projection: fixture.strictProjection,
        policy: fixture.policy,
        rowsByTable,
        strictReceipts,
        strictState,
      }),
      policy: fixture.policy,
    })
    assert.equal(exact.lineageId, 'strict-v1')
    assert.equal(exact.strictReceiptRowsSha256, strictRowsSha)

    strictReceipts[0] = { ...strictReceipts[0], provenance: 'applied' }
    await assert.rejects(
      inspectCommunityStrictPgSchema({
        client: createInspectClient({
          projection: fixture.strictProjection,
          policy: fixture.policy,
          rowsByTable,
          strictReceipts,
          strictState,
        }),
        policy: fixture.policy,
      }),
      /community_strict_state_mismatch/,
    )
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('strict migration plan is deterministic, path-free, and changes with structural source drift', () => {
  const fixture = createFixture()
  try {
    const bundle = inspectCommunityStrictMigrationBundle({
      policy: fixture.policy,
      workspaceRoot: fixture.workspaceRoot,
    })
    const sourceRoots = fixture.policy.roots.map((root) => ({
      rootId: root.id,
      migrationTablePresent: false,
      rows: [],
    }))
    const sourceSchemaFingerprintSha256 = fingerprintCommunityStrictCatalog(projectionForTables([]))
    const input = {
      policy: fixture.policy,
      bundle,
      postgresMajor: 17,
      sourceLineageId: 'empty-v1',
      sourceSchemaFingerprintSha256,
      sourceStrictReceiptRowsSha256: null,
      sourceRoots,
    }
    const first = buildCommunityStrictMigrationPlanV1(input)
    const second = buildCommunityStrictMigrationPlanV1({
      ...input,
      policy: Object.fromEntries(Object.entries(fixture.policy).reverse()),
    })
    assert.deepEqual(second, first)
    assert.match(first.planSha256, /^[a-f0-9]{64}$/)
    assert.equal(first.plan.sourceFingerprintSha256, first.sourceFingerprintSha256)
    assert.equal(first.plan.action, 'migrate')
    assert.deepEqual(
      first.plan.pendingMigrations.map(({ rootId, migrationIdx, tag, sqlSha256 }) => ({
        rootId,
        migrationIdx,
        tag,
        sqlSha256,
      })),
      fixture.policy.roots.flatMap((root) => root.migrations.map((migration) => ({
        rootId: root.id,
        migrationIdx: migration.idx,
        tag: migration.tag,
        sqlSha256: migration.sha256,
      }))),
    )
    const serialized = JSON.stringify(first)
    assert.equal(serialized.includes(fixture.workspaceRoot), false)
    assert.equal(serialized.includes('postgresql://'), false)

    const drifted = buildCommunityStrictMigrationPlanV1({ ...input, postgresMajor: 18 })
    assert.notEqual(drifted.sourceFingerprintSha256, first.sourceFingerprintSha256)
    assert.notEqual(drifted.planSha256, first.planSha256)
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('expected plan mismatch fails under the advisory lock before any DDL', async () => {
  const fixture = createFixture()
  const queries = []
  try {
    const base = createInspectClient({
      projection: fixture.legacyProjection,
      policy: fixture.policy,
    })
    const client = {
      ...base,
      async query(text, params) {
        queries.push(text)
        if (text.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] }
        if (text.includes('pg_advisory_unlock')) return { rows: [{ unlocked: true }] }
        if (text.startsWith('LOCK TABLE')) return { rows: [] }
        return base.query(text, params)
      },
    }
    await assert.rejects(
      applyCommunityStrictPgSchema({
        repoUrl: 'postgresql://user:pass@localhost:5432/community',
        workspaceRoot: fixture.workspaceRoot,
        policy: fixture.policy,
        expectedPlanSha256: '0'.repeat(64),
        clientFactory: () => client,
      }),
      /community_strict_migration_plan_mismatch:expected=0{64}:actual=[a-f0-9]{64}/,
    )
    assert.match(queries[0], /pg_try_advisory_lock/)
    assert.ok(queries.some((query) => query.startsWith('LOCK TABLE')))
    assert.deepEqual(
      queries.filter((query) => /^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b/.test(query)),
      [],
    )
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('risky non-empty plan requires snapshot evidence before any public DDL', async () => {
  const fixture = createRiskyFixture()
  try {
    const harness = createRiskyApplyHarness(fixture)
    await assert.rejects(
      applyCommunityStrictPgSchema({
        repoUrl: 'postgresql://user:pass@localhost:5432/community',
        workspaceRoot: fixture.workspaceRoot,
        policy: fixture.policy,
        clientFactory: () => harness.client,
      }),
      /community_strict_snapshot_evidence_required/,
    )
    assert.deepEqual(publicMutationQueries(harness.queries), [])
    assert.ok(harness.queries.includes('ROLLBACK'))
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('external snapshot evidence rejects a wrong accepted plan or source fingerprint before public DDL', async () => {
  const fixture = createRiskyFixture()
  try {
    const plan = await planRiskyFixture(fixture)
    for (const [name, overrides] of [
      ['plan', { acceptedPlanSha256: '0'.repeat(64) }],
      ['source', { sourceMigrationStateFingerprintSha256: '1'.repeat(64) }],
    ]) {
      const evidencePath = path.join(fixture.workspaceRoot, `external-${name}.json`)
      writeFileSync(evidencePath, JSON.stringify(externalSnapshotEvidence(plan, fixture.policy, overrides)))
      const harness = createRiskyApplyHarness(fixture)
      await assert.rejects(
        applyCommunityStrictPgSchema({
          repoUrl: 'postgresql://user:pass@localhost:5432/community',
          workspaceRoot: fixture.workspaceRoot,
          policy: fixture.policy,
          expectedPlanSha256: plan.acceptedPlanSha256,
          snapshotEvidencePath: evidencePath,
          snapshotPolicy: 'managed-or-external-attested-v1',
          clientFactory: () => harness.client,
        }),
        /community_strict_snapshot_evidence_mismatch/,
      )
      assert.deepEqual(publicMutationQueries(harness.queries), [], name)
    }
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('external snapshot evidence rejects blank and credential-bearing recovery references before public DDL', async () => {
  const fixture = createRiskyFixture()
  try {
    const plan = await planRiskyFixture(fixture)
    for (const [name, overrides] of [
      ['blank-provider', { provider: '   ' }],
      ['userinfo', { snapshotRef: 'https://operator:secret@example.test/snapshot' }],
      ['scheme-relative-userinfo', { snapshotRef: '//operator:secret@example.test/snapshot' }],
      ['signed-query', { snapshotRef: 'https://example.test/snapshot?X-Amz-Signature=secret' }],
      ['runbook-query', { restoreInstructionsRef: 'https://example.test/restore?token=secret' }],
    ]) {
      const evidencePath = path.join(fixture.workspaceRoot, `external-unsafe-${name}.json`)
      writeFileSync(evidencePath, JSON.stringify(externalSnapshotEvidence(plan, fixture.policy, overrides)))
      const harness = createRiskyApplyHarness(fixture)
      await assert.rejects(
        applyCommunityStrictPgSchema({
          repoUrl: 'postgresql://user:pass@localhost:5432/community',
          workspaceRoot: fixture.workspaceRoot,
          policy: fixture.policy,
          expectedPlanSha256: plan.acceptedPlanSha256,
          snapshotEvidencePath: evidencePath,
          snapshotPolicy: 'managed-or-external-attested-v1',
          clientFactory: () => harness.client,
        }),
        /community_strict_external_snapshot_evidence_invalid/,
      )
      assert.deepEqual(publicMutationQueries(harness.queries), [], name)
    }
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('managed-or-external policy accepts exact external attestation after jsonb plan key reordering', async () => {
  const fixture = createRiskyFixture()
  try {
    const plan = await planRiskyFixture(fixture)
    const evidence = externalSnapshotEvidence(plan, fixture.policy)
    const evidencePath = path.join(fixture.workspaceRoot, 'external-exact.json')
    writeFileSync(evidencePath, JSON.stringify(evidence))
    const harness = createRiskyApplyHarness(fixture, {
      jsonbPlanRoundTrip: true,
      relationGrants: [
        { table: 'sys_product', kind: 'r', grantee: 'anon', publicGrantee: false },
        { table: 'sys_product', kind: 'r', grantee: null, publicGrantee: true },
      ],
    })

    const result = await applyCommunityStrictPgSchema({
      repoUrl: 'postgresql://user:pass@localhost:5432/community',
      workspaceRoot: fixture.workspaceRoot,
      policy: fixture.policy,
      expectedPlanSha256: plan.acceptedPlanSha256,
      snapshotEvidencePath: platformCaseVariant(evidencePath),
      snapshotPolicy: 'managed-or-external-attested-v1',
      now: () => new Date('2026-07-16T12:05:00.000Z'),
      clientFactory: () => harness.client,
    })

    assert.equal(result.acceptedPlanSha256, plan.acceptedPlanSha256)
    assert.equal(result.latestAppliedPlanSha256, plan.acceptedPlanSha256)
    assert.equal(result.durableAcceptance.action, 'migrate')
    assert.equal(result.durableAcceptance.evidenceKind, 'external-snapshot-attestation')
    assert.equal(result.durableAcceptance.evidenceSha256, sha256(JSON.stringify(evidence)))
    assert.equal(result.durableAcceptance.acceptedAt, '2026-07-16T12:05:00.000Z')
    assert.equal(harness.committedAcceptances.size, 1)
    assert.ok(harness.queries.includes('REVOKE ALL PRIVILEGES ON TABLE public."sys_product" FROM "anon"'))
    assert.ok(harness.queries.includes('REVOKE ALL PRIVILEGES ON TABLE public."sys_product" FROM PUBLIC'))

    const publicDdlIndex = harness.queries.findIndex((query) => query.startsWith('CREATE TABLE sys_product'))
    const auditIndex = harness.queries.findIndex((query) =>
      query.startsWith('INSERT INTO aops_community_meta.migration_plan_acceptances_v1'))
    const commitOffset = harness.queries.slice(auditIndex + 1).indexOf('COMMIT')
    assert.ok(publicDdlIndex >= 0)
    assert.ok(auditIndex > publicDdlIndex)
    assert.ok(commitOffset >= 0)
    assert.equal(harness.queries.slice(publicDdlIndex, auditIndex).includes('COMMIT'), false)
    assert.equal(harness.queries.slice(auditIndex + 1, auditIndex + 1 + commitOffset).includes('BEGIN'), false)
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('managed backup mutation in onPlanAccepted is detected before public DDL', async () => {
  const fixture = createRiskyFixture()
  try {
    const plan = await planRiskyFixture(fixture)
    const backup = Buffer.from('verified managed backup bytes')
    const replacement = Buffer.from('changed! managed backup bytes')
    assert.equal(replacement.byteLength, backup.byteLength)
    const backupPath = path.join(fixture.workspaceRoot, 'managed-backup.dump')
    const evidencePath = path.join(fixture.workspaceRoot, 'managed-backup.json')
    writeFileSync(backupPath, backup)
    writeFileSync(evidencePath, JSON.stringify(
      managedSnapshotEvidence(plan, fixture.policy, backupPath, backup),
    ))
    const harness = createRiskyApplyHarness(fixture)

    await assert.rejects(
      applyCommunityStrictPgSchema({
        repoUrl: 'postgresql://user:pass@localhost:5432/community',
        workspaceRoot: fixture.workspaceRoot,
        policy: fixture.policy,
        expectedPlanSha256: plan.acceptedPlanSha256,
        snapshotEvidencePath: platformCaseVariant(evidencePath),
        snapshotPolicy: 'managed-verified-only-v1',
        onPlanAccepted: () => writeFileSync(backupPath, replacement),
        clientFactory: () => harness.client,
      }),
      /community_strict_backup_guard_changed/,
    )
    assert.deepEqual(publicMutationQueries(harness.queries), [])
    assert.ok(harness.queries.includes('ROLLBACK'))
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('managed backup removed during COMMIT is rematerialized from a durable rescue copy', async () => {
  const fixture = createRiskyFixture()
  try {
    const plan = await planRiskyFixture(fixture)
    const backup = Buffer.from('verified managed backup bytes')
    const backupPath = path.join(fixture.workspaceRoot, 'managed-commit-backup.dump')
    const evidencePath = path.join(fixture.workspaceRoot, 'managed-commit-backup.json')
    writeFileSync(backupPath, backup)
    writeFileSync(evidencePath, JSON.stringify(
      managedSnapshotEvidence(plan, fixture.policy, backupPath, backup),
    ))
    const harness = createRiskyApplyHarness(fixture, {
      beforeCommit: (count) => {
        if (count === 2) rmSync(backupPath, { force: true })
      },
    })

    await assert.rejects(
      applyCommunityStrictPgSchema({
        repoUrl: 'postgresql://user:pass@localhost:5432/community',
        workspaceRoot: fixture.workspaceRoot,
        policy: fixture.policy,
        expectedPlanSha256: plan.acceptedPlanSha256,
        snapshotEvidencePath: evidencePath,
        snapshotPolicy: 'managed-verified-only-v1',
        clientFactory: () => harness.client,
      }),
      /community_strict_backup_guard_changed_after_commit:backup_preserved=/,
    )
    assert.deepEqual(readFileSync(backupPath), backup)
    assert.equal(harness.committedAcceptances.size, 1)
    assert.ok(publicMutationQueries(harness.queries).length > 0)
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('audit acceptance rolls back when its readback fails before the migration transaction commits', async () => {
  const fixture = createRiskyFixture()
  try {
    const plan = await planRiskyFixture(fixture)
    const evidencePath = path.join(fixture.workspaceRoot, 'external-audit-rollback.json')
    writeFileSync(evidencePath, JSON.stringify(externalSnapshotEvidence(plan, fixture.policy)))
    const harness = createRiskyApplyHarness(fixture, { failAcceptanceRead: true })

    await assert.rejects(
      applyCommunityStrictPgSchema({
        repoUrl: 'postgresql://user:pass@localhost:5432/community',
        workspaceRoot: fixture.workspaceRoot,
        policy: fixture.policy,
        expectedPlanSha256: plan.acceptedPlanSha256,
        snapshotEvidencePath: evidencePath,
        snapshotPolicy: 'managed-or-external-attested-v1',
        clientFactory: () => harness.client,
      }),
      /forced_acceptance_read_failure/,
    )

    const auditIndex = harness.queries.findIndex((query) =>
      query.startsWith('INSERT INTO aops_community_meta.migration_plan_acceptances_v1'))
    const rollbackIndex = harness.queries.indexOf('ROLLBACK', auditIndex + 1)
    assert.ok(publicMutationQueries(harness.queries).length > 0)
    assert.ok(auditIndex >= 0)
    assert.ok(rollbackIndex > auditIndex)
    assert.equal(harness.queries.slice(auditIndex + 1, rollbackIndex).includes('COMMIT'), false)
    assert.equal(harness.committedAcceptances.size, 0)
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('already exact target lineage persists a stable verify-only acceptance without public DDL', async () => {
  const fixture = createFixture()
  try {
    const tracked = strictTrackedState(fixture.policy, fixture.strictProjection)
    const createClient = (queries) => {
      const base = createInspectClient({
        projection: fixture.strictProjection,
        policy: fixture.policy,
        rowsByTable: tracked.rowsByTable,
        strictReceipts: tracked.strictReceipts,
        strictState: tracked.strictState,
      })
      return {
        ...base,
        async query(text, params) {
          queries.push(text)
          if (text.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] }
          if (text.includes('pg_advisory_unlock')) return { rows: [{ unlocked: true }] }
          return base.query(text, params)
        },
      }
    }
    const firstQueries = []
    const first = await applyCommunityStrictPgSchema({
      repoUrl: 'postgresql://user:pass@localhost:5432/community',
      workspaceRoot: fixture.workspaceRoot,
      policy: fixture.policy,
      clientFactory: () => createClient(firstQueries),
    })
    assert.equal(first.lineageId, fixture.policy.targetLineageId)
    assert.equal(first.migrationPlan.action, 'verify-only')
    assert.deepEqual(first.migrationPlan.pendingMigrations, [])
    assert.equal(first.migrationPlan.source.strictReceiptRowsSha256, tracked.strictRowsSha256)
    assert.equal(first.migrationPlan.sourceFingerprintSha256, first.sourceFingerprintSha256)
    assert.match(first.acceptedPlanSha256, /^[a-f0-9]{64}$/)
    assert.equal(first.durableAcceptance.action, 'verify-only')
    assert.equal(first.durableAcceptance.evidenceKind, null)
    assert.equal(first.latestAppliedPlanSha256, null)

    const secondQueries = []
    const second = await applyCommunityStrictPgSchema({
      repoUrl: 'postgresql://user:pass@localhost:5432/community',
      workspaceRoot: fixture.workspaceRoot,
      policy: fixture.policy,
      expectedPlanSha256: first.acceptedPlanSha256,
      clientFactory: () => createClient(secondQueries),
    })
    assert.equal(second.acceptedPlanSha256, first.acceptedPlanSha256)
    for (const queries of [firstQueries, secondQueries]) {
      assert.ok(queries.some((query) =>
        query.startsWith('INSERT INTO aops_community_meta.migration_plan_acceptances_v1')))
      assert.deepEqual(
        queries.filter((query) => /^(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|TRUNCATE)\b/.test(query) &&
          !query.includes('aops_community_meta')),
        [],
      )
    }
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('apply fails closed when the shared five-root advisory lock is busy', async () => {
  const fixture = createFixture()
  const queries = []
  let ended = false
  try {
    await assert.rejects(
      applyCommunityStrictPgSchema({
        repoUrl: 'postgresql://user:pass@localhost:5432/community',
        workspaceRoot: fixture.workspaceRoot,
        policy: fixture.policy,
        clientFactory: () => ({
          async connect() {},
          async query(text) {
            queries.push(text)
            return { rows: [{ acquired: false }] }
          },
          async end() { ended = true },
        }),
      }),
      /community_strict_lock_busy/,
    )
    assert.equal(queries.length, 1)
    assert.match(queries[0], /pg_try_advisory_lock/)
    assert.equal(ended, true)
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})

test('additive convergence preserves seeded rows using the preflight column set', async () => {
  const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'aops-community-strict-add-column-'))
  try {
    const legacyProjection = projectionForTables([...Object.values(MIGRATION_TABLES), 'sys_product'])
    legacyProjection.columns.push({ column: 'id', ordinal: 1, table: 'sys_product' })
    const strictProjection = projectionForTables([
      ...Object.values(MIGRATION_TABLES),
      'sys_product',
      'aops_community_migration_receipts_v1',
      'aops_community_migration_state_v1',
    ])
    strictProjection.columns.push(
      { column: 'archivedAt', ordinal: 2, table: 'sys_product' },
      { column: 'id', ordinal: 1, table: 'sys_product' },
    )
    const policy = createPolicy({ workspaceRoot, legacyProjection, strictProjection })
    const rowsByTable = legacyRows(policy)
    const strictReceipts = []
    let strictState = null
    let metadataReady = false
    const planAcceptances = new Map()
    const cursorDelivered = new Map()
    const queries = []

    const client = {
      async connect() {},
      async end() {},
      async query(text, params = []) {
        queries.push(text)
        if (text.includes('pg_try_advisory_lock')) return { rows: [{ acquired: true }] }
        if (text.includes('pg_advisory_unlock')) return { rows: [{ unlocked: true }] }
        if (text.startsWith('SET SESSION') || text.startsWith('BEGIN') || text === 'COMMIT' || text === 'ROLLBACK' ||
            text.startsWith('LOCK TABLE')) return { rows: [] }
        if (text.includes("current_setting('server_version_num')")) return { rows: [{ major: 17 }] }
        if (text.includes('FROM pg_catalog.pg_class relation')) return { rows: [] }
        if (text.startsWith('REVOKE ALL PRIVILEGES ON ')) return { rows: [] }

        const projection = metadataReady ? strictProjection : legacyProjection
        if (text.includes('FROM pg_catalog.pg_class c') && text.includes("c.relkind IN ('r', 'p', 'v'")) {
          return { rows: projection.relations }
        }
        if (text.includes('FROM pg_catalog.pg_attribute')) return { rows: projection.columns }
        if (text.includes('FROM pg_catalog.pg_constraint x')) return { rows: projection.constraints }
        if (text.includes('FROM pg_catalog.pg_index')) return { rows: projection.indexes }
        if (text.includes("c.relkind IN ('v', 'm')")) return { rows: projection.views }
        if (text.includes('FROM pg_catalog.pg_sequence')) return { rows: projection.sequences }
        if (text.includes('FROM pg_catalog.pg_inherits')) return { rows: projection.inheritance }
        if (text.includes('FROM pg_catalog.pg_proc')) return { rows: projection.routines }
        if (text.includes('FROM pg_catalog.pg_trigger')) return { rows: projection.triggers }
        if (text.includes('FROM pg_catalog.pg_event_trigger')) return { rows: projection.eventTriggers }
        if (text.includes('FROM pg_catalog.pg_rewrite')) return { rows: projection.rules }
        if (text.includes('FROM pg_catalog.pg_policy')) return { rows: projection.policies }
        if (text.includes('FROM pg_catalog.pg_type')) return { rows: projection.types }
        if (text.includes('FROM pg_catalog.pg_extension')) return { rows: projection.extensions }

        const declare = /^DECLARE (aops_community_sentinel_\d+) /.exec(text)
        if (declare) {
          cursorDelivered.set(declare[1], false)
          return { rows: [] }
        }
        const fetch = /^FETCH FORWARD 512 FROM (aops_community_sentinel_\d+)$/.exec(text)
        if (fetch) {
          if (cursorDelivered.get(fetch[1]) === false) {
            cursorDelivered.set(fetch[1], true)
            return { rows: [{ rowJson: '["row-1"]' }] }
          }
          return { rows: [] }
        }
        if (text.startsWith('CLOSE aops_community_sentinel_')) return { rows: [] }

        if (text.startsWith('ALTER TABLE public."sys_product"')) return { rows: [] }
        if (text.startsWith('CREATE TABLE IF NOT EXISTS public."') &&
            Object.values(MIGRATION_TABLES).some((table) => text.includes(`public."${table}"`))) {
          return { rows: [] }
        }
        if (text.includes('CREATE TABLE IF NOT EXISTS public.aops_community_migration_receipts_v1')) {
          return { rows: [] }
        }
        if (text.includes('CREATE TABLE IF NOT EXISTS public.aops_community_migration_state_v1')) {
          metadataReady = true
          return { rows: [] }
        }
        if (text.includes('SELECT COUNT(*)::text AS count FROM public.aops_community_migration_receipts_v1')) {
          return { rows: [{ count: String(strictReceipts.length) }] }
        }
        if (text.includes('INSERT INTO public.aops_community_migration_receipts_v1')) {
          strictReceipts.push({
            rootId: params[0],
            rootOrdinal: params[1],
            migrationIdx: params[2],
            tag: params[3],
            sqlSha256: params[4],
            journalSha256: params[5],
            appliedAt: params[6],
            provenance: params[7],
          })
          return { rows: [] }
        }
        if (text.includes('INSERT INTO public.aops_community_migration_state_v1')) {
          strictState = {
            policyId: params[0],
            inventorySha256: params[1],
            convergenceSha256: params[2],
            lineageId: params[3],
            schemaFingerprintSha256: params[4],
            receiptFingerprintSha256: params[5],
            strictReceiptRowsSha256: params[6],
          }
          return { rows: [] }
        }
        if (text.startsWith('CREATE SCHEMA IF NOT EXISTS aops_community_meta') ||
            text.startsWith('CREATE TABLE IF NOT EXISTS aops_community_meta.migration_plan_acceptances_v1')) {
          return { rows: [] }
        }
        if (text.startsWith('INSERT INTO aops_community_meta.migration_plan_acceptances_v1')) {
          if (!planAcceptances.has(String(params[0]))) {
            planAcceptances.set(String(params[0]), {
              acceptedPlanSha256: params[0],
              action: params[1],
              sourceFingerprintSha256: params[2],
              targetLineageId: params[3],
              resultLineageId: params[4],
              resultSchemaFingerprintSha256: params[5],
              resultReceiptFingerprintSha256: params[6],
              resultStateFingerprintSha256: params[7],
              evidenceKind: params[8],
              evidenceSha256: params[9],
              planJson: JSON.parse(params[10]),
              acceptedAt: params[11],
            })
          }
          return { rows: [] }
        }
        if (text.includes('FROM aops_community_meta.migration_plan_acceptances_v1') &&
            text.includes('WHERE accepted_plan_sha256 = $1')) {
          const row = planAcceptances.get(String(params[0]))
          return { rows: row ? [row] : [] }
        }
        if (text.includes('FROM aops_community_meta.migration_plan_acceptances_v1') &&
            text.includes("WHERE action = 'migrate'")) {
          const row = [...planAcceptances.values()].find((entry) => entry.action === 'migrate' &&
            entry.resultLineageId === params[0] && entry.resultSchemaFingerprintSha256 === params[1] &&
            entry.resultReceiptFingerprintSha256 === params[2])
          return { rows: row ? [row] : [] }
        }
        if (text.includes('FROM public.aops_community_migration_receipts_v1')) {
          return { rows: strictReceipts }
        }
        if (text.includes('FROM public.aops_community_migration_state_v1')) {
          return { rows: strictState ? [strictState] : [] }
        }
        const tableMatch = /FROM public\."([^"]+)"/.exec(text)
        if (tableMatch) return { rows: rowsByTable[tableMatch[1]] ?? [] }
        throw new Error(`unexpected_test_query:${text}`)
      },
    }

    const receipt = await applyCommunityStrictPgSchema({
      repoUrl: 'postgresql://user:pass@localhost:5432/community',
      workspaceRoot,
      policy,
      clientFactory: () => client,
    })
    assert.equal(receipt.lineageId, 'strict-v1')
    assert.deepEqual(receipt.dataSentinels, [{
      table: 'sys_product',
      columns: ['id'],
      rowCount: '1',
      rowDigest: sha256('9:["row-1"]'),
    }])
    const sentinelDeclarations = queries.filter((query) => query.startsWith('DECLARE aops_community_sentinel_'))
    assert.equal(sentinelDeclarations.length, 2)
    assert.ok(sentinelDeclarations.every((query) => query.includes('row_value."id"')))
    assert.ok(sentinelDeclarations.every((query) => !query.includes('row_value."archivedAt"')))
    const transactionCommands = queries.filter((query) => query.startsWith('BEGIN') || query === 'COMMIT')
    assert.deepEqual(transactionCommands.slice(0, 3), [
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
      'COMMIT',
      'BEGIN',
    ])
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true })
  }
})

test('test fixtures are raw-byte hashed rather than newline-normalized', () => {
  const fixture = createFixture()
  try {
    const root = fixture.policy.roots[0]
    const sqlPath = path.join(fixture.workspaceRoot, ...root.migrationsDir.split('/'), `${root.migrations[0].tag}.sql`)
    const bytes = readFileSync(sqlPath)
    assert.equal(root.migrations[0].sha256, sha256(bytes))
    assert.notEqual(root.migrations[0].sha256, sha256(bytes.toString('utf8').trim()))
  } finally {
    rmSync(fixture.workspaceRoot, { recursive: true, force: true })
  }
})
