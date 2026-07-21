import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  COMMUNITY_HOST_MODES,
  activateCommunityPackageWorkingDirectory,
  resolveCommunityHostConfig,
} from '../scripts/community-host.mjs'

const serverRoot = realpathSync(path.resolve(fileURLToPath(new URL('..', import.meta.url))))

test('npm host anchors relative runtime modules to the server package root', () => {
  const original = process.cwd()
  const unrelated = mkdtempSync(path.join(tmpdir(), 'aops-community-host-cwd-'))
  try {
    process.chdir(unrelated)
    assert.equal(activateCommunityPackageWorkingDirectory(), serverRoot)
    assert.equal(realpathSync(process.cwd()), serverRoot)
  } finally {
    process.chdir(original)
    rmSync(unrelated, { recursive: true, force: true })
  }
})

function productionEnv(postgresUrl, extra = {}) {
  return {
    NODE_ENV: 'production',
    AOPS_DB_BOOTSTRAP_MODE: 'explicit',
    AOPS_PG_URL: postgresUrl,
    ...extra,
  }
}

function containerOptions(publicPort = '5900') {
  return {
    mode: COMMUNITY_HOST_MODES.oci,
    edgeHost: '0.0.0.0',
    edgePort: '5900',
    publicPort,
    internalHost: '127.0.0.1',
    internalPort: '5901',
  }
}

test('container host accepts explicit TLS-disabled PostgreSQL chosen by the user', () => {
  const config = resolveCommunityHostConfig(
    containerOptions('6190'),
    productionEnv('postgresql://aops:secret@postgres:5432/aops?sslmode=disable'),
  )
  assert.equal(config.mode, COMMUNITY_HOST_MODES.oci)
  assert.equal(config.edgeHost, '0.0.0.0')
  assert.equal(config.edgePort, 5900)
  assert.equal(config.publicPort, 6190)
  assert.equal(config.internalHost, '127.0.0.1')
  assert.equal(config.internalPort, 5901)
})

test('container host accepts an explicit TLS-disabled remote PostgreSQL URL', () => {
  const config = resolveCommunityHostConfig(
    containerOptions(),
    productionEnv('postgresql://aops:secret@postgres.example:5432/aops?sslmode=disable'),
  )
  assert.equal(config.mode, COMMUNITY_HOST_MODES.oci)
})

test('container host still requires an explicit supported PostgreSQL TLS policy', () => {
  assert.throws(
    () => resolveCommunityHostConfig(
      containerOptions(),
      productionEnv('postgresql://aops:secret@postgres.example:5432/aops'),
    ),
    /community_server_postgresql_url_required/,
  )
  assert.throws(
    () => resolveCommunityHostConfig(
      containerOptions(),
      productionEnv('postgresql://aops:secret@postgres.example:5432/aops?sslmode=prefer'),
    ),
    /community_server_postgresql_url_required/,
  )
})
