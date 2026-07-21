import assert from 'node:assert/strict'
import test from 'node:test'

import { refreshResolvedAopsServerRuntimeConfig } from '../src/lib/server/aops-runtime-config.ts'

test('runtime config accepts explicit TLS disable for a remote PostgreSQL target', () => {
  const config = refreshResolvedAopsServerRuntimeConfig({
    AOPS_PG_URL: 'postgresql://aops:secret@postgres.example:5432/aops?sslmode=disable',
  })
  assert.equal(config.repoDialect, 'pg')
  assert.equal(config.repoUrlSource, 'env')
})

test('runtime config still rejects a remote PostgreSQL target without an explicit TLS policy', () => {
  assert.throws(
    () => refreshResolvedAopsServerRuntimeConfig({
      AOPS_PG_URL: 'postgresql://aops:secret@postgres.example:5432/aops',
    }),
    /community_pg_url_invalid/,
  )
})
