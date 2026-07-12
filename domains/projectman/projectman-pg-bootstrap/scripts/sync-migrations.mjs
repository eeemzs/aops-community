#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.resolve(packageDir, '..', 'drizzle-out', 'projectman')
const targetDir = path.join(packageDir, 'drizzle-out', 'projectman')
const journalName = '_journal.json'
const sourceJournalPath = path.join(sourceDir, 'meta', journalName)
const tempDir = path.join(packageDir, 'drizzle-out', `.projectman-sync-${process.pid}`)
const tagPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

function fail(code, detail) {
  throw new Error(`${code}:${detail}`)
}

if (!fs.existsSync(sourceDir)) {
  fail('projectman_pg_bootstrap_source_migrations_missing', sourceDir)
}
if (!fs.existsSync(sourceJournalPath)) {
  fail('projectman_pg_bootstrap_source_journal_missing', sourceJournalPath)
}

const journal = JSON.parse(fs.readFileSync(sourceJournalPath, 'utf8'))
const entries = Array.isArray(journal.entries) ? journal.entries : []
const tags = entries.map((entry) => String(entry?.tag ?? '').trim())

if (tags.length === 0) {
  fail('projectman_pg_bootstrap_source_journal_empty', sourceJournalPath)
}
if (tags.some((tag) => !tagPattern.test(tag))) {
  fail('projectman_pg_bootstrap_source_journal_invalid_tag', tags.filter((tag) => !tagPattern.test(tag)).join(','))
}
if (new Set(tags).size !== tags.length) {
  fail('projectman_pg_bootstrap_source_journal_duplicate_tag', sourceJournalPath)
}

const sourceSqlTags = fs
  .readdirSync(sourceDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
  .map((entry) => entry.name.slice(0, -'.sql'.length))
  .sort()
const journalTags = [...tags].sort()

if (
  sourceSqlTags.length !== journalTags.length ||
  sourceSqlTags.some((tag, index) => tag !== journalTags[index])
) {
  fail(
    'projectman_pg_bootstrap_source_journal_sql_mismatch',
    `journal=${journalTags.join(',')};sql=${sourceSqlTags.join(',')}`,
  )
}

fs.rmSync(tempDir, { recursive: true, force: true })
try {
  fs.mkdirSync(path.join(tempDir, 'meta'), { recursive: true })
  fs.copyFileSync(sourceJournalPath, path.join(tempDir, 'meta', journalName))
  for (const tag of tags) {
    fs.copyFileSync(path.join(sourceDir, `${tag}.sql`), path.join(tempDir, `${tag}.sql`))
  }

  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.renameSync(tempDir, targetDir)
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}
