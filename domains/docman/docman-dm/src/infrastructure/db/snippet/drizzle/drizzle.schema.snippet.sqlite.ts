import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const snippetTableSqlite = sqliteTable(
  domainTableName('snippets'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    snippetUid: text().notNull(),
    title: text(),
    language: text().notNull(),
    code: text().notNull(),
    description: text(),
    meta: text({ mode: 'json' }).$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('snippet_uid_unique').on(t.tenantId, t.scopeId, t.snippetUid),
    index('snippet_idx_tenant').on(t.tenantId),
    index('snippet_idx_scope').on(t.tenantId, t.scopeId),
    index('snippet_idx_scope_language').on(t.tenantId, t.scopeId, t.language),
  ],
)

export type IdbSnippetDrizzleSqlite = InferSelectModel<typeof snippetTableSqlite>
export type SnippetColumnsDrizzleSqlite = keyof IdbSnippetDrizzleSqlite
