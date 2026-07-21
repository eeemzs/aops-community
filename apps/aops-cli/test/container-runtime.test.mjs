import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildCommunityInstanceContract,
  parseCommunityInstanceContract,
} from '../dist/lib/community-instance-contract.js'
import { loadExternalPostgresUrl } from '../dist/lib/community-native-lifecycle.js'

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
