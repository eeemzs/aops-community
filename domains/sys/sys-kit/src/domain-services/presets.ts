import type { SysKitEnvConfig } from '../config/config.js'
import type { SysKitStaticConfig } from './types.js'
import { buildSysKitStaticConfig } from './unified.js'

export function createSysKitStaticConfigFromEnv(envConfig: SysKitEnvConfig): SysKitStaticConfig {
  return buildSysKitStaticConfig(envConfig)
}
