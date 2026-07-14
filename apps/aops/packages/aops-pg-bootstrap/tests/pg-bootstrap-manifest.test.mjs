import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  cpSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  AOPS_COMMUNITY_PG_BOOTSTRAP_MANIFEST_V1,
  AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1,
  createAuthV2PgBootstrapAdapter,
  inspectCommunityAgentspaceMigrationBundle,
  resolveAopsPgBootstrapResource,
  runAopsPgBootstrapManifest,
  validateAopsPgBootstrapManifest,
} from '../dist/index.js'

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..')

function createWorkspaceResources() {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-pg-bootstrap-manifest-'))
  const serverRoot = path.join(root, 'apps', 'aops-server')
  mkdirSync(serverRoot, { recursive: true })
  writeFileSync(path.join(serverRoot, 'drizzle.aops.config.ts'), 'export default {}\n', 'utf8')
  writeFileSync(path.join(serverRoot, 'drizzle.authv2.config.ts'), 'export default {}\n', 'utf8')
  return root
}

function assertDataOnly(value) {
  assert.notEqual(typeof value, 'function')
  if (Array.isArray(value)) {
    value.forEach(assertDataOnly)
    return
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(assertDataOnly)
  }
}

test('canonical manifests are data-only, exact, and valid', () => {
  validateAopsPgBootstrapManifest(AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1)
  validateAopsPgBootstrapManifest(AOPS_COMMUNITY_PG_BOOTSTRAP_MANIFEST_V1)
  assert.deepEqual(
    AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1.targets.map((target) => target.id),
    ['aops', 'auth'],
  )
  assert.deepEqual(AOPS_COMMUNITY_PG_BOOTSTRAP_MANIFEST_V1, {
    schemaVersion: 1,
    targets: [{
      id: 'agentspace',
      adapterId: 'sql-migrations',
      resource: 'drizzle-out/agentspace-community',
      operations: ['migrate'],
    }],
  })
  assertDataOnly(AOPS_COMMUNITY_PG_BOOTSTRAP_MANIFEST_V1)
})

test('manifest runner resolves contained resources and invokes typed adapters in selection order', async () => {
  const root = createWorkspaceResources()
  const calls = []
  try {
    const adapters = ['workspace-drizzle', 'authv2'].map((id) => ({
      id,
      async run(context) {
        calls.push({ id, operation: context.operation, resourcePath: context.resourcePath })
      },
    }))
    const executions = await runAopsPgBootstrapManifest({
      manifest: AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1,
      adapters,
      operation: 'push',
      targetIds: ['aops', 'auth'],
      resourceRoot: root,
    })
    assert.deepEqual(calls.map((call) => call.id), ['workspace-drizzle', 'authv2'])
    assert.deepEqual(executions.map((execution) => execution.targetId), ['aops', 'auth'])
    assert.ok(calls.every((call) => call.resourcePath.startsWith(root)))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('manifest validation fails closed on duplicate, unknown, and escaping declarations', () => {
  assert.throws(
    () => validateAopsPgBootstrapManifest({
      schemaVersion: 1,
      targets: [
        { id: 'aops', adapterId: 'one', resource: 'a', operations: ['push'] },
        { id: 'aops', adapterId: 'two', resource: 'b', operations: ['push'] },
      ],
    }),
    /target_duplicate:aops/,
  )
  assert.throws(
    () => validateAopsPgBootstrapManifest({
      schemaVersion: 1,
      targets: [{ id: 'aops', adapterId: 'one', resource: '../private', operations: ['push'] }],
    }),
    /manifest_resource_escape/,
  )
  assert.throws(
    () => validateAopsPgBootstrapManifest({
      schemaVersion: 1,
      targets: [{ id: 'aops', adapterId: 'one', resource: 'config', operations: ['push'], hidden: true }],
    }),
    /unknown_or_missing_fields/,
  )
  assert.throws(
    () => validateAopsPgBootstrapManifest({
      schemaVersion: 1,
      targets: [{ id: 'aops', adapterId: 'one', resource: 'config', operations: ['push', 'push'] }],
    }),
    /operation_duplicate/,
  )
})

test('manifest runner refuses missing, duplicate, unknown adapters and invalid selections', async () => {
  const root = createWorkspaceResources()
  const noop = async () => undefined
  try {
    let firstTargetRan = false
    await assert.rejects(
      runAopsPgBootstrapManifest({
        manifest: AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1,
        adapters: [{ id: 'workspace-drizzle', run: async () => { firstTargetRan = true } }],
        operation: 'push',
        targetIds: ['aops', 'auth'],
        resourceRoot: root,
      }),
      /adapter_missing:auth:authv2/,
    )
    assert.equal(firstTargetRan, false, 'all selected targets must preflight before the first mutation')
    await assert.rejects(
      runAopsPgBootstrapManifest({
        manifest: AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1,
        adapters: [{ id: 'workspace-drizzle', run: noop }],
        operation: 'push',
        targetIds: ['auth'],
        resourceRoot: root,
      }),
      /adapter_missing:auth:authv2/,
    )
    await assert.rejects(
      runAopsPgBootstrapManifest({
        manifest: AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1,
        adapters: [{ id: 'workspace-drizzle', run: noop }, { id: 'workspace-drizzle', run: noop }],
        operation: 'push',
        targetIds: ['aops'],
        resourceRoot: root,
      }),
      /adapter_duplicate:workspace-drizzle/,
    )
    await assert.rejects(
      runAopsPgBootstrapManifest({
        manifest: AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1,
        adapters: [{ id: 'other', run: noop }],
        operation: 'push',
        targetIds: ['aops'],
        resourceRoot: root,
      }),
      /adapter_unknown:other/,
    )
    await assert.rejects(
      runAopsPgBootstrapManifest({
        manifest: AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1,
        adapters: [{ id: 'workspace-drizzle', run: noop }],
        operation: 'push',
        targetIds: ['missing'],
        resourceRoot: root,
      }),
      /target_unknown:missing/,
    )
    await assert.rejects(
      runAopsPgBootstrapManifest({
        manifest: AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1,
        adapters: [{ id: 'authv2', run: noop }],
        operation: 'migrate',
        targetIds: ['auth'],
        resourceRoot: root,
      }),
      /operation_not_allowed:auth:migrate/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('resource resolver rejects a symlink or junction component', (context) => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-pg-bootstrap-resource-root-'))
  const redirected = mkdtempSync(path.join(tmpdir(), 'aops-pg-bootstrap-resource-target-'))
  try {
    writeFileSync(path.join(redirected, 'config.ts'), 'export default {}\n', 'utf8')
    try {
      symlinkSync(redirected, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    } catch (error) {
      if (error?.code === 'EPERM' || error?.code === 'EACCES') {
        context.skip(`symlink/junction unavailable: ${error.code}`)
        return
      }
      throw error
    }
    assert.throws(
      () => resolveAopsPgBootstrapResource(root, 'linked/config.ts'),
      /resource_reparse_refused/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(redirected, { recursive: true, force: true })
  }
})

test('AuthV2 behavior is injected and missing injection never silently skips', async () => {
  const root = createWorkspaceResources()
  const applied = []
  try {
    const adapter = createAuthV2PgBootstrapAdapter(async (params) => {
      applied.push(params.repoUrl)
    })
    await runAopsPgBootstrapManifest({
      manifest: AOPS_WORKSPACE_PG_BOOTSTRAP_MANIFEST_V1,
      adapters: [adapter],
      operation: 'push',
      targetIds: ['auth'],
      resourceRoot: root,
      repoUrl: 'postgresql://example.invalid/aops',
    })
    assert.deepEqual(applied, ['postgresql://example.invalid/aops'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('packaged Community migration is a fresh exact Agentspace-only closure', () => {
  const migrationsDir = resolveAopsPgBootstrapResource(
    PACKAGE_ROOT,
    AOPS_COMMUNITY_PG_BOOTSTRAP_MANIFEST_V1.targets[0].resource,
  )
  const journal = JSON.parse(readFileSync(path.join(migrationsDir, 'meta', '_journal.json'), 'utf8'))
  assert.ok(Array.isArray(journal.entries) && journal.entries.length > 0)
  const inspection = inspectCommunityAgentspaceMigrationBundle(migrationsDir)
  assert.equal(inspection.entries.length, journal.entries.length)
  assert.ok(inspection.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)))
  const sql = journal.entries
    .map((entry) => readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), 'utf8'))
    .join('\n')
  const tables = [...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]).sort()
  assert.equal(tables.length, 33)
  for (const required of [
    'agent-runs',
    'agent-run-events',
    'workflow-definitions',
    'workflow-instances',
    'workflow-step-runs',
  ]) {
    assert.ok(tables.includes(required), `missing required Agentspace table: ${required}`)
  }
  assert.equal(
    tables.filter((table) => /^(?:authv2_|tasker-)|(?:kanban|sprint|task|worker-lease)/i.test(table)).length,
    0,
  )
})

test('Community migration bundle rejects orphan SQL and non-contiguous journal indexes', () => {
  const source = path.join(PACKAGE_ROOT, 'drizzle-out', 'agentspace-community')
  const orphanRoot = mkdtempSync(path.join(tmpdir(), 'aops-pg-orphan-'))
  const gapRoot = mkdtempSync(path.join(tmpdir(), 'aops-pg-gap-'))
  try {
    cpSync(source, orphanRoot, { recursive: true })
    writeFileSync(path.join(orphanRoot, 'orphan.sql'), 'select 1;\n', 'utf8')
    assert.throws(
      () => inspectCommunityAgentspaceMigrationBundle(orphanRoot),
      /aops_community_pg_bootstrap_orphan_sql:orphan\.sql/,
    )

    cpSync(source, gapRoot, { recursive: true })
    const journalPath = path.join(gapRoot, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
    journal.entries[0].idx = 2
    writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8')
    assert.throws(
      () => inspectCommunityAgentspaceMigrationBundle(gapRoot),
      /aops_community_pg_bootstrap_journal_idx_non_contiguous/,
    )
  } finally {
    rmSync(orphanRoot, { recursive: true, force: true })
    rmSync(gapRoot, { recursive: true, force: true })
  }
})

test('core package declares the four Community migration asset owners without runtime imports or AuthV2', () => {
  const packageJson = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'))
  assert.deepEqual(
    packageJson.aopsCommunityMigrationAssetDependencies,
    [
      '@aopslab/domain-pg-bootstrap-chatv3',
      '@aopslab/domain-pg-bootstrap-docman',
      '@aopslab/domain-pg-bootstrap-projectman',
      '@aopslab/domain-pg-bootstrap-sys',
    ],
  )
  assert.deepEqual(
    Object.keys(packageJson.dependencies ?? {})
      .filter((name) => name.startsWith('@aopslab/domain-pg-bootstrap-')),
    [],
  )
  assert.equal(packageJson.dependencies?.['@aopslab/domain-pg-bootstrap-authv2'], undefined)
  assert.ok(packageJson.files.includes('drizzle-out'))
  const shippedRuntime = [
    'index.js',
    'manifest.js',
    'community-migrate.js',
    'community-strict-migrate.js',
    'pg-bootstrap.js',
    'cli.js',
  ]
    .map((file) => readFileSync(path.join(PACKAGE_ROOT, 'dist', file), 'utf8'))
    .join('\n')
  assert.doesNotMatch(shippedRuntime, /domain-pg-bootstrap-/)
})
