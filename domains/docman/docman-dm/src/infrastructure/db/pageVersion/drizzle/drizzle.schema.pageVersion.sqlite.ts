import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const pageVersionTableSqlite = sqliteTable(
  domainTableName('page-versions'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    pageId: text().notNull(),
    version: integer().notNull(),
    title: text(),
    format: text().notNull(),
    content: text(),
    contentMl: text({ mode: 'json' }).$type<Record<string, string>>(),
    contentData: text({ mode: 'json' }).$type<Record<string, unknown>>(),
    directives: text({ mode: 'json' }).$type<Record<string, unknown>>(),
    status: text().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('page_version_unique').on(t.tenantId, t.pageId, t.version),
    index('page_version_idx_page').on(t.tenantId, t.pageId),
    index('page_version_idx_status').on(t.tenantId, t.status),
  ],
)

export type IdbPageVersionDrizzleSqlite = InferSelectModel<typeof pageVersionTableSqlite>
export type PageVersionColumnsDrizzleSqlite = keyof IdbPageVersionDrizzleSqlite
