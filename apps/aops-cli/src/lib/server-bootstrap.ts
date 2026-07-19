import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { resolveAopsConfigDir } from '@aops/host-registration'
import {
  getDefaultAopsSqliteRepoUrl,
  inferAopsRepoDialect,
  type AopsRepoDialect,
} from '@aops/runtime-config'

export type AuthProvider = 'trusted-local' | 'authv2-jwt-session'

export type ServerBootstrapPreset = {
  authProvider: AuthProvider
  repoUrl: string
  adminKey: string
  webhookSecret: string
  jwtSecret: string
  jwtEncSecret: string
  localPrincipalId: string
  localPrincipalEmail: string
  localPrincipalFullName: string
  localPrincipalRoles: string
  localPrincipalPermissions: string
}

export type ServerBootstrapValidation = {
  ok: boolean
  authProvider: AuthProvider
  repoUrl: string
  repoDialect: AopsRepoDialect
  errors: string[]
  warnings: string[]
}

export type ServerBootstrapEnvMapOptions = {
  includeFileman?: boolean
  filemanRepoUrl?: string
  processEnv?: NodeJS.ProcessEnv
}

export const DEFAULT_AUTH_PROVIDER: AuthProvider = 'trusted-local'
export const DEFAULT_LOCAL_PRINCIPAL_ID = '00000000-0000-4000-8000-000000000001'
export const DEFAULT_LOCAL_PRINCIPAL_FULL_NAME = 'AOPS Local Operator'
export const DEFAULT_LOCAL_PRINCIPAL_ROLES = 'admin'
export const DEFAULT_LOCAL_PRINCIPAL_PERMISSIONS = '*'
export const BOOTSTRAP_BLOCK_START = '# >>> AOPS bootstrap >>>'
export const BOOTSTRAP_BLOCK_END = '# <<< AOPS bootstrap <<<'

const MANAGED_KEYS = [
  'AOPS_AUTH_PROVIDER',
  'AOPS_REPO_URL',
  'AOPS_SQLITE_URL',
  'AOPS_PG_URL',
  'DOCMAN_REPO_URL',
  'DOCMAN_SQLITE_URL',
  'DOCMAN_PG_URL',
  'AOPS_ADMIN_KEY',
  'AOPS_RUNNER_WEBHOOK_SECRET',
  'JWT_SECRET',
  'JWT_ENC_SECRET',
  'AOPS_LOCAL_PRINCIPAL_ID',
  'AOPS_LOCAL_PRINCIPAL_EMAIL',
  'AOPS_LOCAL_PRINCIPAL_FULL_NAME',
  'AOPS_LOCAL_PRINCIPAL_ROLES',
  'AOPS_LOCAL_PRINCIPAL_PERMISSIONS',
] as const

const MANAGED_KEY_SET = new Set<string>(MANAGED_KEYS)
const FILEMAN_MANAGED_KEYS = [
  'FILEMAN_REPO_URL',
  'FILEMAN_SQLITE_URL',
  'FILEMAN_PG_URL',
] as const

export function getDefaultFilemanSqliteRepoUrl(
  processEnv: NodeJS.ProcessEnv = process.env,
): string {
  return pathToFileURL(path.join(resolveAopsConfigDir(processEnv), 'fileman.aops.sqlite')).href
}

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
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

function extractAssignmentKey(line: string): string | undefined {
  const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)
  return match?.[1]
}

function quoteEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value
  return JSON.stringify(value)
}

export function normalizeAuthProvider(
  value: unknown,
  fallback: AuthProvider = DEFAULT_AUTH_PROVIDER,
): AuthProvider {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized) return fallback
  if (normalized === 'trusted-local' || normalized === 'trusted_local' || normalized === 'trusted') {
    return 'trusted-local'
  }
  if (
    normalized === 'authv2-jwt-session' ||
    normalized === 'authv2_jwt_session' ||
    normalized === 'jwt-session' ||
    normalized === 'jwt_session' ||
    normalized === 'session'
  ) {
    return 'authv2-jwt-session'
  }
  return fallback
}

export function createRandomSecret(bytes = 24): string {
  return randomBytes(bytes).toString('hex')
}

export function parseDotEnvAssignments(content: string): Record<string, string> {
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

function resolveExistingRepoUrl(existing: Record<string, string | undefined>): string | undefined {
  return (
    normalizeNonEmpty(existing.AOPS_REPO_URL) ??
    normalizeNonEmpty(existing.AOPS_SQLITE_URL) ??
    normalizeNonEmpty(existing.AOPS_PG_URL)
  )
}

export function buildServerBootstrapPreset(params: {
  authProvider?: AuthProvider
  repoUrl?: string
  existing?: Record<string, string | undefined>
  processEnv?: NodeJS.ProcessEnv
}): ServerBootstrapPreset {
  const existing = params.existing ?? {}
  const processEnv = params.processEnv ?? process.env
  const authProvider = normalizeAuthProvider(
    params.authProvider ?? existing.AOPS_AUTH_PROVIDER ?? (normalizeNonEmpty(existing.JWT_SECRET) ? 'authv2-jwt-session' : undefined),
  )
  const repoUrl =
    normalizeNonEmpty(params.repoUrl) ??
    resolveExistingRepoUrl(existing) ??
    getDefaultAopsSqliteRepoUrl(processEnv)

  return {
    authProvider,
    repoUrl,
    adminKey: normalizeNonEmpty(existing.AOPS_ADMIN_KEY) ?? createRandomSecret(24),
    webhookSecret: normalizeNonEmpty(existing.AOPS_RUNNER_WEBHOOK_SECRET) ?? createRandomSecret(24),
    jwtSecret: normalizeNonEmpty(existing.JWT_SECRET) ?? createRandomSecret(32),
    jwtEncSecret: normalizeNonEmpty(existing.JWT_ENC_SECRET) ?? createRandomSecret(32),
    localPrincipalId:
      normalizeNonEmpty(existing.AOPS_LOCAL_PRINCIPAL_ID) ?? DEFAULT_LOCAL_PRINCIPAL_ID,
    localPrincipalEmail: normalizeNonEmpty(existing.AOPS_LOCAL_PRINCIPAL_EMAIL) ?? '',
    localPrincipalFullName:
      normalizeNonEmpty(existing.AOPS_LOCAL_PRINCIPAL_FULL_NAME) ??
      DEFAULT_LOCAL_PRINCIPAL_FULL_NAME,
    localPrincipalRoles:
      normalizeNonEmpty(existing.AOPS_LOCAL_PRINCIPAL_ROLES) ?? DEFAULT_LOCAL_PRINCIPAL_ROLES,
    localPrincipalPermissions:
      normalizeNonEmpty(existing.AOPS_LOCAL_PRINCIPAL_PERMISSIONS) ??
      DEFAULT_LOCAL_PRINCIPAL_PERMISSIONS,
  }
}

export function buildServerBootstrapEnvMap(
  preset: ServerBootstrapPreset,
  options: ServerBootstrapEnvMapOptions = {},
): Record<string, string> {
  const repoDialect = inferAopsRepoDialect(preset.repoUrl)
  const env: Record<string, string> = {
    AOPS_REPO_URL: preset.repoUrl,
    DOCMAN_REPO_URL: preset.repoUrl,
    AOPS_ADMIN_KEY: preset.adminKey,
    AOPS_AUTH_PROVIDER: preset.authProvider,
    AOPS_RUNNER_WEBHOOK_SECRET: preset.webhookSecret,
  }

  if (repoDialect === 'sqlite') {
    env.AOPS_SQLITE_URL = preset.repoUrl
    env.DOCMAN_SQLITE_URL = preset.repoUrl
  } else {
    env.AOPS_PG_URL = preset.repoUrl
    env.DOCMAN_PG_URL = preset.repoUrl
  }

  if (options.includeFileman) {
    const filemanRepoUrl =
      normalizeNonEmpty(options.filemanRepoUrl) ??
      getDefaultFilemanSqliteRepoUrl(options.processEnv ?? process.env)
    env.FILEMAN_REPO_URL = filemanRepoUrl
    env.FILEMAN_SQLITE_URL = filemanRepoUrl
  }

  if (preset.authProvider === 'authv2-jwt-session') {
    env.JWT_SECRET = preset.jwtSecret
    env.JWT_ENC_SECRET = preset.jwtEncSecret
    return env
  }

  env.AOPS_LOCAL_PRINCIPAL_ID = preset.localPrincipalId
  env.AOPS_LOCAL_PRINCIPAL_FULL_NAME = preset.localPrincipalFullName
  env.AOPS_LOCAL_PRINCIPAL_ROLES = preset.localPrincipalRoles
  env.AOPS_LOCAL_PRINCIPAL_PERMISSIONS = preset.localPrincipalPermissions
  if (normalizeNonEmpty(preset.localPrincipalEmail)) {
    env.AOPS_LOCAL_PRINCIPAL_EMAIL = preset.localPrincipalEmail
  }
  return env
}

export function renderServerBootstrapBlock(
  env: Record<string, string>,
  options: { authProvider: AuthProvider; repoUrl: string; includeFileman?: boolean } | undefined,
): string {
  const authProvider = options?.authProvider ?? DEFAULT_AUTH_PROVIDER
  const repoUrl = options?.repoUrl ?? getDefaultAopsSqliteRepoUrl(process.env)
  const repoDialect = inferAopsRepoDialect(repoUrl)
  const includeFileman =
    options?.includeFileman === true ||
    Boolean(normalizeNonEmpty(env.FILEMAN_REPO_URL) ?? normalizeNonEmpty(env.FILEMAN_SQLITE_URL))
  const lines = [
    BOOTSTRAP_BLOCK_START,
    '# Managed by aops-cli setup server-env',
    '# Storage target and auth provider live in the host-owned local env boundary.',
    `# Effective auth provider: ${authProvider}`,
    `# Effective repository dialect: ${repoDialect}`,
    `# Effective repository target: ${repoUrl}`,
    '',
    '# Canonical storage target',
    `AOPS_REPO_URL=${quoteEnvValue(env.AOPS_REPO_URL ?? repoUrl)}`,
    repoDialect === 'sqlite'
      ? `AOPS_SQLITE_URL=${quoteEnvValue(env.AOPS_SQLITE_URL ?? repoUrl)}`
      : `AOPS_PG_URL=${quoteEnvValue(env.AOPS_PG_URL ?? repoUrl)}`,
    `DOCMAN_REPO_URL=${quoteEnvValue(env.DOCMAN_REPO_URL ?? repoUrl)}`,
    repoDialect === 'sqlite'
      ? `DOCMAN_SQLITE_URL=${quoteEnvValue(env.DOCMAN_SQLITE_URL ?? repoUrl)}`
      : `DOCMAN_PG_URL=${quoteEnvValue(env.DOCMAN_PG_URL ?? repoUrl)}`,
  ]

  if (includeFileman) {
    const filemanRepoUrl =
      normalizeNonEmpty(env.FILEMAN_REPO_URL) ??
      normalizeNonEmpty(env.FILEMAN_SQLITE_URL) ??
      getDefaultFilemanSqliteRepoUrl(process.env)
    lines.push(
      '',
      '# Fileman plugin-owned storage (explicit opt-in)',
      '# Fileman remains plugin-owned; this avoids implicit fileman:sqlite:auto resolution.',
      `FILEMAN_REPO_URL=${quoteEnvValue(filemanRepoUrl)}`,
      `FILEMAN_SQLITE_URL=${quoteEnvValue(env.FILEMAN_SQLITE_URL ?? filemanRepoUrl)}`,
    )
  }

  lines.push(
    '',
    '# Bootstrap auth and trusted-principal secrets',
    `AOPS_AUTH_PROVIDER=${quoteEnvValue(env.AOPS_AUTH_PROVIDER)}`,
    `AOPS_ADMIN_KEY=${quoteEnvValue(env.AOPS_ADMIN_KEY)}`,
    `AOPS_RUNNER_WEBHOOK_SECRET=${quoteEnvValue(env.AOPS_RUNNER_WEBHOOK_SECRET)}`,
  )

  if (authProvider === 'authv2-jwt-session') {
    lines.push('', '# Interactive auth provider', `JWT_SECRET=${quoteEnvValue(env.JWT_SECRET)}`)
    if (normalizeNonEmpty(env.JWT_ENC_SECRET)) {
      lines.push(`JWT_ENC_SECRET=${quoteEnvValue(env.JWT_ENC_SECRET)}`)
    }
  } else {
    lines.push(
      '',
      '# Trusted-local principal',
      `AOPS_LOCAL_PRINCIPAL_ID=${quoteEnvValue(env.AOPS_LOCAL_PRINCIPAL_ID)}`,
      `AOPS_LOCAL_PRINCIPAL_FULL_NAME=${quoteEnvValue(env.AOPS_LOCAL_PRINCIPAL_FULL_NAME)}`,
      `AOPS_LOCAL_PRINCIPAL_ROLES=${quoteEnvValue(env.AOPS_LOCAL_PRINCIPAL_ROLES)}`,
      `AOPS_LOCAL_PRINCIPAL_PERMISSIONS=${quoteEnvValue(env.AOPS_LOCAL_PRINCIPAL_PERMISSIONS)}`,
    )
    if (normalizeNonEmpty(env.AOPS_LOCAL_PRINCIPAL_EMAIL)) {
      lines.push(`AOPS_LOCAL_PRINCIPAL_EMAIL=${quoteEnvValue(env.AOPS_LOCAL_PRINCIPAL_EMAIL)}`)
    }
  }

  lines.push('', BOOTSTRAP_BLOCK_END)
  return `${lines.join('\n')}\n`
}

function stripManagedAssignments(content: string, extraManagedKeys: readonly string[] = []): string {
  const managedKeys =
    extraManagedKeys.length > 0
      ? new Set<string>([...MANAGED_KEY_SET, ...extraManagedKeys])
      : MANAGED_KEY_SET
  const lines = content.split(/\r?\n/)
  const kept = lines.filter((line) => {
    const key = extractAssignmentKey(line)
    return !(key && managedKeys.has(key))
  })
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function upsertServerBootstrapBlock(params: {
  existingContent?: string
  env: Record<string, string>
  authProvider: AuthProvider
  repoUrl: string
  includeFileman?: boolean
}): string {
  const block = renderServerBootstrapBlock(params.env, {
    authProvider: params.authProvider,
    repoUrl: params.repoUrl,
    includeFileman: params.includeFileman,
  }).trimEnd()
  const existingContent = params.existingContent ?? ''
  const start = existingContent.indexOf(BOOTSTRAP_BLOCK_START)
  const end = existingContent.indexOf(BOOTSTRAP_BLOCK_END)

  if (start >= 0 && end >= start) {
    const before = existingContent.slice(0, start).trimEnd()
    const after = existingContent.slice(end + BOOTSTRAP_BLOCK_END.length).trimStart()
    return [before, block, after].filter(Boolean).join('\n\n').trimEnd() + '\n'
  }

  const base = stripManagedAssignments(
    existingContent,
    params.includeFileman ? FILEMAN_MANAGED_KEYS : [],
  )
  return [base, block].filter(Boolean).join('\n\n').trimEnd() + '\n'
}

export function validateServerBootstrapEnv(
  assignments: Record<string, string | undefined>,
  options: {
    authProvider?: AuthProvider
    repoUrl?: string
    processEnv?: NodeJS.ProcessEnv
  } = {},
): ServerBootstrapValidation {
  const processEnv = options.processEnv ?? process.env
  const authProvider = normalizeAuthProvider(
    options.authProvider ?? assignments.AOPS_AUTH_PROVIDER ?? (normalizeNonEmpty(assignments.JWT_SECRET) ? 'authv2-jwt-session' : undefined),
  )
  const repoUrl =
    normalizeNonEmpty(options.repoUrl) ??
    resolveExistingRepoUrl(assignments) ??
    getDefaultAopsSqliteRepoUrl(processEnv)
  const repoDialect = inferAopsRepoDialect(repoUrl)
  const errors: string[] = []
  const warnings: string[] = []

  if (!normalizeNonEmpty(repoUrl)) {
    errors.push('AOPS runtime storage target is missing.')
  }
  if (!normalizeNonEmpty(assignments.AOPS_ADMIN_KEY)) {
    warnings.push('AOPS_ADMIN_KEY is missing. Bootstrap admin commands will need it later.')
  }
  if (!normalizeNonEmpty(assignments.AOPS_RUNNER_WEBHOOK_SECRET)) {
    warnings.push('AOPS_RUNNER_WEBHOOK_SECRET is missing. Public webhook ingress will stay disabled.')
  }

  if (authProvider === 'authv2-jwt-session') {
    if (repoDialect !== 'pg') {
      errors.push('Interactive auth currently requires PostgreSQL storage.')
    }
    if (!normalizeNonEmpty(assignments.JWT_SECRET)) {
      errors.push('JWT_SECRET is required when interactive auth is enabled.')
    }
    if (!normalizeNonEmpty(assignments.JWT_ENC_SECRET)) {
      warnings.push('JWT_ENC_SECRET is optional; JWT_SECRET fallback will be used.')
    }
  }

  return {
    ok: errors.length === 0,
    authProvider,
    repoUrl,
    repoDialect,
    errors,
    warnings,
  }
}
