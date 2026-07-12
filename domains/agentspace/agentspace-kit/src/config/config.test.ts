import { afterEach, describe, expect, it } from 'vitest'

import { clearAgentspaceKitEnvConfigCache, getAgentspaceKitEnvConfig } from './config.js'

const RELEVANT_ENV_KEYS = [
  'TENANT_ID',
  'LOG_LEVEL',
  'AOPS_REPO_URL',
  'AOPS_SQLITE_URL',
  'AOPS_PG_URL',
  'AGENTSPACE_REPO_URL',
  'AGENTSPACE_SQLITE_URL',
  'AGENTSPACE_PG_URL',
] as const

const ORIGINAL_ENV = new Map(RELEVANT_ENV_KEYS.map((key) => [key, process.env[key]]))

function restoreRelevantEnv(): void {
  for (const key of RELEVANT_ENV_KEYS) {
    const original = ORIGINAL_ENV.get(key)
    if (original === undefined) {
      delete process.env[key]
      continue
    }
    process.env[key] = original
  }
}

afterEach(() => {
  restoreRelevantEnv()
  clearAgentspaceKitEnvConfigCache()
})

describe('agentspace-kit env config', () => {
  it('falls back to AOPS_REPO_URL when agentspace-specific repo envs are absent', () => {
    delete process.env.AGENTSPACE_REPO_URL
    delete process.env.AGENTSPACE_SQLITE_URL
    delete process.env.AGENTSPACE_PG_URL
    delete process.env.AOPS_SQLITE_URL
    delete process.env.AOPS_PG_URL
    process.env.AOPS_REPO_URL = 'file:/tmp/agentspace-from-aops-repo.sqlite'

    clearAgentspaceKitEnvConfigCache()

    expect(getAgentspaceKitEnvConfig().repoUrl).toBe('file:/tmp/agentspace-from-aops-repo.sqlite')
  })

  it('falls back to AOPS_SQLITE_URL when shared repo url is provided there', () => {
    delete process.env.AGENTSPACE_REPO_URL
    delete process.env.AGENTSPACE_SQLITE_URL
    delete process.env.AGENTSPACE_PG_URL
    delete process.env.AOPS_REPO_URL
    delete process.env.AOPS_PG_URL
    process.env.AOPS_SQLITE_URL = 'file:/tmp/agentspace-from-aops-sqlite.sqlite'

    clearAgentspaceKitEnvConfigCache()

    expect(getAgentspaceKitEnvConfig().repoUrl).toBe('file:/tmp/agentspace-from-aops-sqlite.sqlite')
  })

  it('prefers AGENTSPACE_PG_URL over AGENTSPACE_SQLITE_URL when AGENTSPACE_REPO_URL is absent', () => {
    delete process.env.AGENTSPACE_REPO_URL
    delete process.env.AOPS_REPO_URL
    delete process.env.AOPS_SQLITE_URL
    delete process.env.AOPS_PG_URL
    process.env.AGENTSPACE_SQLITE_URL = 'file:/tmp/agentspace.sqlite'
    process.env.AGENTSPACE_PG_URL = 'postgresql://canonical.example/agentspace'

    clearAgentspaceKitEnvConfigCache()

    expect(getAgentspaceKitEnvConfig().repoUrl).toBe('postgresql://canonical.example/agentspace')
  })

  it('prefers AOPS_PG_URL over AOPS_SQLITE_URL when no agentspace-specific env is set', () => {
    delete process.env.AGENTSPACE_REPO_URL
    delete process.env.AGENTSPACE_SQLITE_URL
    delete process.env.AGENTSPACE_PG_URL
    delete process.env.AOPS_REPO_URL
    process.env.AOPS_SQLITE_URL = 'file:/tmp/agentspace-aops.sqlite'
    process.env.AOPS_PG_URL = 'postgresql://canonical.example/aops'

    clearAgentspaceKitEnvConfigCache()

    expect(getAgentspaceKitEnvConfig().repoUrl).toBe('postgresql://canonical.example/aops')
  })

  it('refreshes cached config when relevant process env changes mid-process', () => {
    delete process.env.AGENTSPACE_REPO_URL
    delete process.env.AGENTSPACE_SQLITE_URL
    delete process.env.AGENTSPACE_PG_URL
    delete process.env.AOPS_SQLITE_URL
    delete process.env.AOPS_PG_URL
    process.env.AOPS_REPO_URL = 'file:/tmp/agentspace-cache-one.sqlite'

    clearAgentspaceKitEnvConfigCache()
    expect(getAgentspaceKitEnvConfig().repoUrl).toBe('file:/tmp/agentspace-cache-one.sqlite')

    process.env.AOPS_REPO_URL = 'file:/tmp/agentspace-cache-two.sqlite'

    expect(getAgentspaceKitEnvConfig().repoUrl).toBe('file:/tmp/agentspace-cache-two.sqlite')
  })
})
