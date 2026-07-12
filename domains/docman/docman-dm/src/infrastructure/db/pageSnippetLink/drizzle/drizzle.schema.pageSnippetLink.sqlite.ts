import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const pageSnippetLinkTableSqlite = sqliteTable(
  domainTableName('page-snippet-links'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    pageVersionId: text().notNull(),
    snippetId: text().notNull(),
    position: integer().notNull(),
    caption: text(),
    showLineNumbers: integer({ mode: 'boolean' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('page_snippet_pos_unique').on(t.tenantId, t.pageVersionId, t.position),
    index('page_snippet_idx_page_version').on(t.tenantId, t.pageVersionId),
    index('page_snippet_idx_snippet').on(t.tenantId, t.snippetId),
  ],
)

export type IdbPageSnippetLinkDrizzleSqlite = InferSelectModel<typeof pageSnippetLinkTableSqlite>
export type PageSnippetLinkColumnsDrizzleSqlite = keyof IdbPageSnippetLinkDrizzleSqlite
