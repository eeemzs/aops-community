import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, resolve } from 'node:path'

export type DocmanCliExecutionMode = 'host' | 'tooling'
export type DocmanRuntimeMode = 'single-user' | 'multi-user'
export type DocmanRepoDialect = 'sqlite' | 'pg'
export type DocmanConfigSource = 'option' | 'env' | 'stored-config' | 'default' | 'default-sqlite'

export type DocmanStoredConfig = {
  version: 1
  repoUrl?: string
  runtimeMode?: DocmanRuntimeMode
  scopeId?: string
  tenantId?: string
  logLevel?: string
  executionMode?: DocmanCliExecutionMode
  hostConfigPath?: string
}

export type LoadedDocmanStoredConfig = {
  path: string
  exists: boolean
  config: DocmanStoredConfig
}

export type ResolvedDocmanRuntimeConfig = {
  configPath: string
  configExists: boolean
  repoUrl: string
  repoUrlSource: DocmanConfigSource
  repoDialect: DocmanRepoDialect
  runtimeMode: DocmanRuntimeMode
  runtimeModeSource: DocmanConfigSource
  scopeId: string
  scopeIdSource: DocmanConfigSource
}

export type DocmanStoredConfigPatch = Partial<Omit<DocmanStoredConfig, 'version'>>

const DOCMAN_CONFIG_FILENAME = 'docman.config.json'
const DOCMAN_SQLITE_FILENAME = 'docman.aops.sqlite'
export const DEFAULT_DOCMAN_SCOPE_ID = '00000000-0000-4000-8000-000000000000'

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function normalizeScopeId(value: unknown): string | undefined {
  const normalized = normalizeNonEmptyString(value)
  if (!normalized) return undefined
  return normalized.toLowerCase() === 'default' ? DEFAULT_DOCMAN_SCOPE_ID : normalized
}

function normalizeRuntimeMode(value: unknown): DocmanRuntimeMode | undefined {
  const normalized = normalizeNonEmptyString(value)?.toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'single-user' || normalized === 'single_user' || normalized === 'single') {
    return 'single-user'
  }
  if (normalized === 'multi-user' || normalized === 'multi_user' || normalized === 'multi') {
    return 'multi-user'
  }
  return undefined
}

function normalizeExecutionMode(value: unknown): DocmanCliExecutionMode | undefined {
  const normalized = normalizeNonEmptyString(value)?.toLowerCase()
  if (normalized === 'host' || normalized === 'tooling') return normalized
  return undefined
}

function normalizeRepoUrl(value: unknown): string | undefined {
  const normalized = normalizeNonEmptyString(value)
  if (!normalized) return undefined
  return normalized.replace(/(?:\\r|\r)+$/g, '')
}

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input as Record<string, unknown>
}

function resolveHomeDirectory(processEnv: NodeJS.ProcessEnv): string {
  const envHome =
    normalizeNonEmptyString(processEnv.HOME)
    ?? normalizeNonEmptyString(processEnv.USERPROFILE)
  return resolve(envHome ?? os.homedir())
}

function sanitizeDocmanStoredConfig(input: Record<string, unknown>): DocmanStoredConfig {
  const sanitized: DocmanStoredConfig = {
    version: 1,
  }

  const repoUrl = normalizeRepoUrl(input.repoUrl)
  const runtimeMode = normalizeRuntimeMode(input.runtimeMode)
  const scopeId = normalizeScopeId(input.scopeId) ?? normalizeScopeId(input.workspaceId)
  const tenantId = normalizeNonEmptyString(input.tenantId)
  const logLevel = normalizeNonEmptyString(input.logLevel)
  const executionMode = normalizeExecutionMode(input.executionMode)
  const hostConfigPath = normalizeNonEmptyString(input.hostConfigPath)

  if (repoUrl) sanitized.repoUrl = repoUrl
  if (runtimeMode) sanitized.runtimeMode = runtimeMode
  if (scopeId) sanitized.scopeId = scopeId
  if (tenantId) sanitized.tenantId = tenantId
  if (logLevel) sanitized.logLevel = logLevel
  if (executionMode) sanitized.executionMode = executionMode
  if (hostConfigPath) sanitized.hostConfigPath = resolve(hostConfigPath)

  return sanitized
}

export function isDocmanSqliteRepoUrl(repoUrl: string): boolean {
  const normalized = repoUrl.trim().toLowerCase()
  if (!normalized) return false
  if (normalized === ':memory:') return true
  if (normalized.startsWith('sqlite:') || normalized.startsWith('file:')) return true
  return normalized.endsWith('.db') || normalized.endsWith('.sqlite') || normalized.endsWith('.sqlite3')
}

export function inferDocmanRepoDialect(repoUrl: string): DocmanRepoDialect {
  return isDocmanSqliteRepoUrl(repoUrl) ? 'sqlite' : 'pg'
}

export function getDocmanConfigDir(processEnv: NodeJS.ProcessEnv = process.env): string {
  return resolve(resolveHomeDirectory(processEnv), '.aops')
}

export function getDocmanConfigPath(processEnv: NodeJS.ProcessEnv = process.env): string {
  return resolve(getDocmanConfigDir(processEnv), DOCMAN_CONFIG_FILENAME)
}

export function getDefaultDocmanSqlitePath(processEnv: NodeJS.ProcessEnv = process.env): string {
  return resolve(getDocmanConfigDir(processEnv), DOCMAN_SQLITE_FILENAME)
}

export function getDefaultDocmanSqliteRepoUrl(processEnv: NodeJS.ProcessEnv = process.env): string {
  return `file:${getDefaultDocmanSqlitePath(processEnv).replaceAll('\\', '/')}`
}

export function readDocmanStoredConfig(
  processEnv: NodeJS.ProcessEnv = process.env,
): LoadedDocmanStoredConfig {
  const configPath = getDocmanConfigPath(processEnv)
  if (!existsSync(configPath)) {
    return {
      path: configPath,
      exists: false,
      config: sanitizeDocmanStoredConfig({}),
    }
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'))
    return {
      path: configPath,
      exists: true,
      config: sanitizeDocmanStoredConfig(toRecord(raw)),
    }
  } catch (error) {
    throw new Error(
      `docman_config_parse_failed:${configPath}:${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export function writeDocmanStoredConfig(
  patch: DocmanStoredConfigPatch,
  processEnv: NodeJS.ProcessEnv = process.env,
): LoadedDocmanStoredConfig {
  const loaded = readDocmanStoredConfig(processEnv)
  const nextConfig = sanitizeDocmanStoredConfig({
    ...loaded.config,
    ...patch,
  })

  mkdirSync(dirname(loaded.path), { recursive: true })
  writeFileSync(loaded.path, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8')

  return {
    path: loaded.path,
    exists: true,
    config: nextConfig,
  }
}

export function resolveDocmanRuntimeConfig(
  overrides: {
    runtimeMode?: unknown
    repoUrl?: unknown
    scopeId?: unknown
    workspaceId?: unknown
    /**
     * When true, restore the legacy fallback to a local sqlite file when no
     * explicit/env/stored repo URL is available. Disabled by default per
     * operator policy: a missing binding must surface as an error rather
     * than be masked by a hidden default sqlite. CLI-only local-dev tools
     * may pass `true` to keep the historical behavior.
     */
    allowDefaultSqliteFallback?: boolean
  } = {},
  processEnv: NodeJS.ProcessEnv = process.env,
): ResolvedDocmanRuntimeConfig {
  const loaded = readDocmanStoredConfig(processEnv)

  const explicitRuntimeMode = normalizeRuntimeMode(overrides.runtimeMode)
  const envRuntimeMode = normalizeRuntimeMode(processEnv.DOCMAN_RUNTIME_MODE)
  const runtimeMode = explicitRuntimeMode ?? envRuntimeMode ?? loaded.config.runtimeMode ?? 'single-user'
  const runtimeModeSource: DocmanConfigSource =
    explicitRuntimeMode
      ? 'option'
      : envRuntimeMode
        ? 'env'
        : loaded.config.runtimeMode
          ? 'stored-config'
          : 'default'

  const explicitScopeId = normalizeScopeId(overrides.scopeId) ?? normalizeScopeId(overrides.workspaceId)
  const envScopeId =
    normalizeScopeId(processEnv.DOCMAN_SCOPE_ID)
    ?? normalizeScopeId(processEnv.DOCMAN_WORKSPACE_ID)
  const scopeId = explicitScopeId ?? envScopeId ?? loaded.config.scopeId ?? DEFAULT_DOCMAN_SCOPE_ID
  const scopeIdSource: DocmanConfigSource =
    explicitScopeId
      ? 'option'
      : envScopeId
        ? 'env'
        : loaded.config.scopeId
          ? 'stored-config'
          : 'default'

  const explicitRepoUrl = normalizeRepoUrl(overrides.repoUrl)
  // Resolution order intentionally enforces the no-fallback policy: prefer
  // Docman PG over Docman sqlite, fall back to AOPS
  // canonical, then stored config. The previous default-sqlite tail is
  // preserved only for legacy callers that opt-in via
  // `allowDefaultSqliteFallback` (kept off by default per operator policy:
  // a missing repository binding must surface as an error rather than be
  // masked by a hidden local sqlite file). The AOPS host adapter
  // additionally enforces a source-agnostic sqlite-vs-canonical-PG guard
  // so DOCMAN_SQLITE_URL cannot mask AOPS PG in an integrated runtime.
  const docmanEnvRepoUrl =
    normalizeRepoUrl(processEnv.DOCMAN_REPO_URL)
    ?? normalizeRepoUrl(processEnv.DOCMAN_PG_URL)
    ?? normalizeRepoUrl(processEnv.DOCMAN_SQLITE_URL)
  const aopsEnvRepoUrl =
    normalizeRepoUrl(processEnv.AOPS_REPO_URL)
    ?? normalizeRepoUrl(processEnv.AOPS_PG_URL)
    ?? normalizeRepoUrl(processEnv.AOPS_SQLITE_URL)
  const envRepoUrl = docmanEnvRepoUrl ?? aopsEnvRepoUrl
  const explicitOrEnvOrStored = explicitRepoUrl ?? envRepoUrl ?? loaded.config.repoUrl
  const repoUrl =
    explicitOrEnvOrStored ?? (
      overrides.allowDefaultSqliteFallback === true
        ? getDefaultDocmanSqliteRepoUrl(processEnv)
        : (() => {
            throw new Error(
              'docman_runtime_config_storage_unbound:Docman has no repository URL. Set DOCMAN_REPO_URL, DOCMAN_PG_URL, AOPS_REPO_URL, AOPS_PG_URL, or ~/.aops/docman.config.json. The historical default-sqlite fallback is disabled per operator policy; opt back in by passing { allowDefaultSqliteFallback: true } only for explicit local-dev tooling.',
            )
          })()
    )
  const repoUrlSource: DocmanConfigSource =
    explicitRepoUrl
      ? 'option'
      : envRepoUrl
        ? 'env'
        : loaded.config.repoUrl
          ? 'stored-config'
          : 'default-sqlite'

  return {
    configPath: loaded.path,
    configExists: loaded.exists,
    repoUrl,
    repoUrlSource,
    repoDialect: inferDocmanRepoDialect(repoUrl),
    runtimeMode,
    runtimeModeSource,
    scopeId,
    scopeIdSource,
  }
}

export function applyDocmanRuntimeEnv(
  config: Pick<ResolvedDocmanRuntimeConfig, 'runtimeMode' | 'repoUrl' | 'repoDialect' | 'scopeId'>,
  processEnv: NodeJS.ProcessEnv = process.env,
): void {
  processEnv.DOCMAN_RUNTIME_MODE = config.runtimeMode
  processEnv.DOCMAN_SCOPE_ID = config.scopeId
  processEnv.DOCMAN_WORKSPACE_ID = config.scopeId
  processEnv.DOCMAN_REPO_URL = config.repoUrl

  if (config.repoDialect === 'sqlite') {
    processEnv.DOCMAN_SQLITE_URL = config.repoUrl
    delete processEnv.DOCMAN_PG_URL
    return
  }

  processEnv.DOCMAN_PG_URL = config.repoUrl
  delete processEnv.DOCMAN_SQLITE_URL
}
