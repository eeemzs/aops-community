import { getGlobalSingleton } from '@aopslab/xf-dm-kits'

import { readRequestContext, type RequestContext } from './context.js'
import { buildAgentspaceServerEnvConfig } from './agentspace/env.js'
import { buildAgentspaceKit } from './agentspace/kit.js'

// ============================================================================
// Types
// ============================================================================

const GLOBAL_KEY = Symbol.for('aops-server.agentspace-kit')

type AgentspaceKitInstance = Awaited<ReturnType<typeof buildAgentspaceKit>>

// ============================================================================
// Public API
// ============================================================================

export async function getAgentspaceKit(overrides?: Partial<RequestContext>): Promise<AgentspaceKitInstance> {
  return getGlobalSingleton(GLOBAL_KEY, async () => {
    const ctx = readRequestContext(overrides)
    const envConfig = buildAgentspaceServerEnvConfig({
      tenantId: ctx.tenantId,
      logLevel: ctx.logLevel,
      repositoryType: ctx.repositoryType,
      repoUrl: ctx.repoUrl,
    })
    return buildAgentspaceKit(envConfig, ctx.logger)
  })
}
