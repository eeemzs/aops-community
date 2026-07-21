import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildCommunityInstanceContract,
  parseCommunityInstanceContract,
} from '../dist/lib/community-instance-contract.js'
import {
  inspectCommunityNativeSource,
  loadExternalPostgresUrl,
  reconcileCommunityNativePriorApplication,
} from '../dist/lib/community-native-lifecycle.js'
import { runCommunityServerSetup } from '../dist/commands/community-server.js'

function writeOfficialNpmRuntime(root, version, commitCharacter) {
  const source = {
    repository: 'https://github.com/eeemzs/aops-community',
    commit: commitCharacter.repeat(40),
  }
  const files = new Map([
    ['package.json', JSON.stringify({
      name: '@aopslab/aops-server', version, packageManager: 'pnpm@11.9.0', aopsSource: source,
    })],
    ['aops-server-runtime.json', JSON.stringify({
      schemaVersion: 1, kind: 'aops-server-npm-runtime', packageName: '@aopslab/aops-server',
      packageVersion: version, packageManager: 'pnpm@11.9.0', source,
    })],
    ['community-postgres.json', JSON.stringify({ schemaVersion: 1, version })],
    ['npm-shrinkwrap.json', JSON.stringify({ name: '@aopslab/aops-server', version, lockfileVersion: 3 })],
    ['runtime/agentspace-host-adapter.mjs', `export const version = '${version}'\n`],
    ['runtime/agentspace-tooling.mjs', 'export {}\n'],
    ['runtime/docman-host-adapter.mjs', 'export {}\n'],
    ['runtime/docman-policy.mjs', 'export {}\n'],
    ['runtime/docman-tooling.mjs', 'export {}\n'],
    ['runtime/projectman-host-adapter.mjs', 'export {}\n'],
    ['runtime/scope-context.mjs', 'export {}\n'],
    ['scripts/community-host.mjs', `export const version = '${version}'\n`],
    ['scripts/community-migration-policy-v1.json', JSON.stringify({ schemaVersion: 1, version })],
    ['build/handler.js', `export const version = '${version}'\n`],
    ['cockpit/index.html', `<html data-version="${version}"></html>\n`],
  ])
  for (const [relativePath, content] of files) {
    const target = path.join(root, relativePath)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
}

function priorState(source, envPath) {
  const placeholderSha = `sha256:${'0'.repeat(64)}`
  return {
    schemaVersion: 1,
    runtime: 'native',
    instanceName: 'default',
    installId: '00000000-0000-4000-8000-000000000000',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    source,
    build: {
      completedAt: '2026-07-20T00:00:00.000Z',
      hostEntry: path.join(source.root, 'scripts/community-host.mjs'),
      handlerEntry: path.join(source.root, 'build/handler.js'),
      cockpitIndex: path.join(source.root, 'cockpit/index.html'),
      hostEntrySha256: placeholderSha,
      handlerEntrySha256: placeholderSha,
      cockpitIndexSha256: placeholderSha,
      runtimeFileCount: 1,
      runtimeInventorySha256: placeholderSha,
      buildFingerprint: placeholderSha,
    },
    profile: 'native-external-postgres',
    postgres: { mode: 'external', configRef: envPath, tlsPolicy: 'disable' },
    server: { host: '127.0.0.1', port: 5900, exposure: 'loopback', publicPort: 5900 },
  }
}

function withPostgresEnv(url, callback) {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-container-runtime-'))
  const envPath = path.join(root, 'aops.server.env')
  try {
    writeFileSync(envPath, `AOPS_PG_URL=${url}\n`, { encoding: 'utf8', mode: 0o600 })
    return callback(envPath)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('container contract reuses native npm lifecycle with explicit exposure', () => {
  withPostgresEnv('postgresql://aops:secret@postgres:5432/aops', (envPath) => {
    const contract = buildCommunityInstanceContract({
      runtime: 'native',
      postgres: 'external',
      postgresConfig: envPath,
      postgresTls: 'disable',
      exposure: 'container',
      publicPort: 6190,
      port: 5900,
    })
    assert.equal(contract.profile, 'native-external-postgres')
    assert.equal(contract.server.exposure, 'container')
    assert.equal(contract.server.port, 5900)
    assert.equal(contract.server.publicPort, 6190)
    assert.match(
      loadExternalPostgresUrl(envPath, 'disable'),
      /sslmode=disable/,
    )
  })
})

test('explicit TLS disable is a supported user choice for remote PostgreSQL', () => {
  withPostgresEnv('postgresql://aops:secret@postgres:5432/aops', (envPath) => {
    assert.match(loadExternalPostgresUrl(envPath, 'disable'), /sslmode=disable/)
  })
  withPostgresEnv('postgresql://aops:secret@postgres.example:5432/aops', (envPath) => {
    assert.match(loadExternalPostgresUrl(envPath, 'disable'), /sslmode=disable/)
  })
})

test('native external setup automatically reconciles a failed pre-install journal and retries', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-native-failed-setup-retry-'))
  const envPath = path.join(root, 'aops.server.env')
  const dataRoot = path.join(root, 'data')
  writeFileSync(envPath, 'AOPS_PG_URL=postgresql://aops:secret@postgres.example:5432/aops\n')
  let attempts = 0
  const options = {
    runtime: 'native', postgres: 'external', postgresConfig: envPath, postgresTls: 'disable',
    dataRoot, apply: true, detach: true, silent: true,
  }
  const dependencies = {
    setupNativeInstall: async () => {
      attempts += 1
      throw new Error(attempts === 1 ? 'first_setup_failure' : 'second_setup_reached')
    },
  }
  try {
    await assert.rejects(runCommunityServerSetup(options, dependencies), /first_setup_failure/)
    await assert.rejects(runCommunityServerSetup(options, dependencies), /second_setup_reached/)
    assert.equal(attempts, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('container exposure keeps the hardened internal port contract', () => {
  assert.throws(
    () => buildCommunityInstanceContract({
      runtime: 'native',
      postgres: 'external',
      postgresTls: 'require',
      exposure: 'container',
      port: 6200,
    }),
    /community_setup_container_exposure_port_required:5900/,
  )
})

test('existing OCI setup contracts remain parseable without native container options', () => {
  const contract = buildCommunityInstanceContract({ runtime: 'oci', port: 5900 })
  assert.deepEqual(parseCommunityInstanceContract(contract), contract)
  assert.throws(
    () => parseCommunityInstanceContract({
      ...contract,
      server: { ...contract.server, exposure: 'container' },
    }),
    /community_instance_contract_oci_server_invalid/,
  )
})

test('macOS-style native npm retry adopts a newer official in-place runtime but blocks real drift', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-native-npm-retry-'))
  const sourceRoot = path.join(root, 'lib', 'node_modules', '@aopslab', 'aops-cli', 'node_modules', '@aopslab', 'aops-server')
  const envPath = path.join(root, 'aops.server.env')
  try {
    writeFileSync(envPath, 'AOPS_PG_URL=postgresql://aops:secret@postgres.example:5432/aops\n')
    writeOfficialNpmRuntime(sourceRoot, '0.1.4', 'a')
    const state = priorState(inspectCommunityNativeSource(sourceRoot), envPath)
    rmSync(sourceRoot, { recursive: true, force: true })
    writeOfficialNpmRuntime(sourceRoot, '0.1.5', 'b')
    const selectedSource = inspectCommunityNativeSource(sourceRoot)
    const contract = buildCommunityInstanceContract({
      runtime: 'native', postgres: 'external', postgresConfig: envPath,
      postgresTls: 'disable', instance: 'default', port: 5900,
    })

    assert.equal(reconcileCommunityNativePriorApplication({
      state,
      selectedSource,
      contract,
      selectedExternalConfigRef: envPath,
      selectedFromDefaultNpmRuntime: true,
    }), 'official-npm-update-adopted')
    assert.throws(() => reconcileCommunityNativePriorApplication({
      state,
      selectedSource,
      contract,
      selectedExternalConfigRef: path.join(root, 'different-owner.env'),
      selectedFromDefaultNpmRuntime: true,
    }), /community_native_application_source_adoption_database_mismatch/)
    assert.throws(() => reconcileCommunityNativePriorApplication({
      state,
      selectedSource,
      contract,
      selectedExternalConfigRef: envPath,
      selectedFromDefaultNpmRuntime: false,
    }), /community_native_prior_application_source_drift/)
    assert.throws(() => reconcileCommunityNativePriorApplication({
      state: {
        ...state,
        build: {
          ...state.build,
          hostEntry: path.join(sourceRoot, 'apps/aops-server/scripts/community-host.mjs'),
        },
      },
      selectedSource,
      contract,
      selectedExternalConfigRef: envPath,
      selectedFromDefaultNpmRuntime: true,
    }), /community_native_prior_application_source_drift/)

    rmSync(sourceRoot, { recursive: true, force: true })
    writeOfficialNpmRuntime(sourceRoot, '0.1.4', 'c')
    assert.throws(() => reconcileCommunityNativePriorApplication({
      state,
      selectedSource: inspectCommunityNativeSource(sourceRoot),
      contract,
      selectedExternalConfigRef: envPath,
      selectedFromDefaultNpmRuntime: true,
    }), /community_native_prior_application_source_drift/)

    rmSync(sourceRoot, { recursive: true, force: true })
    writeOfficialNpmRuntime(sourceRoot, '0.1.3', 'd')
    assert.throws(() => reconcileCommunityNativePriorApplication({
      state,
      selectedSource: inspectCommunityNativeSource(sourceRoot),
      contract,
      selectedExternalConfigRef: envPath,
      selectedFromDefaultNpmRuntime: true,
    }), /community_native_application_downgrade_refused/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
