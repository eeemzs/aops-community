import fs from 'node:fs'
import path from 'node:path'

import { normalizeNonEmpty } from '@aopslab/domain-kit-agentspace/shared'

const ENV_ASSIGNMENT_PATTERN = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/
const AGENTSPACE_HOST_REPO_ENV_KEYS = [
  'AGENTSPACE_REPO_URL',
  'AGENTSPACE_SQLITE_URL',
  'AGENTSPACE_PG_URL',
  'AOPS_REPO_URL',
  'AOPS_SQLITE_URL',
  'AOPS_PG_URL',
] as const

let cachedDotEnvValues: Map<string, string> | null = null

function parseDotEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim()
  if (!trimmed) return ''
  const singleQuoted = /^'(.*)'$/.exec(trimmed)
  if (singleQuoted) return singleQuoted[1].trim()
  const doubleQuoted = /^"(.*)"$/.exec(trimmed)
  if (doubleQuoted) return doubleQuoted[1].trim()
  return trimmed
}

function parseDotEnvFile(content: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const lineRaw of content.split(/\r?\n/g)) {
    const line = lineRaw.trim()
    if (!line || line.startsWith('#')) continue
    const matched = ENV_ASSIGNMENT_PATTERN.exec(line)
    if (!matched) continue
    const key = matched[1].trim()
    if (!key) continue
    const value = parseDotEnvValue(matched[2] ?? '')
    if (!value) continue
    values.set(key, value)
  }
  return values
}

function resolveDotEnvCandidates(): string[] {
  const candidates = [
    normalizeNonEmpty(process.env.DOTENV_CONFIG_PATH),
    normalizeNonEmpty(process.env.AOPS_ENV_PATH),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '../..', '.env'),
  ].filter((entry): entry is string => Boolean(entry))
  return Array.from(new Set(candidates))
}

function getDotEnvValues(): Map<string, string> {
  if (cachedDotEnvValues) return cachedDotEnvValues
  for (const candidate of resolveDotEnvCandidates()) {
    if (!fs.existsSync(candidate)) continue
    try {
      const content = fs.readFileSync(candidate, 'utf8')
      cachedDotEnvValues = parseDotEnvFile(content)
      return cachedDotEnvValues
    } catch {
      // ignore candidate and continue
    }
  }
  cachedDotEnvValues = new Map<string, string>()
  return cachedDotEnvValues
}

export function resolveMissingRuntimeEnvKeys(requiredKeys: string[]): string[] {
  const normalizedRequiredKeys = requiredKeys
    .map((key) => normalizeNonEmpty(key))
    .filter((key): key is string => Boolean(key))
  if (normalizedRequiredKeys.length === 0) return []

  const dotEnvValues = getDotEnvValues()
  return normalizedRequiredKeys.filter((key) => {
    const envValue = normalizeNonEmpty(process.env[key])
    if (envValue) return false
    const dotEnvValue = normalizeNonEmpty(dotEnvValues.get(key))
    return !dotEnvValue
  })
}

export function assertRuntimeEnv(requiredKeys: string[]): void {
  const missing = resolveMissingRuntimeEnvKeys(requiredKeys)
  if (missing.length === 0) return
  throw new Error(`runtime_env_missing:${missing[0]}`)
}

function looksLikeSqliteRepoUrl(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (
    normalized.startsWith('file:') ||
    normalized.startsWith('sqlite:') ||
    normalized.includes(':sqlite:') ||
    normalized.endsWith('.sqlite') ||
    normalized.endsWith('.sqlite3') ||
    normalized.endsWith('.db')
  )
}

function resolveEffectiveAgentspaceRepoEnv(): { key: string; value: string } | null {
  const dotEnvValues = getDotEnvValues()
  for (const key of AGENTSPACE_HOST_REPO_ENV_KEYS) {
    const envValue = normalizeNonEmpty(process.env[key])
    if (envValue) return { key, value: envValue }
    const dotEnvValue = normalizeNonEmpty(dotEnvValues.get(key))
    if (dotEnvValue) return { key, value: dotEnvValue }
  }
  return null
}

export function assertIntegratedHostStorageEnv(): void {
  const effective = resolveEffectiveAgentspaceRepoEnv()
  if (!effective) return

  if (effective.key.endsWith('_SQLITE_URL') || looksLikeSqliteRepoUrl(effective.value)) {
    throw new Error(
      [
        'agentspace_host_runtime_storage_unbound:',
        `effective repo source ${effective.key} resolves to SQLite.`,
        'Set AGENTSPACE_REPO_URL/AGENTSPACE_PG_URL or AOPS_REPO_URL/AOPS_PG_URL to PostgreSQL before starting AOPS server.',
      ].join(''),
    )
  }
}
