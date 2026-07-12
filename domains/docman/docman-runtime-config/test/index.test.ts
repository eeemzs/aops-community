import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import test from 'node:test'

import {
  getDefaultDocmanSqliteRepoUrl,
  resolveDocmanRuntimeConfig,
} from '../src/index.ts'

async function withTempHome<T>(fn: (home: string) => Promise<T> | T): Promise<T> {
  const home = await mkdtemp(path.join(os.tmpdir(), 'docman-runtime-config-'))
  try {
    return await fn(home)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

function makeEnv(home: string, overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    HOME: home,
    USERPROFILE: home,
    ...overrides,
  }
}

test('resolveDocmanRuntimeConfig fails closed when no repository binding exists', async () => {
  await withTempHome((home) => {
    assert.throws(
      () => resolveDocmanRuntimeConfig({}, makeEnv(home)),
      /docman_runtime_config_storage_unbound/,
    )
  })
})

test('resolveDocmanRuntimeConfig keeps default sqlite only behind explicit opt-in', async () => {
  await withTempHome((home) => {
    const env = makeEnv(home)
    const resolved = resolveDocmanRuntimeConfig(
      { allowDefaultSqliteFallback: true },
      env,
    )

    assert.equal(resolved.repoUrl, getDefaultDocmanSqliteRepoUrl(env))
    assert.equal(resolved.repoDialect, 'sqlite')
    assert.equal(resolved.repoUrlSource, 'default-sqlite')
  })
})

test('resolveDocmanRuntimeConfig falls back to AOPS PostgreSQL before stored/default sqlite', async () => {
  await withTempHome((home) => {
    const resolved = resolveDocmanRuntimeConfig(
      {},
      makeEnv(home, {
        AOPS_PG_URL: 'postgres://localhost/aops',
      }),
    )

    assert.equal(resolved.repoUrl, 'postgres://localhost/aops')
    assert.equal(resolved.repoDialect, 'pg')
    assert.equal(resolved.repoUrlSource, 'env')
  })
})

test('resolveDocmanRuntimeConfig prefers DOCMAN_PG_URL over DOCMAN_SQLITE_URL', async () => {
  await withTempHome((home) => {
    const resolved = resolveDocmanRuntimeConfig(
      {},
      makeEnv(home, {
        DOCMAN_SQLITE_URL: 'file:///tmp/docman.sqlite',
        DOCMAN_PG_URL: 'postgres://localhost/docman',
      }),
    )

    assert.equal(resolved.repoUrl, 'postgres://localhost/docman')
    assert.equal(resolved.repoDialect, 'pg')
    assert.equal(resolved.repoUrlSource, 'env')
  })
})
