import type { AgentspaceKitEnvConfig } from '@aopslab/domain-kit-agentspace'
import { getResolvedAopsServerRuntimeConfig } from '$lib/server/aops-runtime-config'

export type AgentspaceRepositoryType = 'drizzle'

export function resolveAgentspaceRepoUrl(_repositoryType: AgentspaceRepositoryType): string {
  const value = getResolvedAopsServerRuntimeConfig().repoUrl.trim()
  if (!value) {
    throw new Error('AOPS runtime storage is not configured.')
  }
  return value
}

export function buildAgentspaceServerEnvConfig(params: {
  tenantId: string
  logLevel: string
  repositoryType: AgentspaceRepositoryType
  repoUrl?: string
}): AgentspaceKitEnvConfig {
  const repoUrl = params.repoUrl?.trim() || resolveAgentspaceRepoUrl(params.repositoryType)

  return {
    tenantId: params.tenantId,
    logLevel: params.logLevel,
    repoUrl,
  }
}
