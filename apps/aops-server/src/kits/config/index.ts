import { createAppMetaConfigManager, type AppMetaConfig, type AppMetaConfigManager } from '@aopslab/xf-dm-kits/appConfig'

// ============================================================================
// Types
// ============================================================================

export type ServerConfig = AppMetaConfig

export type RepositoryType = NonNullable<ServerConfig['repositoryType']>

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_REPOSITORY_TYPE: RepositoryType = 'drizzle'

// ============================================================================
// ConfigManager
// ============================================================================

export class ConfigManager {
  private static instance: AppMetaConfigManager

  static getInstance(): AppMetaConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = createAppMetaConfigManager({
        appName: 'aops-server',
        layout: 'sveltekit',
        defaultRepositoryType: DEFAULT_REPOSITORY_TYPE,
        defaultTenantId: '123e4567-e89b-41d4-a000-000000000001',
        defaultLocale: 'tr',
        defaultFallbackLocale: 'en',
      })
    }
    return ConfigManager.instance
  }
}

// ============================================================================
// Helper: getAppConfig
// ============================================================================

export function getAppConfig(): {
  repositoryType: RepositoryType
  tenantId: string
  defaultLocale: string
  fallbackLocale: string
  logLevel: string
} {
  const resolved = ConfigManager.getInstance().getResolvedConfig()
  const runtimeLogLevel =
    typeof process.env.AOPS_LOG_LEVEL === 'string' && process.env.AOPS_LOG_LEVEL.trim().length > 0
      ? process.env.AOPS_LOG_LEVEL.trim()
      : ''

  return {
    ...resolved,
    logLevel: runtimeLogLevel || resolved.logLevel,
  }
}
