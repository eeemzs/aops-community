import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

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
  assert.match(result.stdout, /aops setup server-env/)
  assert.match(result.stdout, /aops setup init/)
  assert.match(result.stdout, /aops server health/)
  assert.match(result.stdout, /aops cockpit/)
  assert.match(result.stdout, /aops assets/)
  assert.match(result.stdout, /aops --help/)
  assert.doesNotMatch(result.stdout, /^Usage:/m)
  assert.ok(result.stdout.trimEnd().split(/\r?\n/).length <= 10)
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
