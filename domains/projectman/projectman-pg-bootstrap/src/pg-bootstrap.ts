import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from 'pg'

const STATEMENT_BREAKPOINT = '--> statement-breakpoint'
const MIGRATION_TABLE = 'projectman_schema_migrations'
const LEGACY_SPRINT_TASK_UNIQUE_INDEX = 'projectman_sprint_task_unique'
const TRACKED_TABLES = [
  'projectman_kanban_boards',
  'projectman_kanban_columns',
  'projectman_kanban_board_columns',
  'projectman_kanban_tasks',
  'projectman_kanban_templates',
  'projectman_events',
  'projectman_sprints',
  'projectman_sprint_phases',
  'projectman_sprint_microtasks',
  'projectman_issue_items',
  'projectman_feedback_items',
  'projectman_review_requests',
] as const
const LEGACY_TABLES = [
  'projectman_kanban_board_groups',
  'projectman_kanban_column_groups',
  'projectman_sprint_groups',
  'projectman_micro_task_items',
  'projectman_sprint_kanban_tasks',
  'projectman_histories',
  'projectman_history_items',
  'projectman_planning_lineages',
] as const
const RESET_TABLES = [...new Set([...TRACKED_TABLES, ...LEGACY_TABLES])]

type ProjectmanAdditiveSchemaRepair = {
  tableName: string
  columnName: string
  sql: string
}

const ADDITIVE_SCHEMA_REPAIRS: readonly ProjectmanAdditiveSchemaRepair[] = [
  {
    tableName: 'projectman_kanban_boards',
    columnName: 'archivedAt',
    sql: 'ALTER TABLE "projectman_kanban_boards" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp with time zone',
  },
  {
    tableName: 'projectman_sprints',
    columnName: 'archivedAt',
    sql: 'ALTER TABLE "projectman_sprints" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp with time zone',
  },
] as const

type ProjectmanMigrationJournalEntry = {
  idx: number
  tag: string
}

export type ProjectmanPgBootstrapPaths = {
  domainRoot: string
  migrationsDir: string
  migrationsDirExists: boolean
  journalPath: string
  journalExists: boolean
}

function resolveProjectmanDomainRoot(domainRoot?: string): string {
  if (domainRoot) {
    return path.resolve(domainRoot)
  }

  const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const workspaceDomainRoot = path.resolve(packageRoot, '..')

  for (const candidate of [packageRoot, workspaceDomainRoot]) {
    if (existsSync(path.join(candidate, 'drizzle-out', 'projectman'))) {
      return candidate
    }
  }

  return packageRoot
}

export function resolveProjectmanPgBootstrapPaths(domainRoot?: string): ProjectmanPgBootstrapPaths {
  const resolvedDomainRoot = resolveProjectmanDomainRoot(domainRoot)
  const migrationsDir = path.join(resolvedDomainRoot, 'drizzle-out', 'projectman')
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

function readMigrationJournal(paths: ProjectmanPgBootstrapPaths): ProjectmanMigrationJournalEntry[] {
  if (!paths.journalExists) {
    throw new Error(`projectman_pg_bootstrap_journal_missing:${paths.journalPath}`)
  }

  const payload = JSON.parse(readFileSync(paths.journalPath, 'utf8')) as { entries?: ProjectmanMigrationJournalEntry[] }
  const entries = Array.isArray(payload.entries) ? payload.entries : []
  return entries
    .map((entry) => ({
      idx: Number(entry.idx ?? 0),
      tag: String(entry.tag ?? '').trim(),
    }))
    .filter((entry) => entry.tag.length > 0)
    .sort((left, right) => left.idx - right.idx)
}

function resolveMigrationSqlPath(paths: ProjectmanPgBootstrapPaths, tag: string): string {
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

async function queryExistingTables(client: Client, tableNames: readonly string[] = TRACKED_TABLES): Promise<Set<string>> {
  const result = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])`,
    [tableNames],
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

async function hasIndex(client: Client, indexName: string): Promise<boolean> {
  const result = await client.query<{ indexname: string }>(
    `SELECT indexname
       FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = $1`,
    [indexName],
  )
  return result.rows.length > 0
}

async function dropLegacySprintTaskUniqueIndex(client: Client, logs: string[]): Promise<void> {
  if (!(await hasIndex(client, LEGACY_SPRINT_TASK_UNIQUE_INDEX))) return
  logs.push(`Dropping legacy Projectman PostgreSQL index: ${LEGACY_SPRINT_TASK_UNIQUE_INDEX}`)
  await client.query(`DROP INDEX IF EXISTS public."${LEGACY_SPRINT_TASK_UNIQUE_INDEX}"`)
}

async function applyAdditiveSchemaRepairs(client: Client, logs: string[]): Promise<void> {
  const existingTables = await queryExistingTables(client, RESET_TABLES)
  const pending: ProjectmanAdditiveSchemaRepair[] = []

  for (const repair of ADDITIVE_SCHEMA_REPAIRS) {
    if (!existingTables.has(repair.tableName)) continue
    const exists = await hasColumn(client, repair.tableName, repair.columnName)
    if (!exists) pending.push(repair)
  }

  if (pending.length === 0) return

  logs.push(
    `Applying ${String(pending.length)} additive Projectman schema repair(s): ${pending
      .map((repair) => `${repair.tableName}.${repair.columnName}`)
      .join(', ')}`,
  )
  await client.query('BEGIN')
  try {
    for (const repair of pending) {
      await client.query(repair.sql)
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function schemaLooksCurrent(client: Client): Promise<boolean> {
  const existingTables = await queryExistingTables(client, RESET_TABLES)
  if (LEGACY_TABLES.some((tableName) => existingTables.has(tableName))) {
    return false
  }
  if (!TRACKED_TABLES.every((tableName) => existingTables.has(tableName))) {
    return false
  }

  const checks: Array<() => Promise<boolean>> = [
    () => hasColumn(client, 'projectman_kanban_boards', 'slug'),
    () => hasColumn(client, 'projectman_kanban_boards', 'scopeId', 'uuid'),
    async () => !(await hasColumn(client, 'projectman_kanban_boards', 'projectId')),
    () => hasColumn(client, 'projectman_kanban_columns', 'slug'),
    () => hasColumn(client, 'projectman_kanban_board_columns', 'boardId'),
    async () => !(await hasColumn(client, 'projectman_kanban_board_columns', 'boardGroupId')),
    () => hasColumn(client, 'projectman_kanban_tasks', 'taskCode'),
    () => hasColumn(client, 'projectman_kanban_tasks', 'slug'),
    () => hasColumn(client, 'projectman_kanban_tasks', 'scopeId', 'uuid'),
    () => hasColumn(client, 'projectman_kanban_tasks', 'boardId'),
    async () => !(await hasColumn(client, 'projectman_kanban_tasks', 'boardGroupId')),
    async () => !(await hasColumn(client, 'projectman_kanban_tasks', 'projectId')),
    () => hasColumn(client, 'projectman_kanban_templates', 'definition', 'jsonb'),
    () => hasColumn(client, 'projectman_events', 'payload', 'jsonb'),
    () => hasColumn(client, 'projectman_sprints', 'kanbanTaskId'),
    () => hasColumn(client, 'projectman_sprints', 'scopeId', 'uuid'),
    () => hasColumn(client, 'projectman_sprints', 'references', 'jsonb'),
    () => hasColumn(client, 'projectman_sprints', 'scope', 'jsonb'),
    () => hasColumn(client, 'projectman_sprints', 'validationPlan', 'jsonb'),
    () => hasColumn(client, 'projectman_sprint_phases', 'sprintId'),
    () => hasColumn(client, 'projectman_sprint_microtasks', 'phaseId'),
    () => hasColumn(client, 'projectman_sprint_microtasks', 'status'),
    () => hasColumn(client, 'projectman_sprint_microtasks', 'notes'),
    async () => !(await hasColumn(client, 'projectman_sprints', 'status')),
    async () => !(await hasColumn(client, 'projectman_sprints', 'startAt')),
    async () => !(await hasColumn(client, 'projectman_sprints', 'endAt')),
    async () => !(await hasColumn(client, 'projectman_sprint_microtasks', 'sprintId')),
    async () => !(await hasColumn(client, 'projectman_sprint_microtasks', 'sprintGroupId')),
    () => hasColumn(client, 'projectman_issue_items', 'scopeId', 'uuid'),
    () => hasColumn(client, 'projectman_issue_items', 'reviewRequestId', 'uuid'),
    async () => !(await hasColumn(client, 'projectman_issue_items', 'projectId')),
    () => hasColumn(client, 'projectman_issue_items', 'resolvedAt'),
    () => hasColumn(client, 'projectman_feedback_items', 'scopeId', 'uuid'),
    async () => !(await hasColumn(client, 'projectman_feedback_items', 'projectId')),
    () => hasColumn(client, 'projectman_feedback_items', 'handledAt'),
    () => hasColumn(client, 'projectman_review_requests', 'scopeId', 'uuid'),
    () => hasColumn(client, 'projectman_review_requests', 'results', 'jsonb'),
    () => hasColumn(client, 'projectman_review_requests', 'parentReviewRequestId', 'uuid'),
    () => hasColumn(client, 'projectman_review_requests', 'idempotencyKey', 'text'),
  ]

  for (const check of checks) {
    if (!(await check())) return false
  }
  return true
}

async function resetProjectmanSchema(client: Client, logs: string[]): Promise<void> {
  logs.push('Resetting Projectman PostgreSQL schema to Sprint V2 baseline.')
  await client.query('BEGIN')
  try {
    await client.query(`DROP TABLE IF EXISTS public.${MIGRATION_TABLE} CASCADE`)
    for (const tableName of [...RESET_TABLES].reverse()) {
      await client.query(`DROP TABLE IF EXISTS public."${tableName}" CASCADE`)
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function adoptExistingCurrentSchema(
  client: Client,
  missingEntries: ProjectmanMigrationJournalEntry[],
  logs: string[],
): Promise<boolean> {
  if (missingEntries.length === 0) return true

  const looksCurrent = await schemaLooksCurrent(client)
  if (!looksCurrent) return false

  logs.push('Existing projectman PostgreSQL schema detected without complete migration journal. Adopting current schema state.')
  for (const entry of missingEntries) {
    await client.query(`INSERT INTO public.${MIGRATION_TABLE} (tag) VALUES ($1) ON CONFLICT (tag) DO NOTHING`, [entry.tag])
  }
  logs.push(`Adopted ${String(missingEntries.length)} migration tag(s) without reapplying SQL.`)
  return true
}

async function applyMigrationEntry(
  client: Client,
  paths: ProjectmanPgBootstrapPaths,
  entry: ProjectmanMigrationJournalEntry,
  logs: string[],
): Promise<void> {
  const sqlPath = resolveMigrationSqlPath(paths, entry.tag)
  if (!existsSync(sqlPath)) {
    throw new Error(`projectman_pg_bootstrap_sql_missing:${sqlPath}`)
  }

  const sql = readFileSync(sqlPath, 'utf8')
  const statements = splitMigrationStatements(sql)
  if (statements.length === 0) {
    logs.push(`Skipping ${entry.tag}: migration file contains no executable statements.`)
    await client.query(`INSERT INTO public.${MIGRATION_TABLE} (tag) VALUES ($1) ON CONFLICT (tag) DO NOTHING`, [entry.tag])
    return
  }

  logs.push(`Applying Projectman PostgreSQL migration: ${entry.tag}`)
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

export async function applyProjectmanPgSchema(params: {
  repoUrl: string
  domainRoot?: string
  logs?: string[]
}): Promise<ProjectmanPgBootstrapPaths> {
  const logs = params.logs ?? []
  const paths = resolveProjectmanPgBootstrapPaths(params.domainRoot)
  if (!paths.migrationsDirExists) {
    throw new Error(`projectman_pg_bootstrap_migrations_dir_missing:${paths.migrationsDir}`)
  }

  const entries = readMigrationJournal(paths)
  logs.push('Applying Projectman PostgreSQL schema via owned SQL migration runner...')

  await withPgClient(params.repoUrl, async (client) => {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await ensureMigrationTable(client)

    const existingTables = await queryExistingTables(client, RESET_TABLES)
    if (existingTables.size > 0) {
      const looksCurrent = await schemaLooksCurrent(client)
      if (!looksCurrent) {
        await resetProjectmanSchema(client, logs)
        await ensureMigrationTable(client)
      }
    }

    let appliedTags = await readAppliedTags(client)
    const missingEntries = entries.filter((entry) => !appliedTags.has(entry.tag))
    const hasLegacySprintTaskUniqueIndex = await hasIndex(client, LEGACY_SPRINT_TASK_UNIQUE_INDEX)
    const entriesToAdopt = hasLegacySprintTaskUniqueIndex
      ? missingEntries.filter((entry) => entry.tag !== '0005_allow_multi_sprint_per_task')
      : missingEntries

    const adopted = await adoptExistingCurrentSchema(client, entriesToAdopt, logs)
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
    await dropLegacySprintTaskUniqueIndex(client, logs)
    await applyAdditiveSchemaRepairs(client, logs)
  })

  logs.push('Projectman PostgreSQL schema is ready.')
  return paths
}
