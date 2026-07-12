import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from 'pg'

const STATEMENT_BREAKPOINT = '--> statement-breakpoint'
const MIGRATION_TABLE = 'sys_schema_migrations'
const TRACKED_TABLES = ['sys_rate_limiters', 'sys_event_stores', 'sys_counters'] as const
const SCHEMA_LOCK_CLASS_ID = 28015
const SCHEMA_LOCK_OBJECT_ID = 5

type SysMigrationJournalEntry = {
  idx: number
  tag: string
}

export type SysPgBootstrapPaths = {
  domainRoot: string
  migrationsDir: string
  migrationsDirExists: boolean
  journalPath: string
  journalExists: boolean
}

function resolveSysDomainRoot(domainRoot?: string): string {
  if (domainRoot) {
    return path.resolve(domainRoot)
  }

  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const candidates = [
    packageRoot,
    path.resolve(packageRoot, '..'),
    path.resolve(packageRoot, '..', '..'),
  ]

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, 'drizzle-out', 'sys'))) {
      return candidate
    }
  }

  return packageRoot
}

export function resolveSysPgBootstrapPaths(domainRoot?: string): SysPgBootstrapPaths {
  const resolvedDomainRoot = resolveSysDomainRoot(domainRoot)
  const migrationsDir = path.join(resolvedDomainRoot, 'drizzle-out', 'sys')
  const journalPath = path.join(migrationsDir, 'meta', '_journal.json')
  return {
    domainRoot: resolvedDomainRoot,
    migrationsDir,
    migrationsDirExists: existsSync(migrationsDir),
    journalPath,
    journalExists: existsSync(journalPath),
  }
}

function splitMigrationStatements(sql: string): string[] {
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean)
}

function readMigrationJournal(paths: SysPgBootstrapPaths): SysMigrationJournalEntry[] {
  if (!paths.journalExists) {
    throw new Error(`sys_pg_bootstrap_journal_missing:${paths.journalPath}`)
  }

  const payload = JSON.parse(readFileSync(paths.journalPath, 'utf8')) as {
    entries?: SysMigrationJournalEntry[]
  }
  const entries = Array.isArray(payload.entries) ? payload.entries : []
  return entries
    .map((entry) => ({
      idx: Number(entry.idx ?? 0),
      tag: String(entry.tag ?? '').trim(),
    }))
    .filter((entry) => entry.tag.length > 0)
    .sort((left, right) => left.idx - right.idx)
}

function resolveMigrationSqlPath(paths: SysPgBootstrapPaths, tag: string): string {
  return path.join(paths.migrationsDir, `${tag}.sql`)
}

const NON_BASELINE_SQL_PATTERNS: readonly RegExp[] = [
  /\bALTER\s+TABLE\s+(?:"[^"]+"|\S+)\s+ALTER\s+COLUMN\b/i,
  /\bALTER\s+TABLE\s+(?:"[^"]+"|\S+)\s+ADD\s+COLUMN\b/i,
  /\bALTER\s+TABLE\s+(?:"[^"]+"|\S+)\s+DROP\s+COLUMN\b/i,
  /\bALTER\s+TABLE\s+(?:"[^"]+"|\S+)\s+RENAME\b/i,
  /\bINSERT\s+INTO\b/i,
  /\bUPDATE\s+(?:"[^"]+"|\w+)\s+SET\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bDROP\s+(?:TABLE|INDEX|COLUMN|CONSTRAINT|SCHEMA|EXTENSION)\b/i,
  /\bTRUNCATE\b/i,
] as const

export function classifyMigrationSqlAsBaselineOnly(sql: string): boolean {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
  return !NON_BASELINE_SQL_PATTERNS.some((pattern) => pattern.test(stripped))
}

function listIncrementalMissingMigrations(
  paths: SysPgBootstrapPaths,
  missingEntries: SysMigrationJournalEntry[],
): SysMigrationJournalEntry[] {
  return missingEntries.filter((entry) => {
    const sqlPath = resolveMigrationSqlPath(paths, entry.tag)
    if (!existsSync(sqlPath)) return false
    const sql = readFileSync(sqlPath, 'utf8')
    return !classifyMigrationSqlAsBaselineOnly(sql)
  })
}

async function withPgClient<T>(repoUrl: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: repoUrl })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function withSchemaLock<T>(client: Client, fn: () => Promise<T>): Promise<T> {
  await client.query('SELECT pg_advisory_lock($1, $2)', [SCHEMA_LOCK_CLASS_ID, SCHEMA_LOCK_OBJECT_ID])
  try {
    return await fn()
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1, $2)', [SCHEMA_LOCK_CLASS_ID, SCHEMA_LOCK_OBJECT_ID])
      .catch(() => undefined)
  }
}

async function ensureMigrationTable(client: Client): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS public.${MIGRATION_TABLE} (
      tag text PRIMARY KEY,
      applied_at timestamp with time zone NOT NULL DEFAULT now()
    )`,
  )
}

async function readAppliedTags(client: Client): Promise<Set<string>> {
  const result = await client.query<{ tag: string }>(`SELECT tag FROM public.${MIGRATION_TABLE}`)
  return new Set(result.rows.map((row) => row.tag))
}

async function queryExistingTables(client: Client): Promise<Set<string>> {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [TRACKED_TABLES],
  )
  return new Set(result.rows.map((row) => row.table_name))
}

async function hasColumn(
  client: Client,
  tableName: string,
  columnName: string,
  expectedType?: string,
): Promise<boolean> {
  const result = await client.query<{ data_type: string; udt_name: string }>(
    `SELECT data_type, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2`,
    [tableName, columnName],
  )
  const row = result.rows[0]
  if (!row) return false
  if (!expectedType) return true
  return row.data_type === expectedType || row.udt_name === expectedType
}

async function schemaLooksBaselineReady(client: Client): Promise<boolean> {
  const existingTables = await queryExistingTables(client)
  if (existingTables.size !== TRACKED_TABLES.length) {
    return false
  }

  const checks = await Promise.all([
    hasColumn(client, 'sys_rate_limiters', 'tenantId'),
    hasColumn(client, 'sys_rate_limiters', 'key'),
    hasColumn(client, 'sys_rate_limiters', 'scope'),
    hasColumn(client, 'sys_rate_limiters', 'attempts'),
    hasColumn(client, 'sys_rate_limiters', 'windowStart'),
    hasColumn(client, 'sys_rate_limiters', 'resetAt'),
    hasColumn(client, 'sys_rate_limiters', 'blockedAt'),
    hasColumn(client, 'sys_event_stores', 'tenantId'),
    hasColumn(client, 'sys_event_stores', 'eventId'),
    hasColumn(client, 'sys_event_stores', 'eventType'),
    hasColumn(client, 'sys_event_stores', 'aggregateId'),
    hasColumn(client, 'sys_event_stores', 'eventData'),
    hasColumn(client, 'sys_event_stores', 'version'),
    hasColumn(client, 'sys_event_stores', 'occurredAt'),
    hasColumn(client, 'sys_counters', 'tenantId'),
    hasColumn(client, 'sys_counters', 'scopeId'),
    hasColumn(client, 'sys_counters', 'counterKey'),
    hasColumn(client, 'sys_counters', 'nextValue'),
    hasColumn(client, 'sys_counters', 'step'),
  ])

  return checks.every(Boolean)
}

async function schemaLooksCurrent(client: Client): Promise<boolean> {
  if (!(await schemaLooksBaselineReady(client))) {
    return false
  }

  const checks = await Promise.all([
    hasColumn(client, 'sys_rate_limiters', 'violationStreak'),
    hasColumn(client, 'sys_rate_limiters', 'windowStart', 'timestamp with time zone'),
    hasColumn(client, 'sys_rate_limiters', 'resetAt', 'timestamp with time zone'),
    hasColumn(client, 'sys_rate_limiters', 'blockedAt', 'timestamp with time zone'),
    hasColumn(client, 'sys_rate_limiters', 'lastViolationAt', 'timestamp with time zone'),
    hasColumn(client, 'sys_counters', 'metadataJson', 'jsonb'),
  ])

  return checks.every(Boolean)
}

async function adoptExistingCurrentSchema(
  client: Client,
  paths: SysPgBootstrapPaths,
  missingEntries: SysMigrationJournalEntry[],
  logs: string[],
): Promise<boolean> {
  if (missingEntries.length === 0) return true

  const incremental = listIncrementalMissingMigrations(paths, missingEntries)
  const baselineEntries = missingEntries.filter((entry) => !incremental.some((candidate) => candidate.tag === entry.tag))
  if (baselineEntries.length === 0 && incremental.length > 0) {
    logs.push(
      `Skipping adoption: ${String(incremental.length)} incremental migration(s) remain unapplied: ${incremental
        .map((entry) => entry.tag)
        .join(', ')}. They will run through the standard apply path.`,
    )
    return false
  }

  const looksCurrent = incremental.length > 0 ? await schemaLooksBaselineReady(client) : await schemaLooksCurrent(client)
  if (!looksCurrent) return false

  logs.push('Existing sys PostgreSQL schema detected without complete migration journal. Adopting baseline-only schema state.')
  for (const entry of baselineEntries.length > 0 ? baselineEntries : missingEntries) {
    await client.query(`INSERT INTO public.${MIGRATION_TABLE} (tag) VALUES ($1) ON CONFLICT (tag) DO NOTHING`, [entry.tag])
  }
  logs.push(
    `Adopted ${String((baselineEntries.length > 0 ? baselineEntries : missingEntries).length)} baseline migration tag(s) without reapplying SQL.`,
  )
  return true
}

async function applyMigrationEntry(
  client: Client,
  paths: SysPgBootstrapPaths,
  entry: SysMigrationJournalEntry,
  logs: string[],
): Promise<void> {
  const sqlPath = resolveMigrationSqlPath(paths, entry.tag)
  if (!existsSync(sqlPath)) {
    throw new Error(`sys_pg_bootstrap_sql_missing:${sqlPath}`)
  }

  const sql = readFileSync(sqlPath, 'utf8')
  const statements = splitMigrationStatements(sql)
  if (statements.length === 0) {
    logs.push(`Skipping ${entry.tag}: migration file contains no executable statements.`)
    await client.query(`INSERT INTO public.${MIGRATION_TABLE} (tag) VALUES ($1) ON CONFLICT (tag) DO NOTHING`, [entry.tag])
    return
  }

  logs.push(`Applying Sys PostgreSQL migration: ${entry.tag}`)
  await client.query('BEGIN')
  try {
    for (const statement of statements) {
      await client.query(statement)
    }
    await client.query(`INSERT INTO public.${MIGRATION_TABLE} (tag) VALUES ($1) ON CONFLICT (tag) DO NOTHING`, [entry.tag])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

export async function applySysPgSchema(params: {
  repoUrl: string
  domainRoot?: string
  logs?: string[]
}): Promise<SysPgBootstrapPaths> {
  const logs = params.logs ?? []
  const paths = resolveSysPgBootstrapPaths(params.domainRoot)
  if (!paths.migrationsDirExists) {
    throw new Error(`sys_pg_bootstrap_migrations_dir_missing:${paths.migrationsDir}`)
  }

  const entries = readMigrationJournal(paths)
  logs.push('Applying Sys PostgreSQL schema via owned SQL migration runner...')

  await withPgClient(params.repoUrl, async (client) => {
    await withSchemaLock(client, async () => {
      await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
      await ensureMigrationTable(client)

      let appliedTags = await readAppliedTags(client)
      const missingEntries = entries.filter((entry) => !appliedTags.has(entry.tag))

      const adopted = await adoptExistingCurrentSchema(client, paths, missingEntries, logs)
      if (adopted) {
        appliedTags = await readAppliedTags(client)
      }

      for (const entry of entries) {
        if (appliedTags.has(entry.tag)) {
          logs.push(`Skipping ${entry.tag}: already applied.`)
          continue
        }
        await applyMigrationEntry(client, paths, entry, logs)
        appliedTags.add(entry.tag)
      }
    })
  })

  logs.push('Sys PostgreSQL schema is ready.')
  return paths
}
