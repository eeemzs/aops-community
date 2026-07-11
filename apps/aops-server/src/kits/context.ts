import type { XfLogger } from '@aopslab/xf-logger'
import { resolveAgentspaceRepoUrl, type AgentspaceRepositoryType } from './agentspace/env.js'
import { getAppConfig } from './config/index.js'

// ============================================================================
// Types
// ============================================================================

export type ServerLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface RequestContext {
  tenantId: string
  repositoryType: AgentspaceRepositoryType
  repoUrl: string
  locale: string
  fallbackLocale: string
  logLevel: ServerLogLevel
  logger?: XfLogger
}

// ============================================================================
// Constants
// ============================================================================

const ALLOWED_LOG_LEVELS: readonly ServerLogLevel[] = ['debug', 'info', 'warn', 'error', 'fatal']

// ============================================================================
// Public: readRequestContext
// ============================================================================

export function readRequestContext(overrides?: Partial<RequestContext>): RequestContext {
  const appConfig = getAppConfig()
  const repoType = (overrides?.repositoryType ?? appConfig.repositoryType) as AgentspaceRepositoryType
  const repoUrl = normalizeRepoUrl(overrides?.repoUrl) ?? resolveAgentspaceRepoUrl(repoType)
  const tenantId = overrides?.tenantId ?? appConfig.tenantId
  const locale = overrides?.locale ?? appConfig.defaultLocale
  const fallbackLocale = overrides?.fallbackLocale ?? appConfig.fallbackLocale
  const logLevel = normalizeLogLevel(overrides?.logLevel ?? appConfig.logLevel)

  return {
    tenantId,
    repositoryType: repoType,
    repoUrl,
    locale,
    fallbackLocale,
    logLevel,
    logger: overrides?.logger,
  }
}

// ============================================================================
// Internal: Normalizers
// ============================================================================

function normalizeRepoUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeLogLevel(value: unknown): ServerLogLevel {
  const normalized = String(value ?? '').toLowerCase() as ServerLogLevel
  return ALLOWED_LOG_LEVELS.includes(normalized) ? normalized : 'info'
}
