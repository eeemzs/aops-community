import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  applyCommunityStrictPgSchema,
  fingerprintCommunityStrictCatalog,
  fingerprintCommunityStrictConvergence,
  fingerprintCommunityStrictReceipts,
  inspectCommunityStrictMigrationBundle,
  inspectCommunityStrictPgSchema,
  readCommunityStrictCatalogProjection,
  validateCommunityStrictMigrationPolicyV1,
} from '../dist/index.js'

const sha256 = (value) => createHash('sha256').update(value).digest('hex')
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

function createInspectClient({ projection, policy, rowsByTable = legacyRows(policy), strictReceipts, strictState, queries = [] }) {
  return {
    async connect() {},
    async end() {},
    async query(text) {
      queries.push(text)
      if (text.startsWith('SET SESSION')) return { rows: [] }
      if (text.startsWith('BEGIN') || text === 'COMMIT' || text === 'ROLLBACK' ||
          text.includes('pg_advisory_xact_lock')) return { rows: [] }
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

    const unsupportedRiskyUpgrade = structuredClone(fixture.policy)
    unsupportedRiskyUpgrade.roots[0].migrations[0].risk = 'destructive-or-dynamic'
    unsupportedRiskyUpgrade.lineages[0].appliedCounts[0] = 0
    assert.throws(
      () => validateCommunityStrictMigrationPolicyV1(unsupportedRiskyUpgrade),
      /community_strict_policy_risky_nonempty_lineage_unsupported_v1:legacy-v1/,
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

test('every catalog object family contributes to the exact fingerprint', () => {
  const baseline = projectionForTables([])
  const baselineFingerprint = fingerprintCommunityStrictCatalog(baseline)
  for (const section of [
    'relations', 'columns', 'constraints', 'indexes', 'views', 'sequences', 'inheritance',
    'routines', 'triggers', 'eventTriggers', 'rules', 'policies', 'types', 'extensions',
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

test('catalog projection fingerprints logical column order instead of restore-unstable storage artifacts', async () => {
  const fixture = createFixture()
  try {
    const queries = []
    await readCommunityStrictCatalogProjection(createInspectClient({
      projection: fixture.legacyProjection,
      policy: fixture.policy,
      queries,
    }))
    const columnQuery = queries.find((query) => query.includes('FROM pg_catalog.pg_attribute'))
    assert.match(columnQuery, /row_number\(\) OVER \(PARTITION BY c\.oid ORDER BY a\.attnum\)::integer/)
    assert.doesNotMatch(columnQuery, /atthasmissing|attmissingval/)
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

test('inspection rejects internal constraint-trigger overrides and database event triggers', async () => {
  const fixture = createFixture()
  try {
    for (const [section, row] of [
      ['triggers', {
        table: 'sys_product',
        name: null,
        internal: true,
        type: 9,
        enabled: 'D',
        constraint: 'sys_product_fk',
      }],
      ['eventTriggers', {
        name: 'intercept_ddl',
        event: 'ddl_command_start',
        enabled: 'O',
        tags: [],
        functionSchema: 'private_hooks',
        functionName: 'intercept',
        functionIdentityArguments: '',
      }],
    ]) {
      const projection = structuredClone(fixture.legacyProjection)
      projection[section].push(row)
      await assert.rejects(
        inspectCommunityStrictPgSchema({
          client: createInspectClient({ projection, policy: fixture.policy }),
          policy: fixture.policy,
        }),
        /community_strict_lineage_unknown/,
      )
    }
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
