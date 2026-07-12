import type { DocmanKitEnvConfig } from '../config/config.js'
import type { DocmanKitStaticConfig } from './types.js'
import { buildDocmanKitStaticConfig } from './unified.js'

export function createDocmanKitStaticConfigFromEnv(envConfig: DocmanKitEnvConfig): DocmanKitStaticConfig {
  return buildDocmanKitStaticConfig(envConfig)
}

