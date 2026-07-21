import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { runSetupInitOrchestrator } from '../dist/lib/setup-init-orchestrator.js'
import {
  readCommunityStarterSeedReceipt,
  resolveCommunityStarterCliEntry,
  seedCommunityStarterData,
} from '../dist/lib/community-starter-seed.js'
import { removeCommunityNativeManagedPostgres } from '../dist/lib/community-native-postgres.js'
import {
  inspectLocalPostgres,
  localPostgresInstallGuidance,
  provisionLocalPostgres,
} from '../dist/lib/setup-local-postgres.js'
import { inspectSetupReadiness } from '../dist/lib/setup-readiness.js'
import {
  ExternalPostgresProbeError,
  probeExternalPostgresConnection,
} from '../dist/lib/setup-external-postgres.js'
import { resolvePromptedPostgresUrl } from '../dist/lib/community-setup-server-env.js'
import { retryOfficialCatalogAdapterReady } from '../dist/lib/setup-official-catalog-bridge.js'

const cliPath = fileURLToPath(new URL('../dist/main.js', import.meta.url))

function runCli(args = []) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  })
}

function readiness(pathId = 'native-container', assetsReady = false) {
  const checks = [
    { id: 'installation-state', state: 'action-required', required: true, summary: 'install' },
    {
      id: 'agent-assets',
      state: assetsReady ? 'ready' : 'action-required',
      required: true,
      summary: assetsReady ? 'ready' : 'install',
      data: { recommendedAction: 'install' },
    },
    { id: 'first-admin', state: 'not-applicable', required: false, summary: 'n/a' },
    { id: 'target-login', state: 'not-applicable', required: false, summary: 'n/a' },
  ]
  if (pathId === 'native-external' || pathId === 'native-local') {
    checks.push({
      id: 'global-server-env', state: 'ready', required: true, summary: 'ready',
      data: { path: path.resolve('C:/private/aops.server.env') },
    })
  }
  if (pathId === 'native-local') {
    checks.push({ id: 'local-postgresql', state: 'ready', required: true, summary: 'ready' })
  }
  return {
    schemaVersion: 1,
    mutationFree: true,
    status: 'action-required',
    path: {
      id: pathId,
      number: pathId === 'native-external' ? '1' : pathId === 'native-container' ? '2' : pathId === 'native-local' ? '3' : null,
      title: pathId,
      source: pathId ? 'explicit' : 'unselected',
    },
    checks,
    nextActions: [],
  }
}

test('normal setup help exposes seed opt-out and managed PostgreSQL reset without a demo command', () => {
  const rootHelp = runCli(['--help'])
  const setupHelp = runCli(['setup', 'init', '--help'])
  const resetHelp = runCli(['server', 'reset', '--help'])
  assert.equal(rootHelp.status, 0, rootHelp.stderr)
  assert.equal(setupHelp.status, 0, setupHelp.stderr)
  assert.equal(resetHelp.status, 0, resetHelp.stderr)
  assert.doesNotMatch(rootHelp.stdout, /^  demo\s/m)
  assert.match(setupHelp.stdout, /aops setup ai/)
  assert.match(setupHelp.stdout, /--no-seed/)
  assert.match(setupHelp.stdout, /--path 2 --apply --yes/)
  assert.match(setupHelp.stdout, /--path 3 --apply/)
  assert.match(setupHelp.stdout, /AOPS_LOCAL_POSTGRES_ADMIN_PASSWORD/)
  assert.match(resetHelp.stdout, /--remove-managed-postgres/)
  assert.match(resetHelp.stdout, /--confirm-data-loss/)
})

test('path 3 readiness is mutation-free and returns local PostgreSQL recovery guidance', () => {
  const result = runCli(['setup', 'init', '--path', '3', '--local-postgres-port', '1', '--yes', '--json'])
  assert.equal(result.status, 0, result.stderr)
  const document = JSON.parse(result.stdout)
  const local = document.checks.find((check) => check.id === 'local-postgresql')
  assert.equal(document.mutationFree, true)
  assert.equal(local.state, 'action-required')
  assert.equal(local.data.port, 1)
  assert.match(local.next, /postgresql\.org\/download/)
})

test('non-interactive Docker PostgreSQL setup installs all runtime gateways and starter data by default', async () => {
  const calls = []
  let progressCalls = 0
  let assetsReady = false
  const provider = {
    status: async () => ({
      availability: 'available', state: assetsReady ? 'ready' : 'action-required',
      summary: assetsReady ? 'ready' : 'install', nextActions: [],
      data: { recommendedAction: 'install' },
    }),
    resolveRelease: async () => ({ fromRelease: 'C:/signed-release', source: 'bundled-npm' }),
    apply: async (options) => {
      calls.push(['assets', options])
      assetsReady = true
      return { availability: 'available', state: 'ready', summary: 'ready', nextActions: [] }
    },
  }
  await runSetupInitOrchestrator({ path: '2', apply: true, yes: true, noCatalog: true }, {
    inspectReadiness: async () => readiness('native-container', assetsReady),
    setupCommunityServer: async (options) => calls.push(['server', options]),
    agentAssets: provider,
    seedStarter: async (options) => {
      calls.push(['seed', options])
      return { status: 'seeded' }
    },
    progress: async (_label, action) => {
      progressCalls += 1
      return action()
    },
  })
  const server = calls.find(([name]) => name === 'server')[1]
  const assets = calls.find(([name]) => name === 'assets')[1]
  const seed = calls.find(([name]) => name === 'seed')[1]
  assert.equal(server.runtime, 'native')
  assert.equal(server.postgres, 'container')
  assert.equal(server.port, undefined)
  assert.equal(server.createPostgresSecret, undefined)
  assert.equal(assets.target, 'all')
  assert.equal(seed.instanceName, 'default')
  assert.equal(seed.origin, 'http://127.0.0.1:5900')
  assert.equal(progressCalls, 0)
})

test('interactive setup installs required agent assets without a second selection or confirmation', async () => {
  const calls = []
  const selectMessages = []
  const confirmMessages = []
  let assetsReady = false
  await runSetupInitOrchestrator({
    path: '2', skipBanner: true, noCatalog: true, seed: false,
  }, {
    inspectReadiness: async () => readiness('native-container', assetsReady),
    select: async (prompt) => {
      selectMessages.push(prompt.message)
      if (prompt.message === 'Managed PostgreSQL password:') return 'generate'
      throw new Error(`unexpected_select:${prompt.message}`)
    },
    confirm: async (prompt) => {
      confirmMessages.push(prompt.message)
      return true
    },
    setupCommunityServer: async (options) => calls.push(['server', options]),
    agentAssets: {
      status: async () => ({
        availability: 'available', state: assetsReady ? 'ready' : 'action-required',
        summary: assetsReady ? 'ready' : 'install', nextActions: [],
        data: { recommendedAction: 'install' },
      }),
      resolveRelease: async () => ({ fromRelease: 'C:/signed-release', source: 'bundled-npm' }),
      apply: async (options) => {
        calls.push(['assets', options])
        assetsReady = true
        return { availability: 'available', state: 'ready', summary: 'ready', nextActions: [] }
      },
    },
  })

  assert.deepEqual(selectMessages, ['Managed PostgreSQL password:'])
  assert.deepEqual(confirmMessages, [])
  assert.equal(calls.filter(([name]) => name === 'assets').length, 1)
  assert.equal(calls.find(([name]) => name === 'assets')[1].target, 'all')
})

for (const setupPath of [
  { number: '1', id: 'native-external', postgresTls: 'verify-full' },
  { number: '2', id: 'native-container', postgresTls: undefined },
  { number: '3', id: 'native-local', postgresTls: undefined },
]) {
  test(`setup path ${setupPath.number} reconciles the bundled signed official catalog by default`, async () => {
    const calls = []
    await runSetupInitOrchestrator({
      path: setupPath.number,
      postgresTls: setupPath.postgresTls,
      port: 5923,
      apply: true,
      yes: true,
      seed: false,
      agentAssets: 'skip',
    }, {
      inspectReadiness: async () => readiness(setupPath.id, false),
      probeExternalPostgres: async (options) => ({
        status: 'ready', tlsPolicy: options.tlsPolicy, transport: 'encrypted', serverMajor: 17,
      }),
      setupCommunityServer: async (options) => calls.push(['server', options]),
      officialCatalog: {
        resolveRelease: async (options) => {
          calls.push(['catalog.resolve', options])
          return { fromRelease: 'C:/npm/agent-assets-release', source: 'bundled-npm' }
        },
        reconcile: async (options) => {
          calls.push(['catalog.reconcile', options])
          return {
            state: 'current',
            scopeSlug: 'aops-official-catalog',
            releaseSetSha256: 'signed-release-set',
            mutation: 'applied',
            historyDeleteCount: 0,
            activationEffects: [],
          }
        },
      },
    })

    assert.equal(calls.filter(([name]) => name === 'catalog.resolve').length, 1)
    const reconcile = calls.find(([name]) => name === 'catalog.reconcile')[1]
    assert.equal(reconcile.fromRelease, path.resolve('C:/npm/agent-assets-release'))
    assert.equal(reconcile.apiBaseUrl, 'http://127.0.0.1:5923')
    assert.equal(calls.filter(([name]) => name === 'server').length, 1)
  })
}

test('setup reuses a healthy running server when its live database migration plan is current', async () => {
  const current = readiness('native-external', true)
  current.status = 'ready'
  current.checks = current.checks.map((check) => check.id === 'installation-state'
    ? { ...check, state: 'ready', summary: 'installed' }
    : check)
  current.checks.push(
    { id: 'runtime', state: 'ready', required: true, summary: 'runtime ready' },
    { id: 'host', state: 'ready', required: true, summary: 'host ready' },
  )
  let plans = 0
  let setups = 0
  let stops = 0
  await runSetupInitOrchestrator({
    path: '1', apply: true, yes: true, noCatalog: true, seed: false, agentAssets: 'skip',
    postgresConfig: path.resolve('C:/private/aops.server.env'), postgresTls: 'require',
  }, {
    inspectReadiness: async () => current,
    probeExternalPostgres: async () => ({
      status: 'ready', tlsPolicy: 'require', transport: 'encrypted', serverMajor: 17,
    }),
    planInstalledMigration: async () => {
      plans += 1
      return {
        planning: {
          migrationPlan: { action: 'verify-only' },
          acceptedPlanSha256: 'a'.repeat(64),
        },
      }
    },
    setupCommunityServer: async () => { setups += 1 },
    stopInstalledServer: async () => { stops += 1 },
  })
  assert.equal(plans, 1)
  assert.equal(setups, 0)
  assert.equal(stops, 0)
})

test('setup stops a healthy running server and applies only when its live database has pending migrations', async () => {
  const current = readiness('native-external', true)
  current.status = 'ready'
  current.checks = current.checks.map((check) => check.id === 'installation-state'
    ? { ...check, state: 'ready', summary: 'installed' }
    : check)
  current.checks.push(
    { id: 'runtime', state: 'ready', required: true, summary: 'runtime ready' },
    { id: 'host', state: 'ready', required: true, summary: 'host ready' },
  )
  let setups = 0
  let stops = 0
  await runSetupInitOrchestrator({
    path: '1', apply: true, yes: true, noCatalog: true, seed: false, agentAssets: 'skip',
    postgresConfig: path.resolve('C:/private/aops.server.env'), postgresTls: 'require',
  }, {
    inspectReadiness: async () => current,
    probeExternalPostgres: async () => ({
      status: 'ready', tlsPolicy: 'require', transport: 'encrypted', serverMajor: 17,
    }),
    planInstalledMigration: async () => ({
      planning: {
        migrationPlan: { action: 'migrate', pendingMigrations: ['002-next.sql'] },
        acceptedPlanSha256: 'b'.repeat(64),
      },
    }),
    setupCommunityServer: async () => { setups += 1 },
    stopInstalledServer: async () => { stops += 1 },
  })
  assert.equal(stops, 1)
  assert.equal(setups, 1)
})

test('interactive managed PostgreSQL accepts a masked custom password and reports long-running steps', async () => {
  const progressLabels = []
  const passwordPrompts = []
  let capturedSecret
  await runSetupInitOrchestrator({
    path: '2', apply: true, skipBanner: true, noCatalog: true, seed: false, agentAssets: 'skip',
  }, {
    inspectReadiness: async () => readiness('native-container', false),
    select: async (prompt) => prompt.message === 'Managed PostgreSQL password:' ? 'custom' : 'skip',
    password: async (prompt) => {
      passwordPrompts.push(prompt.message)
      if (prompt.message === 'PostgreSQL password:') {
        assert.match(prompt.validate('short'), /at least 16/i)
        assert.equal(prompt.validate('a-strong-custom-password-2026'), true)
      }
      if (prompt.message === 'Confirm PostgreSQL password:') {
        assert.match(prompt.validate('different-password-value'), /do not match/i)
        assert.equal(prompt.validate('a-strong-custom-password-2026'), true)
      }
      return 'a-strong-custom-password-2026'
    },
    progress: async (label, action) => {
      progressLabels.push(label)
      return action()
    },
    setupCommunityServer: async (options) => {
      capturedSecret = options.createPostgresSecret?.()
      options.resultSink?.({
        migration: {
          status: 'community-native-migration-verified',
          action: 'verify-only',
          pendingMigrationCount: 0,
        },
      })
    },
  })
  assert.deepEqual(passwordPrompts, ['PostgreSQL password:', 'Confirm PostgreSQL password:'])
  assert.equal(capturedSecret, 'a-strong-custom-password-2026')
  assert.ok(progressLabels.some((label) => /verifying migrations/i.test(label)))
  assert.ok(progressLabels.some((label) => /health and setup readiness/i.test(label)))
})

test('--no-seed and explicit gateway skip leave starter data and global pointers untouched', async () => {
  const calls = []
  await runSetupInitOrchestrator({
    path: '2', apply: true, yes: true, noCatalog: true, seed: false, agentAssets: 'skip',
  }, {
    inspectReadiness: async () => readiness('native-container', false),
    setupCommunityServer: async (options) => calls.push(['server', options]),
    agentAssets: {
      status: async () => ({ availability: 'available', state: 'action-required', summary: 'install', nextActions: [] }),
      apply: async (options) => { calls.push(['assets', options]); return { availability: 'available', state: 'ready', summary: 'ready', nextActions: [] } },
    },
    seedStarter: async (options) => { calls.push(['seed', options]); return { status: 'seeded' } },
  })
  assert.equal(calls.some(([name]) => name === 'assets'), false)
  assert.equal(calls.some(([name]) => name === 'seed'), false)
})

test('interactive setup menu promotes existing, Docker, and installed-local PostgreSQL without OCI', async () => {
  let capturedChoices = []
  await runSetupInitOrchestrator({
    skipBanner: true, noCatalog: true, seed: false, agentAssets: 'skip',
  }, {
    inspectReadiness: async (options) => readiness(options.path ?? null, false),
    select: async (prompt) => {
      if (prompt.message === 'Choose an AOPS setup path:') {
        capturedChoices = prompt.choices
        return 'native-container'
      }
      return 'install'
    },
    setupCommunityServer: async () => undefined,
  })
  const values = capturedChoices.map((choice) => choice.value)
  assert.deepEqual(values, ['native-external', 'native-container', 'native-local', 'cli-existing'])
  assert.match(capturedChoices[0].name, /existing PostgreSQL/i)
  assert.match(capturedChoices[1].name, /automatic Docker PostgreSQL/i)
  assert.match(capturedChoices[2].name, /installed on this computer/i)
})

test('interactive external PostgreSQL setup prompts for the URL first, tests require TLS, and refreshes the saved URL', async () => {
  const selects = []
  const calls = []
  let confirmCount = 0
  await runSetupInitOrchestrator({
    path: '1', skipBanner: true, noCatalog: true, agentAssets: 'skip',
  }, {
    inspectReadiness: async () => readiness('native-external', false),
    select: async (prompt) => {
      selects.push(prompt)
      return prompt.default
    },
    confirm: async () => {
      confirmCount += 1
      return true
    },
    setupServerEnv: async (options) => {
      calls.push(['server-env', options])
      return { ok: true, envPath: '/private/refreshed.server.env', repoDialect: 'pg', updated: true }
    },
    probeExternalPostgres: async (options) => {
      calls.push(['postgres-probe', options])
      return { status: 'ready', tlsPolicy: options.tlsPolicy, transport: 'encrypted', serverMajor: 17 }
    },
    setupCommunityServer: async (options) => {
      calls.push(['server', options])
      options.progressSink?.({ stage: 'migration-plan', message: 'Planning migrations...' })
    },
    seedStarter: async (options) => {
      calls.push(['seed', options])
      return { status: 'seeded' }
    },
  })
  assert.equal(selects.some((prompt) => prompt.message === 'External PostgreSQL TLS policy:'), false)
  assert.equal(confirmCount, 0)
  assert.equal(calls.filter(([name]) => name === 'server-env').length, 1)
  const probe = calls.find(([name]) => name === 'postgres-probe')[1]
  assert.equal(probe.configRef, '/private/refreshed.server.env')
  assert.equal(probe.tlsPolicy, 'require')
  const server = calls.find(([name]) => name === 'server')[1]
  assert.equal(server.postgresConfig, '/private/refreshed.server.env')
  assert.equal(server.postgresTls, 'require')
  assert.equal(server.silent, true)
  assert.equal(typeof server.progressSink, 'function')
  assert.equal(calls.filter(([name]) => name === 'seed').length, 1)
})

test('interactive external PostgreSQL asks for a TLS retry policy only after a TLS probe failure', async () => {
  const selects = []
  const probes = []
  let serverOptions
  await runSetupInitOrchestrator({
    path: '1', skipBanner: true, noCatalog: true, seed: false, agentAssets: 'skip',
  }, {
    inspectReadiness: async () => readiness('native-external', false),
    setupServerEnv: async () => ({
      ok: true, envPath: '/private/aops.server.env', repoDialect: 'pg', updated: true,
    }),
    select: async (prompt) => {
      selects.push(prompt)
      return 'disable'
    },
    probeExternalPostgres: async (options) => {
      probes.push(options)
      if (options.tlsPolicy === 'require') {
        throw new ExternalPostgresProbeError('setup_external_postgres_tls_connection_failed', 'tls')
      }
      return { status: 'ready', tlsPolicy: 'disable', transport: 'unencrypted', serverMajor: 17 }
    },
    setupCommunityServer: async (options) => { serverOptions = options },
  })
  assert.deepEqual(probes.map((probe) => probe.tlsPolicy), ['require', 'disable'])
  assert.equal(selects.length, 1)
  assert.match(selects[0].message, /TLS connection failed/i)
  assert.equal(selects[0].default, 'require')
  assert.deepEqual(selects[0].choices.map((choice) => choice.value), ['require', 'verify-full', 'disable'])
  assert.equal(serverOptions.postgresTls, 'disable')
})

test('external PostgreSQL probe verifies encrypted transport without exposing credentials', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-external-pg-probe-'))
  const envPath = path.join(root, 'aops.server.env')
  writeFileSync(envPath, 'AOPS_PG_URL=postgresql://aops:private-value@db.example:5432/aops\n')
  const configs = []
  let ended = false
  const result = await probeExternalPostgresConnection({
    configRef: envPath,
    tlsPolicy: 'require',
  }, {
    createClient: (config) => {
      configs.push(config)
      return {
        connect: async () => undefined,
        query: async () => ({ rows: [{ server_version_num: '170004' }] }),
        end: async () => { ended = true },
      }
    },
  })
  assert.deepEqual(result, {
    status: 'ready', tlsPolicy: 'require', transport: 'encrypted', serverMajor: 17,
  })
  assert.match(configs[0].connectionString, /sslmode=require/)
  assert.equal(ended, true)
  assert.doesNotMatch(JSON.stringify(result), /private-value|db\.example/)
})

test('external PostgreSQL password prompt keeps the saved URL on an empty Enter', () => {
  const saved = 'postgresql://user:secret@example.test:5432/aops'
  assert.equal(resolvePromptedPostgresUrl('', saved), saved)
  assert.equal(resolvePromptedPostgresUrl('   ', saved), saved)
  assert.equal(
    resolvePromptedPostgresUrl('postgresql://other:new@example.test:5432/aops', saved),
    'postgresql://other:new@example.test:5432/aops',
  )
})

test('setup waits for the official catalog agent tools to finish warming', async () => {
  let attempts = 0
  let clock = 0
  const result = await retryOfficialCatalogAdapterReady(async () => {
    attempts += 1
    if (attempts < 3) {
      const error = new Error('catalog warming')
      error.code = 'catalog_adapter_unavailable'
      throw error
    }
    return 'ready'
  }, 5_000, {
    now: () => clock,
    sleep: async (milliseconds) => { clock += milliseconds },
  })
  assert.equal(result, 'ready')
  assert.equal(attempts, 3)
  assert.equal(clock, 750)
})

test('starter seed resolves the packaged single-file CLI entry instead of a missing package-root main.js', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-starter-cli-entry-'))
  const dist = path.join(root, 'dist')
  const lib = path.join(dist, 'lib')
  mkdirSync(lib, { recursive: true })
  const packagedEntry = path.join(dist, 'aops-cli.mjs')
  const compiledModule = path.join(lib, 'community-starter-seed.js')
  const compiledEntry = path.join(dist, 'main.js')
  writeFileSync(packagedEntry, '#!/usr/bin/env node\n')
  writeFileSync(compiledModule, 'export {}\n')
  writeFileSync(compiledEntry, 'export {}\n')
  assert.equal(
    resolveCommunityStarterCliEntry(pathToFileURL(packagedEntry).href),
    path.resolve(packagedEntry),
  )
  assert.equal(
    resolveCommunityStarterCliEntry(pathToFileURL(compiledModule).href),
    path.resolve(compiledEntry),
  )
})

test('interactive path 3 preserves an existing remote env by proposing a separate private env file', async () => {
  const prompts = []
  let inspections = 0
  await runSetupInitOrchestrator({
    path: '3', skipBanner: true, noCatalog: true, seed: false, agentAssets: 'skip',
  }, {
    inspectReadiness: async (options) => {
      inspections += 1
      const result = readiness('native-local', false)
      const checks = result.checks.map((check) => check.id === 'global-server-env'
        ? options.postgresConfig
          ? { ...check, state: 'action-required', data: { path: options.postgresConfig, blocking: false } }
          : {
              ...check, state: 'action-required',
              data: { path: 'C:/Users/example/.aops/aops.server.env', blocking: true },
            }
        : check)
      return { ...result, checks }
    },
    input: async (prompt) => {
      prompts.push(prompt)
      return prompt.default
    },
    password: async () => '',
    provisionLocalPostgres: async (options) => {
      const result = {
        schemaVersion: 1, status: 'provisioned', host: options.host, port: options.port,
        database: options.database, appUser: options.appUser, serverMajor: 17,
      }
      Object.defineProperty(result, 'connectionUrl', {
        value: 'postgresql://aops:private@127.0.0.1:5432/aops',
      })
      return result
    },
    setupServerEnv: async (options) => ({
      ok: true, envPath: options.envPath, repoDialect: 'pg', updated: true,
    }),
    setupCommunityServer: async () => undefined,
  })
  assert.equal(inspections, 3)
  const envPrompt = prompts.find((prompt) => /Private server env/.test(prompt.message))
  assert.match(envPrompt.default, /aops\.default\.local\.server\.env$/)
})

test('local PostgreSQL discovery returns platform-specific actionable guidance without mutating the machine', async () => {
  const windows = await inspectLocalPostgres({
    platform: 'win32', host: '127.0.0.1', port: 5432,
    commandAvailable: () => false,
    portProbe: async () => false,
  })
  assert.equal(windows.status, 'not-detected')
  assert.match(windows.guidance.url, /postgresql\.org\/download\/windows/)
  assert.deepEqual(windows.guidance.commands, [])

  const stopped = await inspectLocalPostgres({
    platform: 'win32', host: '127.0.0.1', port: 5432,
    commandAvailable: (command) => command === 'psql',
    portProbe: async () => false,
  })
  assert.equal(stopped.status, 'installed-not-running')
  assert.ok(stopped.guidance.commands.some((command) => /Get-Service/.test(command)))

  const macos = localPostgresInstallGuidance('darwin', (command) => command === 'brew')
  assert.deepEqual(macos.commands, ['brew install postgresql@17', 'brew services start postgresql@17'])

  const linux = localPostgresInstallGuidance('linux', (command) => command === 'apt-get')
  assert.ok(linux.commands.some((command) => /apt-get install postgresql/.test(command)))
})

test('local PostgreSQL provisioning creates one dedicated role and database without serializing secrets', async () => {
  const configs = []
  const queries = []
  const clients = []
  const createClient = (config) => {
    configs.push(config)
    const client = {
      connect: async () => undefined,
      end: async () => undefined,
      query: async (sql, values) => {
        queries.push([sql, values])
        if (sql === 'SHOW server_version_num') return { rows: [{ server_version_num: '170000' }] }
        if (/rolsuper/.test(sql)) return { rows: [{ rolsuper: true, rolcreatedb: true, rolcreaterole: true }] }
        if (/SELECT EXISTS/.test(sql)) return { rows: [{ role_exists: false, database_exists: false }] }
        return { rows: [{}] }
      },
    }
    clients.push(client)
    return client
  }
  const result = await provisionLocalPostgres({
    host: '::1', port: 5432, adminUser: 'postgres', adminPassword: 'admin-private',
    database: 'aops_test', appUser: 'aops_test',
  }, {
    createClient,
    createPassword: () => 'generated-app-password-abcdefghijklmnopqrstuvwxyz',
  })
  assert.equal(result.status, 'provisioned')
  assert.equal(result.serverMajor, 17)
  assert.match(result.connectionUrl, /^postgresql:\/\/aops_test:generated-app-password-[^@]+@\[::1\]:5432\/aops_test$/)
  assert.doesNotMatch(JSON.stringify(result), /admin-private|generated-app-password|postgresql:\/\//)
  assert.equal(configs[0].password, 'admin-private')
  assert.ok(queries.some(([sql]) => /^CREATE ROLE/.test(sql)))
  assert.ok(queries.some(([sql]) => /^CREATE DATABASE/.test(sql)))
  assert.equal(clients.length, 2)
})

test('path 3 refuses an existing loopback env when its PostgreSQL port differs', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-local-pg-env-'))
  const envPath = path.join(root, 'aops.server.env')
  writeFileSync(envPath, 'AOPS_REPO_URL=postgresql://aops:private@127.0.0.1:5433/aops\n')
  const result = await inspectSetupReadiness({
    path: '3',
    postgresConfig: envPath,
    localPostgresPort: 5432,
    probes: {
      nativeInspection: { status: 'not-installed' },
      ociInspection: { status: 'not-installed' },
      activeTarget: null,
      commandAvailable: () => true,
      endpoint: { reachable: false, authRequired: null, firstAdminState: null },
      agentAssets: { availability: 'available', state: 'ready', summary: 'ready', nextActions: [] },
      localPostgres: {
        schemaVersion: 1, status: 'ready', host: '127.0.0.1', port: 5432,
        reachable: true, psqlAvailable: true, psqlVersion: '17.0',
        guidance: localPostgresInstallGuidance('win32', () => false),
      },
    },
  })
  const envCheck = result.checks.find((check) => check.id === 'global-server-env')
  assert.equal(envCheck.state, 'action-required')
  assert.equal(envCheck.data.blocking, true)
  assert.match(envCheck.summary, /different local port/i)
})

test('setup path 3 provisions local PostgreSQL, stores only app credentials, then uses normal external migration lifecycle', async () => {
  const calls = []
  let envReady = false
  await runSetupInitOrchestrator({
    path: '3', apply: true, skipBanner: true, noCatalog: true, seed: false, agentAssets: 'skip',
  }, {
    inspectReadiness: async (options) => {
      const result = readiness('native-local', false)
      const checks = result.checks.map((check) => check.id === 'global-server-env'
        ? envReady
          ? { ...check, state: 'ready', data: { path: 'C:/private/aops.server.env' } }
          : { ...check, state: 'action-required', data: { path: 'C:/private/aops.server.env' } }
        : check)
      return { ...result, checks }
    },
    input: async (prompt) => prompt.default,
    password: async () => 'admin-private',
    provisionLocalPostgres: async (options) => {
      calls.push(['provision', options])
      const result = {
        schemaVersion: 1, status: 'provisioned', host: options.host, port: options.port,
        database: options.database, appUser: options.appUser, serverMajor: 17,
      }
      Object.defineProperty(result, 'connectionUrl', { value: 'postgresql://aops:app-private@127.0.0.1:5432/aops' })
      return result
    },
    setupServerEnv: async (options) => {
      calls.push(['server-env', options])
      envReady = true
      return { ok: true, envPath: 'C:/private/aops.server.env', repoDialect: 'pg' }
    },
    setupCommunityServer: async (options) => calls.push(['server', options]),
  })
  const provision = calls.find(([name]) => name === 'provision')[1]
  const serverEnv = calls.find(([name]) => name === 'server-env')[1]
  const server = calls.find(([name]) => name === 'server')[1]
  assert.equal(provision.adminPassword, 'admin-private')
  assert.equal(serverEnv.repoUrl, 'postgresql://aops:app-private@127.0.0.1:5432/aops')
  assert.equal(server.runtime, 'native')
  assert.equal(server.postgres, 'external')
  assert.equal(server.postgresConfig, 'C:/private/aops.server.env')
  assert.equal(server.postgresTls, 'disable')
})

test('starter seed creates one small project graph and is idempotent by receipt', async () => {
  const dataRoot = mkdtempSync(path.join(tmpdir(), 'aops-starter-seed-'))
  const calls = []
  const ids = {
    project: '00000000-0000-4000-8000-000000000101', board: '00000000-0000-4000-8000-000000000102',
    task: '00000000-0000-4000-8000-000000000103', sprint: '00000000-0000-4000-8000-000000000104',
    group: '00000000-0000-4000-8000-000000000105', document: '00000000-0000-4000-8000-000000000106',
    version: '00000000-0000-4000-8000-000000000107', section: '00000000-0000-4000-8000-000000000108',
  }
  const runner = {
    async run(args) {
      calls.push([...args])
      const joined = args.slice(0, 3).join(' ')
      if (joined === 'project create --name') return { result: { data: { id: ids.project } } }
      if (joined === 'pm board create') return { result: { board: { id: ids.board } } }
      if (joined === 'pm ktask create') return { result: { task: { id: ids.task } } }
      if (joined === 'pm sprint create') return { result: { sprint: { id: ids.sprint } } }
      if (joined === 'doc group create') return { result: { group: { id: ids.group } } }
      if (joined === 'doc create --title') return { result: { document: { id: ids.document } } }
      if (joined === 'doc version create') return { result: { documentVersion: { id: ids.version } } }
      if (joined === 'doc section create') return { result: { section: { id: ids.section } } }
      return { result: { ok: true } }
    },
  }
  const first = await seedCommunityStarterData({
    instanceName: 'default', dataRoot, origin: 'http://127.0.0.1:5900', apply: true,
  }, runner)
  assert.equal(first.status, 'seeded')
  assert.equal(calls.length, 11)
  assert.ok(calls.some((args) => args.includes('First AOPS Sprint')))
  assert.ok(calls.some((args) => args.includes('AOPS Getting Started')))
  const receipt = readCommunityStarterSeedReceipt('default', dataRoot)
  assert.equal(receipt.entities.projectId, ids.project)
  assert.equal(receipt.instance, 'default')
  assert.doesNotMatch(JSON.stringify(receipt), /password|secretRef|postgresql:\/\//i)

  const second = await seedCommunityStarterData({
    instanceName: 'default', dataRoot, origin: 'http://127.0.0.1:5900', apply: true,
  }, runner)
  assert.equal(second.status, 'already-seeded')
  assert.equal(calls.length, 11)
})

function managedPostgresFixture(instanceName = 'default', labelInstance = instanceName) {
  const instanceRoot = mkdtempSync(path.join(tmpdir(), 'aops-managed-postgres-reset-'))
  const runtimeRoot = path.join(instanceRoot, 'runtime')
  mkdirSync(runtimeRoot)
  const secretContent = 'POSTGRES_DB=aops\nPOSTGRES_USER=aops\nPOSTGRES_PASSWORD=abcdefghijklmnopqrstuvwxyz0123456789_-\n'
  writeFileSync(path.join(runtimeRoot, 'native-postgres.env'), secretContent)
  const namespace = createHash('sha256').update(path.resolve(instanceRoot)).digest('hex').slice(0, 12)
  const secretSha256 = `sha256:${createHash('sha256').update(secretContent).digest('hex')}`
  const labels = JSON.stringify({
    'io.aopslab.aops-community.profile': 'native-container-postgres',
    'io.aopslab.aops-community.instance': labelInstance,
    'io.aopslab.aops-community.namespace': namespace,
    'io.aopslab.aops-community.secret-sha256': secretSha256,
  })
  const invocations = []
  const runtime = {
    sleep: async () => {},
    async run(invocation) {
      invocations.push(invocation.args)
      if (invocation.args[1] === 'inspect') return { exitCode: 0, stdout: labels, stderr: '' }
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  }
  return { instanceRoot, invocations, runtime }
}

test('managed PostgreSQL reset removes only exact label-verified resources', async () => {
  const fixture = managedPostgresFixture()
  const result = await removeCommunityNativeManagedPostgres({
    instanceName: 'default', instanceRoot: fixture.instanceRoot, runtime: fixture.runtime,
  })
  assert.equal(result.container, 'removed')
  assert.equal(result.volume, 'removed')
  assert.ok(fixture.invocations.some((args) => args[0] === 'container' && args[1] === 'rm'))
  assert.ok(fixture.invocations.some((args) => args[0] === 'volume' && args[1] === 'rm'))
})

test('managed PostgreSQL reset refuses drifted ownership labels without deletion', async () => {
  const fixture = managedPostgresFixture('default', 'another-instance')
  await assert.rejects(
    removeCommunityNativeManagedPostgres({
      instanceName: 'default', instanceRoot: fixture.instanceRoot, runtime: fixture.runtime,
    }),
    /ownership|label|instance/i,
  )
  assert.equal(fixture.invocations.some((args) => args[1] === 'rm'), false)
})
