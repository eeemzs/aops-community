import { strict as assert } from 'node:assert'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  getAopsServerEnvPath,
  readAopsServerEnvConfig,
  readAopsServerEnvFileContent,
  redactAopsRepoUrl,
  resolveAopsRuntimeConfig,
  resolveAopsServerEnvPath,
  writeAopsServerEnvConfig,
  writeAopsServerEnvFileContent,
} from '../src/index.js'

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

test('repository URL summaries redact credentials and fail closed for malformed input', () => {
  assert.equal(
    redactAopsRepoUrl('postgresql://operator:super-secret@db.example.test:5432/aops'),
    'postgresql://operator:***@db.example.test:5432/aops',
  )
  assert.equal(redactAopsRepoUrl('not-a-url:super-secret'), '<invalid_repo_url>')
})

test('server env path precedence is explicit override, config directory, then home default', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-runtime-path-'))
  try {
    const configFile = path.join(root, 'client', 'aops.config.json')
    const explicit = path.join(root, 'explicit', 'server.env')
    assert.deepEqual(
      resolveAopsServerEnvPath({ explicitPath: explicit }, { AOPS_CLI_CONFIG_PATH: configFile }),
      { path: explicit, source: 'explicit' },
    )
    assert.deepEqual(
      resolveAopsServerEnvPath({}, { AOPS_CLI_CONFIG_PATH: configFile }),
      { path: path.join(root, 'client', 'aops.server.env'), source: 'config-dir' },
    )
    assert.equal(
      getAopsServerEnvPath({ AOPS_CLI_CONFIG_PATH: path.join(root, 'profile') }),
      path.join(root, 'profile', 'aops.server.env'),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('server env updates are atomic, owner-only where supported, and preserve unknown assignments', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-runtime-write-'))
  const env = { AOPS_CLI_CONFIG_PATH: root }
  const envPath = getAopsServerEnvPath(env)
  try {
    writeFileSync(envPath, '# operator note\nCUSTOM_VALID_KEY=keep-me\nAOPS_LOG_LEVEL=warn\n', 'utf8')
    const written = writeAopsServerEnvConfig({
      repoUrl: 'postgresql://user:secret@db.example.test:5432/aops',
      logLevel: 'info',
    }, env)
    const content = readFileSync(envPath, 'utf8')
    assert.match(content, /^# operator note$/m)
    assert.match(content, /^CUSTOM_VALID_KEY=keep-me$/m)
    assert.match(content, /^AOPS_LOG_LEVEL=info$/m)
    assert.match(content, /^AOPS_PG_URL=postgresql:\/\/user:secret@db\.example\.test:5432\/aops$/m)
    assert.equal(written.redactedRepoUrl, 'postgresql://user:***@db.example.test:5432/aops')
    assert.equal(readdirSync(root).some((name) => name.endsWith('.tmp')), false)
    if (process.platform !== 'win32') assert.equal(statSync(envPath).mode & 0o077, 0)
    assert.equal(readAopsServerEnvConfig(env).assignments.CUSTOM_VALID_KEY, 'keep-me')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('server env reads and writes reject oversized content', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-runtime-size-'))
  const envPath = path.join(root, 'aops.server.env')
  try {
    writeFileSync(envPath, 'x'.repeat(64 * 1024 + 1), 'utf8')
    assert.throws(() => readAopsServerEnvFileContent({}, envPath), /aops_server_env_file_too_large/)
    rmSync(envPath)
    assert.throws(
      () => writeAopsServerEnvFileContent('x'.repeat(64 * 1024 + 1), {}, envPath),
      /aops_server_env_content_too_large/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('server env refuses a symlinked config file', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'aops-runtime-symlink-'))
  const target = path.join(root, 'target.env')
  const envPath = path.join(root, 'aops.server.env')
  try {
    writeFileSync(target, 'AOPS_PG_URL=postgresql://user:secret@example.test/aops\n', 'utf8')
    try {
      symlinkSync(target, envPath, 'file')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') {
        t.skip('symlink creation is not permitted on this Windows host')
        return
      }
      throw error
    }
    assert.throws(() => readAopsServerEnvFileContent({}, envPath), /aops_server_env_file_unsafe/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
