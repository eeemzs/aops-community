import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { resolveCommunityHomeMode } from '../dist/lib/community-home.js'

const cliPath = fileURLToPath(new URL('../dist/main.js', import.meta.url))

function runCli(args = []) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  })
}

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

test('explicit --help retains the full command catalog', () => {
  const result = runCli(['--help'])

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^Usage: aops/m)
  assert.match(result.stdout, /^  setup\s/m)
  assert.match(result.stdout, /^  server\s/m)
  assert.match(result.stdout, /^  cockpit\s/m)
  assert.match(result.stdout, /^  pm\s/m)
})
