import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const embedTableSqlite = sqliteTable(
  domainTableName('embeds'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    embedUid: text().notNull(),
    type: text().notNull(),
    title: text(),
    content: text(),
    url: text(),
    path: text(),
    mime: text(),
    meta: text({ mode: 'json' }).$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('embed_uid_unique').on(t.tenantId, t.scopeId, t.embedUid),
    index('embed_idx_tenant').on(t.tenantId),
    index('embed_idx_scope').on(t.tenantId, t.scopeId),
    index('embed_idx_scope_type').on(t.tenantId, t.scopeId, t.type),
  ],
)

export type IdbEmbedDrizzleSqlite = InferSelectModel<typeof embedTableSqlite>
export type EmbedColumnsDrizzleSqlite = keyof IdbEmbedDrizzleSqlite
