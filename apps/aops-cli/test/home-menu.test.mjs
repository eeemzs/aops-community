import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  ensureCommunityHomeServerRunning,
  resolveCommunityHomeMode,
} from '../dist/lib/community-home.js'

const cliPath = fileURLToPath(new URL('../dist/main.js', import.meta.url))
const cliPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const isolatedHome = mkdtempSync(path.join(tmpdir(), 'aops-home-menu-'))

test.after(() => rmSync(isolatedHome, { recursive: true, force: true }))

function runCli(args = []) {
  const env = {
    ...process.env,
    NO_COLOR: '1',
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    LOCALAPPDATA: path.join(isolatedHome, 'local-app-data'),
    XDG_DATA_HOME: path.join(isolatedHome, 'xdg-data'),
  }
  delete env.AOPS_CLI_VERSION
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env,
  })
}

test('both CLI binary names expose the package version through Commander-standard flags', () => {
  assert.equal(cliPackage.bin.aops, cliPackage.bin['aops-cli'])
  for (const flag of ['--version', '-V', '--cli-version']) {
    const result = runCli([flag])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), cliPackage.version)
  }
})

test('root --version does not capture nested command version arguments', () => {
  const result = runCli(['doc', 'version', 'create', '--version', '2', '--help'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^Usage: aops doc version create/m)
  assert.match(result.stdout, /--version <number>/)
  assert.notEqual(result.stdout.trim(), cliPackage.version)
})

test('parameterless non-TTY invocation prints only the compact home', () => {
  const result = runCli()

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /aops setup guide/)
  assert.match(result.stdout, /aops setup ai/)
  assert.match(result.stdout, /aops setup server-env/)
  assert.match(result.stdout, /aops setup init/)
  assert.match(result.stdout, /aops server health/)
  assert.match(result.stdout, /aops cockpit/)
  assert.match(result.stdout, /aops assets/)
  assert.match(result.stdout, /aops --help/)
  assert.doesNotMatch(result.stdout, /^Usage:/m)
  assert.ok(result.stdout.trimEnd().split(/\r?\n/).length <= 10)
})

test('setup command has a compact non-TTY home with direct and AI-assisted paths', () => {
  const result = runCli(['setup'])

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /AOPS Setup/)
  assert.match(result.stdout, /aops setup init/)
  assert.match(result.stdout, /aops setup ai/)
  assert.match(result.stdout, /aops setup init --yes --json/)
  assert.match(result.stdout, /aops setup guide/)
  assert.ok(result.stdout.trimEnd().split(/\r?\n/).length <= 8)
})

test('home mode routes missing or unsafe local state to setup', () => {
  assert.equal(resolveCommunityHomeMode({
    inspectNative: () => ({ status: 'not-installed' }),
    inspectOci: () => ({ status: 'not-installed' }),
    getActiveTarget: () => undefined,
  }), 'setup')
  assert.equal(resolveCommunityHomeMode({
    inspectNative: () => ({ status: 'partial' }),
    inspectOci: () => ({ status: 'installed' }),
  }), 'setup')
  assert.equal(resolveCommunityHomeMode({
    inspectNative: () => ({ status: 'installed' }),
    inspectOci: () => ({ status: 'not-installed' }),
  }), 'operate')
  assert.equal(resolveCommunityHomeMode({
    inspectNative: () => ({ status: 'not-installed' }),
    inspectOci: () => ({ status: 'not-installed' }),
    getActiveTarget: () => ({ apiBaseUrl: 'https://aops.example.com' }),
  }), 'operate')
  assert.equal(resolveCommunityHomeMode({
    inspectNative: () => ({ status: 'not-installed' }),
    inspectOci: () => ({ status: 'not-installed' }),
    getActiveTarget: () => ({ apiBaseUrl: 'http://127.0.0.1:5900' }),
  }), 'setup')
})

test('parameterless home starts an installed stopped or crashed native server exactly once', async () => {
  for (const runtimeState of ['stopped', 'crashed']) {
    const starts = []
    const action = await ensureCommunityHomeServerRunning(
      async (options) => { starts.push(options) },
      {
        inspectNative: () => ({
          status: 'installed',
          paths: { dataRoot: '/safe/aops-community' },
          state: { instanceName: 'default' },
        }),
        inspectRuntime: async () => ({ runtimeState }),
      },
    )

    assert.equal(action, 'started')
    assert.deepEqual(starts, [{
      instance: 'default',
      dataRoot: '/safe/aops-community',
      detach: true,
      silent: true,
    }])
  }
})

test('parameterless home does not restart active or ambiguous native processes', async () => {
  for (const runtimeState of ['running', 'starting', 'unhealthy', 'identity-conflict', 'orphaned']) {
    let starts = 0
    const action = await ensureCommunityHomeServerRunning(
      async () => { starts += 1 },
      {
        inspectNative: () => ({
          status: 'installed',
          paths: { dataRoot: '/safe/aops-community' },
          state: { instanceName: 'default' },
        }),
        inspectRuntime: async () => ({ runtimeState }),
      },
    )

    assert.equal(starts, 0)
    assert.equal(
      action,
      runtimeState === 'running' || runtimeState === 'starting'
        ? 'already-active'
        : 'attention-required',
    )
  }
})

test('parameterless home never starts a server for missing or partial local setup', async () => {
  for (const inspection of [{ status: 'not-installed' }, { status: 'partial' }]) {
    let inspectedRuntime = false
    let starts = 0
    const action = await ensureCommunityHomeServerRunning(
      async () => { starts += 1 },
      {
        inspectNative: () => inspection,
        inspectRuntime: async () => { inspectedRuntime = true; return { runtimeState: 'stopped' } },
      },
    )

    assert.equal(starts, 0)
    assert.equal(inspectedRuntime, false)
    assert.equal(action, inspection.status === 'not-installed' ? 'not-applicable' : 'attention-required')
  }
})

test('explicit --help retains the full command catalog', () => {
  const result = runCli(['--help'])

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^Usage: aops/m)
  assert.match(result.stdout, /^  setup\s/m)
  assert.match(result.stdout, /^  server\s/m)
  assert.match(result.stdout, /^  cockpit\s/m)
  assert.match(result.stdout, /^  pm\s/m)
})
