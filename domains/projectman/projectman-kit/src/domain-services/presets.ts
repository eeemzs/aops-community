import type { ProjectmanKitEnvConfig } from '../config/config.js'
import type { ProjectmanKitStaticConfig } from './types.js'
import { buildProjectmanKitStaticConfig } from './unified.js'

export function createProjectmanKitStaticConfigFromEnv(envConfig: ProjectmanKitEnvConfig): ProjectmanKitStaticConfig {
  return buildProjectmanKitStaticConfig(envConfig)
}
