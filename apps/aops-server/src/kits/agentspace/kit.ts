import { cacheKeyFromLocale } from '@aopslab/xf-dm-kits'
import { createAgentspaceKitWithEnv, type AgentspaceKitEnvConfig } from '@aopslab/domain-kit-agentspace'
import type { XfLogger } from '@aopslab/xf-logger'
import { getLogger } from '$lib/server/logger'

async function resolveDefaultLogger(): Promise<XfLogger | undefined> {
  try {
    const l = await getLogger({ level: 'info', file: false, console: true })
    return l
  } catch {
    return undefined
  }
}

export async function buildAgentspaceKit(envConfig: AgentspaceKitEnvConfig, logger?: XfLogger) {
  const log = logger ?? (await resolveDefaultLogger())

  const { kit } = createAgentspaceKitWithEnv({
    name: 'aops-server',
    envConfig,
    baseContext: { tenantId: envConfig.tenantId, logger: log },
    resolveLogger: (ctx) => ctx.logger ?? log,
    getCacheKey: (ctx) => `${ctx.tenantId}|${cacheKeyFromLocale(ctx.locale, ctx.fallbackLocale)}`,
  })

  return kit
}
