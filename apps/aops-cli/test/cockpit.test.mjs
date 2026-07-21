import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveCommunityCockpit } from '../dist/commands/community-cockpit.js'
import { resolveExternalOpenInvocation } from '../dist/lib/external-url.js'

function installed(port = 5900) {
  return {
    status: 'installed',
    state: { instanceName: 'default', server: { port } },
    paths: { dataRoot: 'C:\\aops-test' },
  }
}

function runtime(runtimeState, health, reason = null) {
  return { runtimeState, health, reason }
}

test('a healthy running server opens Cockpit without a start', async () => {
  const opened = []
  let starts = 0
  const result = await resolveCommunityCockpit({}, {
    inspectInstall: () => installed(),
    inspectRuntime: async () => runtime('running', 'healthy'),
    startServer: async () => { starts += 1 },
    openUrl: async (url) => { opened.push(url) },
  })

  assert.equal(starts, 0)
  assert.deepEqual(opened, ['http://127.0.0.1:5900'])
  assert.deepEqual(result, {
    status: 'cockpit-ready',
    instance: 'default',
    origin: 'http://127.0.0.1:5900',
    serverAction: 'already-running',
    opened: true,
  })
})

test('a stopped server starts once and --no-open skips the browser', async () => {
  let inspections = 0
  let startOptions
  let opens = 0
  const result = await resolveCommunityCockpit({ open: false }, {
    inspectInstall: () => installed(5999),
    inspectRuntime: async () => {
      inspections += 1
      return inspections === 1 ? runtime('stopped', 'not-checked') : runtime('running', 'healthy')
    },
    startServer: async (options) => { startOptions = options },
    openUrl: async () => { opens += 1 },
  })

  assert.equal(startOptions.detach, true)
  assert.equal(startOptions.silent, true)
  assert.equal(opens, 0)
  assert.equal(result.serverAction, 'started')
  assert.equal(result.opened, false)
  assert.equal(result.origin, 'http://127.0.0.1:5999')
})

test('missing and unhealthy servers fail closed with recovery guidance', async () => {
  await assert.rejects(
    resolveCommunityCockpit({}, {
      inspectInstall: () => ({ status: 'not-installed' }),
      inspectRuntime: async () => runtime('stopped', 'not-checked'),
      startServer: async () => {},
      openUrl: async () => {},
    }),
    /aops setup init/,
  )

  await assert.rejects(
    resolveCommunityCockpit({}, {
      inspectInstall: () => installed(),
      inspectRuntime: async () => runtime('unhealthy', 'unhealthy', 'health failed'),
      startServer: async () => { throw new Error('must not start') },
      openUrl: async () => {},
    }),
    /aops server status/,
  )
})

test('browser invocation is shell-free and limited to loopback HTTP URLs', () => {
  assert.deepEqual(resolveExternalOpenInvocation('http://127.0.0.1:5900', 'win32'), {
    command: 'explorer.exe',
    args: ['http://127.0.0.1:5900/'],
  })
  assert.deepEqual(resolveExternalOpenInvocation('http://localhost:5900', 'darwin'), {
    command: 'open',
    args: ['http://localhost:5900/'],
  })
  assert.throws(() => resolveExternalOpenInvocation('https://example.com', 'linux'), /loopback/)
})
