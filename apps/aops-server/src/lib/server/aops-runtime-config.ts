import { Pool, type PoolConfig } from 'pg'

export const COMMUNITY_PG_ENV_KEY = 'AOPS_PG_URL' as const
export const COMMUNITY_PG_SCHEMA_TABLES = ['projects', 'docman_documents', 'projectman_kanban_boards', 'chatv3-rooms', 'sys_event_stores'] as const
const codepointCompare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0

type CommunityPgTarget = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export type ResolvedAopsServerRuntimeConfig = {
  repoUrl: string
  repoDialect: 'pg' | null
  repoUrlSource: 'env' | 'missing'
  envPath: null
  envExists: false
  hostSettings: { logLevel: 'info' }
  logLevelSource: 'default'
}

function nonEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function assertNoAmbientPgEnv(processEnv: NodeJS.ProcessEnv): void {
  const forbidden = Object.keys(processEnv)
    .filter((key) => /^PG[A-Z0-9_]+$/i.test(key) && nonEmpty(processEnv[key]))
    .sort()
  if (forbidden.length > 0) {
    throw new Error(`community_pg_ambient_env_forbidden:${forbidden.join(',')}`)
  }
}

function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw new Error('community_pg_url_invalid')
  }
}

function isLoopbackPgHost(value: string): boolean {
  const host = value.trim().toLowerCase()
  if (host === 'localhost' || host === '::1') return true
  const match = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  return Boolean(match && match.slice(1).every((octet) => Number(octet) <= 255))
}

function parsePgTarget(value: unknown): CommunityPgTarget {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) throw new Error('aops_pg_url_required')
  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error('community_pg_url_invalid')
  }
  if ((parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') || parsed.search || parsed.hash) {
    throw new Error('community_pg_url_invalid')
  }
  const host = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
    ? parsed.hostname.slice(1, -1)
    : parsed.hostname
  const port = parsed.port ? Number(parsed.port) : 5432
  const user = decodeUrlComponent(parsed.username)
  const password = decodeUrlComponent(parsed.password)
  const database = decodeUrlComponent(parsed.pathname.startsWith('/') ? parsed.pathname.slice(1) : parsed.pathname)
  if (
    !host || !isLoopbackPgHost(host) || !user || !password || !database ||
    !Number.isInteger(port) || port < 1 || port > 65535 ||
    /[\/\u0000-\u001f\u007f]/.test(database) ||
    /[\u0000-\u001f\u007f]/.test(host + user + password)
  ) {
    throw new Error('community_pg_url_invalid')
  }
  return { host, port, user, password, database }
}

function redactPgTarget(target: CommunityPgTarget): string {
  const host = target.host.includes(':') ? `[${target.host}]` : target.host
  return `postgresql://${encodeURIComponent(target.user)}:***@${host}:${target.port}/${encodeURIComponent(target.database)}`
}

function createPoolConfig(target: CommunityPgTarget): PoolConfig {
  return {
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: target.database,
    ssl: false,
    application_name: 'aops-community-probe',
    options: '-c search_path=public',
    connectionTimeoutMillis: 8_000,
    query_timeout: 8_000,
    statement_timeout: 8_000,
    lock_timeout: 8_000,
    idle_in_transaction_session_timeout: 8_000,
    max: 1,
  }
}

function resolveRuntime(processEnv: NodeJS.ProcessEnv = process.env): ResolvedAopsServerRuntimeConfig {
  assertNoAmbientPgEnv(processEnv)
  const repoUrl = nonEmpty(processEnv[COMMUNITY_PG_ENV_KEY])
  if (repoUrl) parsePgTarget(repoUrl)
  return {
    repoUrl,
    repoDialect: repoUrl ? 'pg' : null,
    repoUrlSource: repoUrl ? 'env' : 'missing',
    envPath: null,
    envExists: false,
    hostSettings: { logLevel: 'info' },
    logLevelSource: 'default',
  }
}

let resolvedRuntimeConfig = resolveRuntime()

export function refreshResolvedAopsServerRuntimeConfig(
  processEnv: NodeJS.ProcessEnv = process.env
): ResolvedAopsServerRuntimeConfig {
  resolvedRuntimeConfig = resolveRuntime(processEnv)
  return resolvedRuntimeConfig
}

export function getResolvedAopsServerRuntimeConfig(): ResolvedAopsServerRuntimeConfig {
  return resolvedRuntimeConfig
}

export function readRuntimeConfigAdmin() {
  const runtime = getResolvedAopsServerRuntimeConfig()
  const target = runtime.repoUrl ? parsePgTarget(runtime.repoUrl) : null
  return {
    policy: { owner: 'host', surface: 'host-admin', writeMode: 'process-env-read-only', dialectsAllowed: ['pg'] as const, secretsMode: 'redacted' },
    locks: { repoUrl: runtime.repoUrl ? { source: 'env' as const, envKey: COMMUNITY_PG_ENV_KEY } : null },
    effective: {
      repoDialect: runtime.repoDialect, repoUrlSource: runtime.repoUrlSource, redactedRepoUrl: target ? redactPgTarget(target) : null, editableRepoUrl: null,
    },
    status: { ok: Boolean(runtime.repoUrl), issues: runtime.repoUrl ? [] : ['AOPS_PG_URL is required.'], warnings: [] },
  }
}

async function runRuntimeConfigAdminTargetProbe(
  processEnv: NodeJS.ProcessEnv = process.env
) {
  assertNoAmbientPgEnv(processEnv)
  const target = parsePgTarget(processEnv[COMMUNITY_PG_ENV_KEY])
  const pool = new Pool(createPoolConfig(target))
  try {
    const database = await pool.query<{ name: string }>('select current_database() as name')
    const tables = await pool.query<{ name: string }>(
      `select candidate.name
         from unnest($1::text[]) as candidate(name)
         join pg_catalog.pg_class c on c.relname = candidate.name and c.relkind in ('r', 'p')
         join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
        where has_table_privilege(c.oid, 'SELECT')`,
      [COMMUNITY_PG_SCHEMA_TABLES],
    )
    const existingRelations = tables.rows.map((row) => row.name).sort(codepointCompare)
    const missingRelations = COMMUNITY_PG_SCHEMA_TABLES.filter((name) => !existingRelations.includes(name))
    return {
      target: { repoDialect: 'pg' as const, redactedRepoUrl: redactPgTarget(target) },
      connection: { ok: true, databaseName: String(database.rows[0]?.name ?? "") || null, message: "Connected to configured PostgreSQL target." },
      schema: { verificationLevel: 'sentinel-relations-only' as const, ready: false, sentinelsPresent: missingRelations.length === 0, configuredRelationCount: COMMUNITY_PG_SCHEMA_TABLES.length, existingRelationCount: existingRelations.length, existingRelations, missingRelations },
      warnings: [
        'Full domain migration readiness requires packaged bootstrap and runtime catalog smoke.',
        ...(missingRelations.length === 0 ? [] : [`Configured target is missing ${missingRelations.length} Community schema sentinel relation(s).`]),
      ],
    }
  } finally {
    await pool.end().catch(() => undefined)
  }
}

let activeProbe: ReturnType<typeof runRuntimeConfigAdminTargetProbe> | null = null

export async function testRuntimeConfigAdminTarget(
  processEnv: NodeJS.ProcessEnv = process.env
) {
  if (activeProbe) return activeProbe
  activeProbe = runRuntimeConfigAdminTargetProbe(processEnv)
  try {
    return await activeProbe
  } finally {
    activeProbe = null
  }
}
