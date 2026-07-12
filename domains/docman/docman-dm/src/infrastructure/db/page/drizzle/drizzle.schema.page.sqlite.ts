import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const pageTableSqlite = sqliteTable(
  domainTableName('pages'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    pageUid: text().notNull(),
    title: text().notNull(),
    titleMl: text({ mode: 'json' }).$type<Record<string, string>>(),
    kind: text(),
    meta: text({ mode: 'json' }).$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('page_uid_unique').on(t.tenantId, t.scopeId, t.pageUid),
    index('page_idx_tenant').on(t.tenantId),
    index('page_idx_scope').on(t.tenantId, t.scopeId),
  ],
)

export type IdbPageDrizzleSqlite = InferSelectModel<typeof pageTableSqlite>
export type PageColumnsDrizzleSqlite = keyof IdbPageDrizzleSqlite
