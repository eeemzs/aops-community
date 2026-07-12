import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { resolveAopsRuntimeConfig } from '../src/index.js'

// Codex turn-7 MEDIUM #3: pin AOPS canonical PG-over-SQLITE precedence so
// legacy env states with both keys but no AOPS_REPO_URL cannot silently
// resolve to sqlite.
test('resolveAopsRuntimeConfig prefers AOPS_PG_URL over AOPS_SQLITE_URL when AOPS_REPO_URL is absent', () => {
  const env = {
    AOPS_SQLITE_URL: 'file:/tmp/aops-runtime.sqlite',
    AOPS_PG_URL: 'postgresql://canonical.example/aops',
  }
  const resolved = resolveAopsRuntimeConfig({}, env)
  assert.equal(resolved.repoUrl, 'postgresql://canonical.example/aops')
  assert.equal(resolved.repoDialect, 'pg')
  assert.equal(resolved.repoUrlSource, 'env')
})

test('resolveAopsRuntimeConfig honors AOPS_REPO_URL when present, regardless of legacy split keys', () => {
  const env = {
    AOPS_REPO_URL: 'postgresql://canonical.example/aops',
    AOPS_PG_URL: 'postgresql://other.example/aops',
    AOPS_SQLITE_URL: 'file:/tmp/aops-runtime.sqlite',
  }
  const resolved = resolveAopsRuntimeConfig({}, env)
  assert.equal(resolved.repoUrl, 'postgresql://canonical.example/aops')
  assert.equal(resolved.repoDialect, 'pg')
  assert.equal(resolved.repoUrlSource, 'env')
})

test('resolveAopsRuntimeConfig resolves AOPS_SQLITE_URL only when no PG variant is configured', () => {
  const env = {
    AOPS_SQLITE_URL: 'file:/tmp/aops-runtime.sqlite',
  }
  const resolved = resolveAopsRuntimeConfig({}, env)
  assert.equal(resolved.repoUrl, 'file:/tmp/aops-runtime.sqlite')
  assert.equal(resolved.repoDialect, 'sqlite')
  assert.equal(resolved.repoUrlSource, 'env')
})

test('resolveAopsRuntimeConfig reports missing source when no env vars are present', () => {
  const env: NodeJS.ProcessEnv = {}
  const resolved = resolveAopsRuntimeConfig({}, env)
  assert.equal(resolved.repoUrl, null)
  assert.equal(resolved.repoDialect, null)
  assert.equal(resolved.repoUrlSource, 'missing')
})
