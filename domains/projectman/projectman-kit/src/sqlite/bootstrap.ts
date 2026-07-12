import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('../..', import.meta.url))
const sqliteBootstrapSqlPath = resolve(packageRoot, 'resources', 'sqlite-bootstrap.sql')
const nodeRequire = createRequire(import.meta.url)

const CURRENT_PROJECTMAN_TABLES = [
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

const LEGACY_PROJECTMAN_TABLES = [
  'projectman_kanban_board_groups',
  'projectman_kanban_column_groups',
  'projectman_sprint_groups',
  'projectman_micro_task_items',
  'projectman_sprint_kanban_tasks',
  'projectman_histories',
  'projectman_history_items',
  'projectman_planning_lineages',
] as const

const RESET_TABLES = [...new Set([...CURRENT_PROJECTMAN_TABLES, ...LEGACY_PROJECTMAN_TABLES])]

function requireNodeSqlite(): typeof import('node:sqlite') {
  return nodeRequire('node:sqlite') as typeof import('node:sqlite')
}

export function isProjectmanSqliteRepoUrl(repoUrlRaw: string | undefined): boolean {
  const repoUrl = String(repoUrlRaw ?? '').trim().toLowerCase()
  if (!repoUrl) return false
  if (repoUrl === ':memory:') return true
  if (repoUrl.startsWith('sqlite:') || repoUrl.startsWith('file:')) return true
  return repoUrl.endsWith('.db') || repoUrl.endsWith('.sqlite') || repoUrl.endsWith('.sqlite3')
}

export function resolveProjectmanSqliteFilename(repoUrlRaw: string): string {
  const repoUrl = String(repoUrlRaw ?? '').trim()
  if (!repoUrl) {
    throw new Error('missing_sqlite_repo_url')
  }
  if (repoUrl === ':memory:') return ':memory:'

  const stripScheme = (value: string, scheme: string): string =>
    value.startsWith(scheme) ? value.slice(scheme.length).replace(/^\/\//, '') : value

  const noSqliteScheme = stripScheme(repoUrl, 'sqlite:')
  const noFileScheme = stripScheme(noSqliteScheme, 'file:')
  return noFileScheme || repoUrl
}

function listProjectmanTables(db: import('node:sqlite').DatabaseSync): string[] {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'projectman_%'`)
    .all() as Array<{ name?: string }>
  return rows
    .map((row) => String(row?.name ?? '').trim())
    .filter(Boolean)
}

function hasColumn(db: import('node:sqlite').DatabaseSync, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name?: string }>
  return rows.some((row) => String(row?.name ?? '') === columnName)
}

function hasIndex(db: import('node:sqlite').DatabaseSync, indexName: string): boolean {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`)
    .all(indexName) as Array<{ name?: string }>
  return rows.some((row) => String(row?.name ?? '') === indexName)
}

function schemaLooksCurrent(db: import('node:sqlite').DatabaseSync): boolean {
  const existingTables = new Set(listProjectmanTables(db))
  if (LEGACY_PROJECTMAN_TABLES.some((tableName) => existingTables.has(tableName))) {
    return false
  }
  if (!CURRENT_PROJECTMAN_TABLES.every((tableName) => existingTables.has(tableName))) {
    return false
  }

  if (!hasColumn(db, 'projectman_sprints', 'kanbanTaskId')) return false
  if (!hasColumn(db, 'projectman_sprints', 'scopeId')) return false
  if (!hasColumn(db, 'projectman_sprints', 'references')) return false
  if (!hasColumn(db, 'projectman_sprints', 'scope')) return false
  if (!hasColumn(db, 'projectman_sprints', 'validationPlan')) return false
  if (hasColumn(db, 'projectman_sprints', 'projectId')) return false
  if (hasColumn(db, 'projectman_sprints', 'status')) return false
  if (hasColumn(db, 'projectman_sprints', 'startAt')) return false
  if (hasColumn(db, 'projectman_sprints', 'endAt')) return false
  if (!hasColumn(db, 'projectman_sprint_phases', 'sprintId')) return false
  if (!hasColumn(db, 'projectman_sprint_microtasks', 'phaseId')) return false
  if (hasColumn(db, 'projectman_sprint_microtasks', 'sprintId')) return false
  if (hasColumn(db, 'projectman_sprint_microtasks', 'sprintGroupId')) return false
  if (hasColumn(db, 'projectman_sprint_microtasks', 'kanbanTaskId')) return false
  if (!hasColumn(db, 'projectman_kanban_boards', 'scopeId')) return false
  if (hasColumn(db, 'projectman_kanban_boards', 'projectId')) return false
  if (!hasColumn(db, 'projectman_kanban_columns', 'slug')) return false
  if (!hasColumn(db, 'projectman_kanban_board_columns', 'boardId')) return false
  if (hasColumn(db, 'projectman_kanban_board_columns', 'boardGroupId')) return false
  if (!hasColumn(db, 'projectman_kanban_tasks', 'scopeId')) return false
  if (!hasColumn(db, 'projectman_kanban_tasks', 'boardId')) return false
  if (hasColumn(db, 'projectman_kanban_tasks', 'boardGroupId')) return false
  if (hasColumn(db, 'projectman_kanban_tasks', 'projectId')) return false
  if (!hasColumn(db, 'projectman_issue_items', 'scopeId')) return false
  if (!hasColumn(db, 'projectman_issue_items', 'reviewRequestId')) return false
  if (hasColumn(db, 'projectman_issue_items', 'projectId')) return false
  if (!hasColumn(db, 'projectman_feedback_items', 'scopeId')) return false
  if (hasColumn(db, 'projectman_feedback_items', 'projectId')) return false
  if (!hasColumn(db, 'projectman_review_requests', 'scopeId')) return false
  if (!hasColumn(db, 'projectman_review_requests', 'results')) return false
  if (!hasColumn(db, 'projectman_review_requests', 'parentReviewRequestId')) return false
  if (!hasColumn(db, 'projectman_kanban_templates', 'scopeId')) return false
  if (!hasColumn(db, 'projectman_events', 'scopeId')) return false
  if (hasColumn(db, 'projectman_events', 'projectId')) return false

  return true
}

function dropLegacySprintTaskUniqueIndex(filename: string): void {
  const { DatabaseSync } = requireNodeSqlite()
  const db = new DatabaseSync(filename)
  try {
    if (hasIndex(db, 'projectman_sprint_task_unique')) {
      db.exec('DROP INDEX IF EXISTS "projectman_sprint_task_unique"')
    }
  } finally {
    db.close()
  }
}

function resetProjectmanSchema(filename: string): void {
  const { DatabaseSync } = requireNodeSqlite()
  const db = new DatabaseSync(filename)
  try {
    db.exec('PRAGMA foreign_keys = OFF')
    db.exec('BEGIN')
    for (const tableName of RESET_TABLES) {
      db.exec(`DROP TABLE IF EXISTS "${tableName}"`)
    }
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {}
    throw error
  } finally {
    try {
      db.exec('PRAGMA foreign_keys = ON')
    } catch {}
    db.close()
  }
}

function applyBootstrapSql(filename: string): void {
  if (!existsSync(sqliteBootstrapSqlPath)) {
    throw new Error(`missing_sqlite_bootstrap_sql:${sqliteBootstrapSqlPath}`)
  }

  const { DatabaseSync } = requireNodeSqlite()
  const sql = readFileSync(sqliteBootstrapSqlPath, 'utf8')
  const db = new DatabaseSync(filename)
  try {
    db.exec(sql)
  } finally {
    db.close()
  }
}

export function ensureProjectmanSqliteSchemaReady(repoUrlRaw: string | undefined): void {
  const repoUrl = String(repoUrlRaw ?? '').trim()
  if (!repoUrl || !isProjectmanSqliteRepoUrl(repoUrl)) return

  const filename = resolveProjectmanSqliteFilename(repoUrl)
  if (filename === ':memory:') return

  mkdirSync(dirname(filename), { recursive: true })
  if (!existsSync(filename)) {
    const fd = openSync(filename, 'a')
    closeSync(fd)
  }

  const { DatabaseSync } = requireNodeSqlite()
  const db = new DatabaseSync(filename)
  let needsReset = false
  let needsBootstrap = false
  try {
    const existingTables = listProjectmanTables(db)
    needsBootstrap = existingTables.length === 0
    needsReset = existingTables.length > 0 && !schemaLooksCurrent(db)
  } finally {
    db.close()
  }

  try {
    if (needsReset) {
      resetProjectmanSchema(filename)
    }
    if (needsBootstrap || needsReset) {
      applyBootstrapSql(filename)
    }
    dropLegacySprintTaskUniqueIndex(filename)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`sqlite_schema_bootstrap_failed:${message}`)
  }
}
