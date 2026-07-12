import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from 'pg'

const STATEMENT_BREAKPOINT = '--> statement-breakpoint'
const MIGRATION_TABLE = 'docman_schema_migrations'
const TRACKED_TABLES = [
  'docman_documents',
  'docman_document_groups',
  'docman_document_versions',
  'docman_sections',
  'docman_pages',
  'docman_page_versions',
  'docman_document_index_entries',
  'docman_document_section_links',
  'docman_section_page_links',
  'docman_snippets',
  'docman_page_snippet_links',
  'docman_assets',
  'docman_asset_versions',
  'docman_embeds',
  'docman_page_embed_links',
] as const

type DocmanMigrationJournalEntry = {
  idx: number
  tag: string
}

export type DocmanPgBootstrapPaths = {
  domainRoot: string
  migrationsDir: string
  migrationsDirExists: boolean
  journalPath: string
  journalExists: boolean
}

function resolveDocmanDomainRoot(domainRoot?: string): string {
  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const explicitDomainRoot = domainRoot ? path.resolve(domainRoot) : null
  const explicitWorkspaceDomainRoots = explicitDomainRoot
    ? [path.join(explicitDomainRoot, 'domains', 'docman'), path.join(explicitDomainRoot, 'docman')]
    : []
  const workspaceDomainRoot = path.resolve(packageRoot, '..')
  const candidates = [packageRoot, explicitDomainRoot, ...explicitWorkspaceDomainRoots, workspaceDomainRoot]

  for (const candidate of candidates) {
    if (candidate && existsSync(path.join(candidate, 'drizzle-out', 'docman'))) {
      return candidate
    }
  }

  return packageRoot
}

export function resolveDocmanPgBootstrapPaths(domainRoot?: string): DocmanPgBootstrapPaths {
  const resolvedDomainRoot = resolveDocmanDomainRoot(domainRoot)
  const migrationsDir = path.join(resolvedDomainRoot, 'drizzle-out', 'docman')
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

function readMigrationJournal(paths: DocmanPgBootstrapPaths): DocmanMigrationJournalEntry[] {
  if (!paths.journalExists) {
    throw new Error(`docman_pg_bootstrap_journal_missing:${paths.journalPath}`)
  }

  const payload = JSON.parse(readFileSync(paths.journalPath, 'utf8')) as { entries?: DocmanMigrationJournalEntry[] }
  const entries = Array.isArray(payload.entries) ? payload.entries : []
  return entries
    .map((entry) => ({
      idx: Number(entry.idx ?? 0),
      tag: String(entry.tag ?? '').trim(),
    }))
    .filter((entry) => entry.tag.length > 0)
    .sort((left, right) => left.idx - right.idx)
}

function resolveMigrationSqlPath(paths: DocmanPgBootstrapPaths, tag: string): string {
  return path.join(paths.migrationsDir, `${tag}.sql`)
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

async function lacksColumn(client: Client, tableName: string, columnName: string): Promise<boolean> {
  const result = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2`,
    [tableName, columnName],
  )
  return String(result.rows[0]?.count ?? '0') === '0'
}

async function schemaLooksCurrent(client: Client): Promise<boolean> {
  const existingTables = await queryExistingTables(client)
  if (existingTables.size !== TRACKED_TABLES.length) {
    return false
  }

  const checks: Array<() => Promise<boolean>> = [
    () => hasColumn(client, 'docman_documents', 'scopeId', 'uuid'),
    () => hasColumn(client, 'docman_document_groups', 'scopeId', 'uuid'),
    () => hasColumn(client, 'docman_sections', 'scopeId', 'uuid'),
    () => hasColumn(client, 'docman_pages', 'scopeId', 'uuid'),
    () => hasColumn(client, 'docman_snippets', 'scopeId', 'uuid'),
    () => hasColumn(client, 'docman_embeds', 'scopeId', 'uuid'),
    () => hasColumn(client, 'docman_assets', 'scopeId', 'uuid'),
    () => hasColumn(client, 'docman_documents', 'titleMl', 'jsonb'),
    () => hasColumn(client, 'docman_document_versions', 'releaseNotesMl', 'jsonb'),
    () => hasColumn(client, 'docman_page_versions', 'contentData', 'jsonb'),
    () => hasColumn(client, 'docman_document_index_entries', 'searchText', 'text'),
    () => hasColumn(client, 'docman_document_index_entries', 'summaryText', 'text'),
    () => hasColumn(client, 'docman_document_index_entries', 'sourceCharCount', 'int4'),
    () => hasColumn(client, 'docman_document_index_entries', 'sourceWordCount', 'int4'),
    () => hasColumn(client, 'docman_document_index_entries', 'summaryCharCount', 'int4'),
    () => hasColumn(client, 'docman_document_index_entries', 'summaryWordCount', 'int4'),
    () => hasColumn(client, 'docman_document_index_entries', 'embeddingProvider', 'text'),
    () => hasColumn(client, 'docman_document_index_entries', 'embeddingModel', 'text'),
    () => hasColumn(client, 'docman_document_index_entries', 'embeddingHash', 'text'),
    () => hasColumn(client, 'docman_document_index_entries', 'embeddingDimensions', 'int4'),
    () => hasColumn(client, 'docman_document_index_entries', 'embeddingVector', 'text'),
    () => hasColumn(client, 'docman_document_section_links', 'directives', 'jsonb'),
    () => hasColumn(client, 'docman_page_snippet_links', 'showLineNumbers'),
    () => hasColumn(client, 'docman_assets', 'currentVersionId', 'uuid'),
    () => hasColumn(client, 'docman_asset_versions', 'contentHash', 'text'),
    () => lacksColumn(client, 'docman_sections', 'description'),
    () => lacksColumn(client, 'docman_sections', 'descriptionMl'),
  ]

  for (const check of checks) {
    if (!(await check())) return false
  }
  return true
}

async function adoptExistingCurrentSchema(
  client: Client,
  missingEntries: DocmanMigrationJournalEntry[],
  logs: string[],
): Promise<boolean> {
  if (missingEntries.length === 0) return true

  const looksCurrent = await schemaLooksCurrent(client)
  if (!looksCurrent) return false

  logs.push('Existing docman PostgreSQL schema detected without complete migration journal. Adopting current schema state.')
  for (const entry of missingEntries) {
    await client.query(`INSERT INTO public.${MIGRATION_TABLE} (tag) VALUES ($1) ON CONFLICT (tag) DO NOTHING`, [entry.tag])
  }
  logs.push(`Adopted ${String(missingEntries.length)} migration tag(s) without reapplying SQL.`)
  return true
}

async function applyMigrationEntry(
  client: Client,
  paths: DocmanPgBootstrapPaths,
  entry: DocmanMigrationJournalEntry,
  logs: string[],
): Promise<void> {
  const sqlPath = resolveMigrationSqlPath(paths, entry.tag)
  if (!existsSync(sqlPath)) {
    throw new Error(`docman_pg_bootstrap_sql_missing:${sqlPath}`)
  }

  const sql = readFileSync(sqlPath, 'utf8')
  const statements = splitMigrationStatements(sql)
  if (statements.length === 0) {
    logs.push(`Skipping ${entry.tag}: migration file contains no executable statements.`)
    await client.query(`INSERT INTO public.${MIGRATION_TABLE} (tag) VALUES ($1) ON CONFLICT (tag) DO NOTHING`, [entry.tag])
    return
  }

  logs.push(`Applying Docman PostgreSQL migration: ${entry.tag}`)
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

async function assertSchemaMatchesAppliedMigrations(client: Client, entries: DocmanMigrationJournalEntry[]): Promise<void> {
  const appliedTags = await readAppliedTags(client)
  const hasFullJournal = entries.every((entry) => appliedTags.has(entry.tag))
  if (!hasFullJournal) return

  const looksCurrent = await schemaLooksCurrent(client)
  if (looksCurrent) return

  throw new Error('docman_pg_bootstrap_schema_drift_detected:all_migrations_marked_applied_but_schema_is_incomplete')
}

export async function applyDocmanPgSchema(params: {
  repoUrl: string
  domainRoot?: string
  logs?: string[]
}): Promise<DocmanPgBootstrapPaths> {
  const logs = params.logs ?? []
  const paths = resolveDocmanPgBootstrapPaths(params.domainRoot)
  if (!paths.migrationsDirExists) {
    throw new Error(`docman_pg_bootstrap_migrations_dir_missing:${paths.migrationsDir}`)
  }

  const entries = readMigrationJournal(paths)
  logs.push('Applying Docman PostgreSQL schema via owned SQL migration runner...')

  await withPgClient(params.repoUrl, async (client) => {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await ensureMigrationTable(client)
    await assertSchemaMatchesAppliedMigrations(client, entries)

    let appliedTags = await readAppliedTags(client)
    const missingEntries = entries.filter((entry) => !appliedTags.has(entry.tag))

    const adopted = await adoptExistingCurrentSchema(client, missingEntries, logs)
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

  logs.push('Docman PostgreSQL schema is ready.')
  return paths
}
