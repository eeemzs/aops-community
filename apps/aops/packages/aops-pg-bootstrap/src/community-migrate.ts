import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from 'pg'

import {
  AOPS_COMMUNITY_PG_BOOTSTRAP_MANIFEST_V1,
  runAopsPgBootstrapManifest,
  type AopsPgBootstrapAdapter,
  type AopsPgBootstrapExecution,
} from './manifest.js'

const STATEMENT_BREAKPOINT = '--> statement-breakpoint'
const MIGRATION_TABLE = 'aops_community_schema_migrations'
const SCHEMA_LOCK_CLASS_ID = 28015
const SCHEMA_LOCK_OBJECT_ID = 41

type MigrationJournalEntry = Readonly<{
  idx: number
  tag: string
}>

function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

function migrationHash(sql: string): string {
  return createHash('sha256').update(sql).digest('hex')
}

function readMigrationJournal(migrationsDir: string): MigrationJournalEntry[] {
  const journalPath = path.join(migrationsDir, 'meta', '_journal.json')
  if (!existsSync(journalPath)) {
    throw new Error(`aops_community_pg_bootstrap_journal_missing:${journalPath}`)
  }
  const payload = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries?: unknown[] }
  if (!Array.isArray(payload.entries) || payload.entries.length === 0) {
    throw new Error(`aops_community_pg_bootstrap_journal_empty:${journalPath}`)
  }
  const entries = payload.entries.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`aops_community_pg_bootstrap_journal_entry_invalid:${index}`)
    }
    const candidate = entry as { idx?: unknown; tag?: unknown }
    if (!Number.isSafeInteger(candidate.idx) || Number(candidate.idx) < 0) {
      throw new Error(`aops_community_pg_bootstrap_journal_idx_invalid:${String(candidate.idx)}`)
    }
    if (typeof candidate.tag !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(candidate.tag)) {
      throw new Error(`aops_community_pg_bootstrap_journal_tag_invalid:${String(candidate.tag)}`)
    }
    return { idx: Number(candidate.idx), tag: candidate.tag }
  }).sort((left, right) => left.idx - right.idx)

  const indexes = new Set<number>()
  const tags = new Set<string>()
  for (const [position, entry] of entries.entries()) {
    if (indexes.has(entry.idx)) {
      throw new Error(`aops_community_pg_bootstrap_journal_idx_duplicate:${String(entry.idx)}`)
    }
    if (entry.idx !== position) {
      throw new Error(
        `aops_community_pg_bootstrap_journal_idx_non_contiguous:expected=${String(position)}:actual=${String(entry.idx)}`,
      )
    }
    if (tags.has(entry.tag)) {
      throw new Error(`aops_community_pg_bootstrap_journal_tag_duplicate:${entry.tag}`)
    }
    indexes.add(entry.idx)
    tags.add(entry.tag)
    const sqlPath = path.join(migrationsDir, `${entry.tag}.sql`)
    if (!existsSync(sqlPath)) {
      throw new Error(`aops_community_pg_bootstrap_sql_missing:${sqlPath}`)
    }
  }
  const expectedSqlFiles = new Set(entries.map((entry) => `${entry.tag}.sql`))
  const orphanSqlFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql') && !expectedSqlFiles.has(file))
    .sort()
  if (orphanSqlFiles.length > 0) {
    throw new Error(`aops_community_pg_bootstrap_orphan_sql:${orphanSqlFiles.join(',')}`)
  }
  return entries
}

export function inspectCommunityAgentspaceMigrationBundle(migrationsDir: string): {
  migrationsDir: string
  entries: Array<{ idx: number; tag: string; sha256: string }>
} {
  const resolved = path.resolve(migrationsDir)
  const entries = readMigrationJournal(resolved).map((entry) => {
    const sql = readFileSync(path.join(resolved, `${entry.tag}.sql`), 'utf8')
    return { ...entry, sha256: migrationHash(sql) }
  })
  return { migrationsDir: resolved, entries }
}

function splitMigrationStatements(sql: string): string[] {
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean)
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
      sha256 text NOT NULL,
      applied_at timestamp with time zone NOT NULL DEFAULT now()
    )`,
  )
}

async function readAppliedMigrations(client: Client): Promise<Map<string, string>> {
  const result = await client.query<{ tag: string; sha256: string }>(
    `SELECT tag, sha256 FROM public.${MIGRATION_TABLE}`,
  )
  return new Map(result.rows.map((row) => [row.tag, row.sha256]))
}

async function applyMigration(
  client: Client,
  migrationsDir: string,
  entry: MigrationJournalEntry,
  logs: string[],
): Promise<void> {
  const sqlPath = path.join(migrationsDir, `${entry.tag}.sql`)
  const sql = readFileSync(sqlPath, 'utf8')
  const hash = migrationHash(sql)
  const statements = splitMigrationStatements(sql)
  if (statements.length === 0) {
    throw new Error(`aops_community_pg_bootstrap_sql_empty:${sqlPath}`)
  }

  logs.push(`Applying AOPS Community Agentspace PostgreSQL migration: ${entry.tag}`)
  await client.query('BEGIN')
  try {
    for (const statement of statements) {
      await client.query(statement)
    }
    await client.query(
      `INSERT INTO public.${MIGRATION_TABLE} (tag, sha256) VALUES ($1, $2)`,
      [entry.tag, hash],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

async function applyCommunityAgentspaceMigrations(params: {
  repoUrl: string
  migrationsDir: string
  logs: string[]
}): Promise<void> {
  const entries = readMigrationJournal(params.migrationsDir)
  await withPgClient(params.repoUrl, async (client) => {
    await client.query('SELECT pg_advisory_lock($1, $2)', [SCHEMA_LOCK_CLASS_ID, SCHEMA_LOCK_OBJECT_ID])
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
      await ensureMigrationTable(client)
      const applied = await readAppliedMigrations(client)
      const journalTags = new Set(entries.map((entry) => entry.tag))
      const unknownApplied = [...applied.keys()].filter((tag) => !journalTags.has(tag)).sort()
      if (unknownApplied.length > 0) {
        throw new Error(`aops_community_pg_bootstrap_unknown_applied_tags:${unknownApplied.join(',')}`)
      }
      for (const entry of entries) {
        const sql = readFileSync(path.join(params.migrationsDir, `${entry.tag}.sql`), 'utf8')
        const expectedHash = migrationHash(sql)
        const appliedHash = applied.get(entry.tag)
        if (appliedHash !== undefined) {
          if (appliedHash !== expectedHash) {
            throw new Error(
              `aops_community_pg_bootstrap_applied_hash_mismatch:${entry.tag}:expected=${expectedHash}:actual=${appliedHash}`,
            )
          }
          params.logs.push(`Skipping ${entry.tag}: already applied with matching hash.`)
          continue
        }
        await applyMigration(client, params.migrationsDir, entry, params.logs)
        applied.set(entry.tag, expectedHash)
      }
    } finally {
      await client
        .query('SELECT pg_advisory_unlock($1, $2)', [SCHEMA_LOCK_CLASS_ID, SCHEMA_LOCK_OBJECT_ID])
        .catch(() => undefined)
    }
  })
}

export function createCommunityAgentspacePgBootstrapAdapter(): AopsPgBootstrapAdapter {
  return {
    id: 'sql-migrations',
    async run(context) {
      if (context.operation !== 'migrate') {
        throw new Error(`aops_community_pg_bootstrap_operation_refused:${context.operation}`)
      }
      if (!context.repoUrl) {
        throw new Error('aops_community_pg_bootstrap_repo_url_required')
      }
      await applyCommunityAgentspaceMigrations({
        repoUrl: context.repoUrl,
        migrationsDir: context.resourcePath,
        logs: context.logs,
      })
    },
  }
}

export async function applyCommunityAopsPgSchema(params: {
  repoUrl: string
  packageRoot?: string
  workspaceRoot?: string
  logs?: string[]
}): Promise<AopsPgBootstrapExecution[]> {
  const resourceRoot = path.resolve(params.packageRoot ?? packageRoot())
  return runAopsPgBootstrapManifest({
    manifest: AOPS_COMMUNITY_PG_BOOTSTRAP_MANIFEST_V1,
    adapters: [createCommunityAgentspacePgBootstrapAdapter()],
    operation: 'migrate',
    targetIds: ['agentspace'],
    resourceRoot,
    workspaceRoot: params.workspaceRoot ?? resourceRoot,
    repoUrl: params.repoUrl,
    logs: params.logs,
  })
}
