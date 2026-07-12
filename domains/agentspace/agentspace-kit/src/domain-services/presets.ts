import type { AgentspaceKitEnvConfig } from '../config/config.js'
import type { AgentspaceKitStaticConfig } from './types.js'
import { buildAgentspaceKitStaticConfig } from './unified.js'

export function createAgentspaceKitStaticConfigFromEnv(envConfig: AgentspaceKitEnvConfig): AgentspaceKitStaticConfig {
  return buildAgentspaceKitStaticConfig(envConfig)
}
