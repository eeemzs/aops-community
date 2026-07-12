import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { resolveAopsConfigDir } from '@aops/host-registration'

export type AopsRepoDialect = 'sqlite' | 'pg'
export type AopsRuntimeValueSource = 'option' | 'env' | 'default' | 'missing'
export type AopsHostLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export type LoadedAopsServerEnvConfig = {
  path: string
  exists: boolean
  assignments: Record<string, string>
  repoUrl: string | null
  repoDialect: AopsRepoDialect | null
  redactedRepoUrl: string | null
  hostSettings: {
    logLevel: AopsHostLogLevel | null
  }
}

export type ResolvedAopsRuntimeConfig = {
  envPath: string
  envExists: boolean
  repoUrl: string | null
  repoUrlSource: AopsRuntimeValueSource
  repoDialect: AopsRepoDialect | null
  hostSettings: {
    logLevel: AopsHostLogLevel
  }
  logLevelSource: Exclude<AopsRuntimeValueSource, 'missing'>
}

const AOPS_SQLITE_FILENAME = 'aops.aops.sqlite'
const AOPS_SERVER_ENV_FILENAME = 'aops.server.env'
const AOPS_HOST_LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const
const AOPS_HOST_ENV_REPO_KEYS = ['AOPS_REPO_URL', 'AOPS_SQLITE_URL', 'AOPS_PG_URL'] as const

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function normalizeHostLogLevel(value: unknown): AopsHostLogLevel | undefined {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized) return undefined
  if ((AOPS_HOST_LOG_LEVELS as readonly string[]).includes(normalized)) {
    return normalized as AopsHostLogLevel
  }
  return undefined
}

function stripWrappingQuotes(value: string): string {
  if (value.length < 2) return value
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function parseDotEnvAssignments(content: string): Record<string, string> {
  const assignments: Record<string, string> = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    const [, key, rawValue] = match
    assignments[key] = stripWrappingQuotes(String(rawValue).trim())
  }
  return assignments
}

function quoteEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value
  return JSON.stringify(value)
}

function redactRepoUrl(repoUrl: string): string {
  try {
    const parsed = new URL(repoUrl)
    if (parsed.password) parsed.password = '***'
    return parsed.toString()
  } catch {
    return repoUrl
  }
}

export function isSqliteRepoUrl(repoUrl: string): boolean {
  const normalized = repoUrl.trim().toLowerCase()
  if (!normalized) return false
  if (normalized === ':memory:') return true
  if (normalized.startsWith('sqlite:') || normalized.startsWith('file:')) return true
  return normalized.endsWith('.db') || normalized.endsWith('.sqlite') || normalized.endsWith('.sqlite3')
}

export function inferAopsRepoDialect(repoUrl: string): AopsRepoDialect {
  return isSqliteRepoUrl(repoUrl) ? 'sqlite' : 'pg'
}

export function resolveSqliteFilenameFromRepoUrl(repoUrl: string): string {
  const trimmed = repoUrl.trim()
  if (trimmed === ':memory:') return ':memory:'

  const stripScheme = (value: string, scheme: string): string =>
    value.startsWith(scheme) ? value.slice(scheme.length).replace(/^\/\//, '') : value

  const noSqlite = stripScheme(trimmed, 'sqlite:')
  const noFile = stripScheme(noSqlite, 'file:')
  return noFile || trimmed
}

export function getAopsRuntimeConfigDir(processEnv: NodeJS.ProcessEnv = process.env): string {
  const hasExplicitConfigPath =
    normalizeNonEmpty(processEnv.AOPS_CLI_CONFIG_PATH) ?? normalizeNonEmpty(processEnv.AGENT_OPS_CONFIG_PATH)
  if (!hasExplicitConfigPath && processEnv.NODE_ENV === 'test') {
    return resolve(process.cwd(), '.tmp', 'aops-runtime-test-config')
  }
  return resolveAopsConfigDir(processEnv)
}

export function getAopsServerEnvPath(processEnv: NodeJS.ProcessEnv = process.env): string {
  return resolve(getAopsRuntimeConfigDir(processEnv), AOPS_SERVER_ENV_FILENAME)
}

export function readAopsServerEnvConfig(
  processEnv: NodeJS.ProcessEnv = process.env,
  explicitPath?: string,
): LoadedAopsServerEnvConfig {
  const envPath = explicitPath ? resolve(explicitPath) : getAopsServerEnvPath(processEnv)
  if (!existsSync(envPath)) {
    return {
      path: envPath,
      exists: false,
      assignments: {},
      repoUrl: null,
      repoDialect: null,
      redactedRepoUrl: null,
      hostSettings: {
        logLevel: null,
      },
    }
  }

  const assignments = parseDotEnvAssignments(readFileSync(envPath, 'utf8'))
  // Resolution order tightened (Codex turn-5 sweep #5 + operator
  // "no fallback" directive): when AOPS_REPO_URL is absent, prefer
  // AOPS_PG_URL over AOPS_SQLITE_URL so legacy env states with both
  // do not silently resolve to sqlite. Setup normally writes
  // AOPS_REPO_URL; this path only matters when the canonical key is
  // missing, in which case the operator's persistent PG URL must win.
  const repoUrl =
    normalizeNonEmpty(assignments.AOPS_REPO_URL) ??
    normalizeNonEmpty(assignments.AOPS_PG_URL) ??
    normalizeNonEmpty(assignments.AOPS_SQLITE_URL) ??
    null
  const logLevel =
    normalizeHostLogLevel(assignments.AOPS_LOG_LEVEL) ??
    normalizeHostLogLevel(assignments.LOG_LEVEL) ??
    null

  return {
    path: envPath,
    exists: true,
    assignments,
    repoUrl,
    repoDialect: repoUrl ? inferAopsRepoDialect(repoUrl) : null,
    redactedRepoUrl: repoUrl ? redactRepoUrl(repoUrl) : null,
    hostSettings: {
      logLevel,
    },
  }
}

export function writeAopsServerEnvConfig(
  patch: {
    repoUrl?: string
    logLevel?: AopsHostLogLevel
  },
  processEnv: NodeJS.ProcessEnv = process.env,
  explicitPath?: string,
): LoadedAopsServerEnvConfig {
  const current = readAopsServerEnvConfig(processEnv, explicitPath)
  const envPath = current.path
  const nextAssignments = { ...current.assignments }

  if (patch.repoUrl !== undefined) {
    const repoUrl = normalizeNonEmpty(patch.repoUrl)
    if (!repoUrl) {
      delete nextAssignments.AOPS_REPO_URL
      delete nextAssignments.AOPS_SQLITE_URL
      delete nextAssignments.AOPS_PG_URL
    } else {
      nextAssignments.AOPS_REPO_URL = repoUrl
      if (inferAopsRepoDialect(repoUrl) === 'sqlite') {
        nextAssignments.AOPS_SQLITE_URL = repoUrl
        delete nextAssignments.AOPS_PG_URL
      } else {
        nextAssignments.AOPS_PG_URL = repoUrl
        delete nextAssignments.AOPS_SQLITE_URL
      }
    }
  }

  if (patch.logLevel !== undefined) {
    const logLevel = normalizeHostLogLevel(patch.logLevel)
    if (!logLevel) {
      delete nextAssignments.AOPS_LOG_LEVEL
    } else {
      nextAssignments.AOPS_LOG_LEVEL = logLevel
    }
  }

  const lines = current.exists ? readFileSync(envPath, 'utf8').split(/\r?\n/) : []
  const touchedKeys = new Set<string>()
  const updatedLines = lines.map((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) return line
    const key = match[1]
    if (![...AOPS_HOST_ENV_REPO_KEYS, 'AOPS_LOG_LEVEL'].includes(key as (typeof AOPS_HOST_ENV_REPO_KEYS)[number] | 'AOPS_LOG_LEVEL')) {
      return line
    }
    touchedKeys.add(key)
    const value = nextAssignments[key]
    if (!value) return ''
    return `${key}=${quoteEnvValue(value)}`
  })

  for (const key of [...AOPS_HOST_ENV_REPO_KEYS, 'AOPS_LOG_LEVEL'] as const) {
    const value = nextAssignments[key]
    if (!value || touchedKeys.has(key)) continue
    updatedLines.push(`${key}=${quoteEnvValue(value)}`)
  }

  const compacted = updatedLines
    .filter((line, index, arr) => {
      if (line !== '') return true
      const prev = arr[index - 1]
      return prev !== ''
    })
    .join('\n')
    .trimEnd()

  mkdirSync(dirname(envPath), { recursive: true })
  writeFileSync(envPath, `${compacted}\n`, 'utf8')
  try {
    chmodSync(envPath, 0o600)
  } catch {
    // Best effort only; some platforms do not support POSIX file modes.
  }

  return readAopsServerEnvConfig(processEnv, envPath)
}

export function getDefaultAopsSqlitePath(processEnv: NodeJS.ProcessEnv = process.env): string {
  return resolve(getAopsRuntimeConfigDir(processEnv), AOPS_SQLITE_FILENAME)
}

export function getDefaultAopsSqliteRepoUrl(processEnv: NodeJS.ProcessEnv = process.env): string {
  return pathToFileURL(getDefaultAopsSqlitePath(processEnv)).href
}

function resolveRepoUrlFromEnv(
  explicitValue: unknown,
  processEnv: NodeJS.ProcessEnv,
): { value: string | null; source: AopsRuntimeValueSource } {
  const explicit = normalizeNonEmpty(explicitValue)
  if (explicit) return { value: explicit, source: 'option' }

  // Resolution order tightened (Codex turn-5 sweep #5 + operator
  // "no fallback" directive): prefer AOPS_PG_URL over AOPS_SQLITE_URL
  // when AOPS_REPO_URL is absent so legacy env states with both keys
  // do not silently resolve to sqlite.
  const envValue =
    normalizeNonEmpty(processEnv.AOPS_REPO_URL) ??
    normalizeNonEmpty(processEnv.AOPS_PG_URL) ??
    normalizeNonEmpty(processEnv.AOPS_SQLITE_URL)
  if (envValue) return { value: envValue, source: 'env' }

  return { value: null, source: 'missing' }
}

function resolveLogLevelFromEnv(
  explicitValue: unknown,
  processEnv: NodeJS.ProcessEnv,
): { value: AopsHostLogLevel; source: Exclude<AopsRuntimeValueSource, 'missing'> } {
  const explicit = normalizeHostLogLevel(explicitValue)
  if (explicit) return { value: explicit, source: 'option' }

  const envValue =
    normalizeHostLogLevel(processEnv.AOPS_LOG_LEVEL) ??
    normalizeHostLogLevel(processEnv.LOG_LEVEL)
  if (envValue) return { value: envValue, source: 'env' }

  return {
    value: processEnv.NODE_ENV === 'development' ? 'debug' : 'info',
    source: 'default',
  }
}

export function resolveAopsRuntimeConfig(
  overrides: {
    repoUrl?: unknown
    logLevel?: unknown
  } = {},
  processEnv: NodeJS.ProcessEnv = process.env,
): ResolvedAopsRuntimeConfig {
  const envSnapshot = readAopsServerEnvConfig(processEnv)
  const repoUrl = resolveRepoUrlFromEnv(overrides.repoUrl, processEnv)
  const logLevel = resolveLogLevelFromEnv(overrides.logLevel, processEnv)

  return {
    envPath: envSnapshot.path,
    envExists: envSnapshot.exists,
    repoUrl: repoUrl.value,
    repoUrlSource: repoUrl.source,
    repoDialect: repoUrl.value ? inferAopsRepoDialect(repoUrl.value) : null,
    hostSettings: {
      logLevel: logLevel.value,
    },
    logLevelSource: logLevel.source,
  }
}
