import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, resolve } from 'node:path'

export type ProjectmanCliExecutionMode = 'host' | 'tooling'
export type ProjectmanRuntimeMode = 'single-user' | 'multi-user'
export type ProjectmanRepoDialect = 'sqlite' | 'pg'
export type ProjectmanConfigSource = 'option' | 'env' | 'stored-config' | 'default' | 'default-sqlite'

export type ProjectmanStoredConfig = {
  version: 1
  repoUrl?: string
  runtimeMode?: ProjectmanRuntimeMode
  projectId?: string
  tenantId?: string
  logLevel?: string
  executionMode?: ProjectmanCliExecutionMode
  hostConfigPath?: string
}

export type LoadedProjectmanStoredConfig = {
  path: string
  exists: boolean
  config: ProjectmanStoredConfig
}

export type ResolvedProjectmanRuntimeConfig = {
  configPath: string
  configExists: boolean
  repoUrl: string
  repoUrlSource: ProjectmanConfigSource
  repoDialect: ProjectmanRepoDialect
  runtimeMode: ProjectmanRuntimeMode
  runtimeModeSource: ProjectmanConfigSource
  projectId: string
  projectIdSource: ProjectmanConfigSource
}

type ProjectmanStoredConfigPatch = Partial<Omit<ProjectmanStoredConfig, 'version'>>

const PROJECTMAN_CONFIG_FILENAME = 'projectman.config.json'
const PROJECTMAN_SQLITE_FILENAME = 'projectman.aops.sqlite'
const DEFAULT_PROJECTMAN_PROJECT_ID = '123e4567-e89b-41d4-a000-000000000000'

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function normalizeRuntimeMode(value: unknown): ProjectmanRuntimeMode | undefined {
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

function normalizeExecutionMode(value: unknown): ProjectmanCliExecutionMode | undefined {
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

function sanitizeProjectmanStoredConfig(input: Record<string, unknown>): ProjectmanStoredConfig {
  const sanitized: ProjectmanStoredConfig = {
    version: 1,
  }

  const repoUrl = normalizeRepoUrl(input.repoUrl)
  const runtimeMode = normalizeRuntimeMode(input.runtimeMode)
  const projectId = normalizeNonEmptyString(input.projectId)
  const tenantId = normalizeNonEmptyString(input.tenantId)
  const logLevel = normalizeNonEmptyString(input.logLevel)
  const executionMode = normalizeExecutionMode(input.executionMode)
  const hostConfigPath = normalizeNonEmptyString(input.hostConfigPath)

  if (repoUrl) sanitized.repoUrl = repoUrl
  if (runtimeMode) sanitized.runtimeMode = runtimeMode
  if (projectId) sanitized.projectId = projectId
  if (tenantId) sanitized.tenantId = tenantId
  if (logLevel) sanitized.logLevel = logLevel
  if (executionMode) sanitized.executionMode = executionMode
  if (hostConfigPath) sanitized.hostConfigPath = resolve(hostConfigPath)

  return sanitized
}

export function isProjectmanSqliteRepoUrl(repoUrl: string): boolean {
  const normalized = repoUrl.trim().toLowerCase()
  if (!normalized) return false
  if (normalized === ':memory:') return true
  if (normalized.startsWith('sqlite:') || normalized.startsWith('file:')) return true
  return normalized.endsWith('.db') || normalized.endsWith('.sqlite') || normalized.endsWith('.sqlite3')
}

export function inferProjectmanRepoDialect(repoUrl: string): ProjectmanRepoDialect {
  return isProjectmanSqliteRepoUrl(repoUrl) ? 'sqlite' : 'pg'
}

export function getProjectmanConfigDir(processEnv: NodeJS.ProcessEnv = process.env): string {
  return resolve(resolveHomeDirectory(processEnv), '.aops')
}

export function getProjectmanConfigPath(processEnv: NodeJS.ProcessEnv = process.env): string {
  return resolve(getProjectmanConfigDir(processEnv), PROJECTMAN_CONFIG_FILENAME)
}

export function getDefaultProjectmanSqlitePath(processEnv: NodeJS.ProcessEnv = process.env): string {
  return resolve(getProjectmanConfigDir(processEnv), PROJECTMAN_SQLITE_FILENAME)
}

export function getDefaultProjectmanSqliteRepoUrl(processEnv: NodeJS.ProcessEnv = process.env): string {
  return `file:${getDefaultProjectmanSqlitePath(processEnv).replaceAll('\\', '/')}`
}

export function readProjectmanStoredConfig(
  processEnv: NodeJS.ProcessEnv = process.env,
): LoadedProjectmanStoredConfig {
  const configPath = getProjectmanConfigPath(processEnv)
  if (!existsSync(configPath)) {
    return {
      path: configPath,
      exists: false,
      config: sanitizeProjectmanStoredConfig({}),
    }
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'))
    return {
      path: configPath,
      exists: true,
      config: sanitizeProjectmanStoredConfig(toRecord(raw)),
    }
  } catch (error) {
    throw new Error(
      `projectman_config_parse_failed:${configPath}:${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export function writeProjectmanStoredConfig(
  patch: ProjectmanStoredConfigPatch,
  processEnv: NodeJS.ProcessEnv = process.env,
): LoadedProjectmanStoredConfig {
  const loaded = readProjectmanStoredConfig(processEnv)
  const nextConfig = sanitizeProjectmanStoredConfig({
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

export function resolveProjectmanRuntimeConfig(
  overrides: {
    runtimeMode?: unknown
    repoUrl?: unknown
    projectId?: unknown
  } = {},
  processEnv: NodeJS.ProcessEnv = process.env,
): ResolvedProjectmanRuntimeConfig {
  const loaded = readProjectmanStoredConfig(processEnv)

  const explicitRuntimeMode = normalizeRuntimeMode(overrides.runtimeMode)
  const envRuntimeMode = normalizeRuntimeMode(processEnv.PROJECTMAN_RUNTIME_MODE)
  const runtimeMode = explicitRuntimeMode ?? envRuntimeMode ?? loaded.config.runtimeMode ?? 'single-user'
  const runtimeModeSource: ProjectmanConfigSource =
    explicitRuntimeMode
      ? 'option'
      : envRuntimeMode
        ? 'env'
        : loaded.config.runtimeMode
          ? 'stored-config'
          : 'default'

  const explicitProjectId = normalizeNonEmptyString(overrides.projectId)
  const envProjectId =
    normalizeNonEmptyString(processEnv.PROJECTMAN_PROJECT_ID)
    ?? normalizeNonEmptyString(processEnv.PROJECTMAN_SCOPE_ID)
  const projectId = explicitProjectId ?? envProjectId ?? loaded.config.projectId ?? DEFAULT_PROJECTMAN_PROJECT_ID
  const projectIdSource: ProjectmanConfigSource =
    explicitProjectId
      ? 'option'
      : envProjectId
        ? 'env'
        : loaded.config.projectId
          ? 'stored-config'
          : 'default'

  const explicitRepoUrl = normalizeRepoUrl(overrides.repoUrl)
  const envRepoUrl =
    normalizeRepoUrl(processEnv.PROJECTMAN_REPO_URL)
    ?? normalizeRepoUrl(processEnv.PROJECTMAN_SQLITE_URL)
    ?? normalizeRepoUrl(processEnv.PROJECTMAN_PG_URL)
  const repoUrl = explicitRepoUrl ?? envRepoUrl ?? loaded.config.repoUrl ?? getDefaultProjectmanSqliteRepoUrl(processEnv)
  const repoUrlSource: ProjectmanConfigSource =
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
    repoDialect: inferProjectmanRepoDialect(repoUrl),
    runtimeMode,
    runtimeModeSource,
    projectId,
    projectIdSource,
  }
}

export function applyProjectmanRuntimeEnv(
  config: Pick<ResolvedProjectmanRuntimeConfig, 'runtimeMode' | 'repoUrl' | 'repoDialect' | 'projectId'>,
  processEnv: NodeJS.ProcessEnv = process.env,
): void {
  processEnv.PROJECTMAN_RUNTIME_MODE = config.runtimeMode
  processEnv.PROJECTMAN_PROJECT_ID = config.projectId
  processEnv.PROJECTMAN_SCOPE_ID = config.projectId
  processEnv.PROJECTMAN_REPO_URL = config.repoUrl

  if (config.repoDialect === 'sqlite') {
    processEnv.PROJECTMAN_SQLITE_URL = config.repoUrl
    delete processEnv.PROJECTMAN_PG_URL
    return
  }

  processEnv.PROJECTMAN_PG_URL = config.repoUrl
  delete processEnv.PROJECTMAN_SQLITE_URL
}
