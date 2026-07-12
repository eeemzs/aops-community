import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const pageEmbedLinkTableSqlite = sqliteTable(
  domainTableName('page-embed-links'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    pageVersionId: text().notNull(),
    embedId: text().notNull(),
    position: integer().notNull(),
    caption: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('page_embed_pos_unique').on(t.tenantId, t.pageVersionId, t.position),
    index('page_embed_idx_page_version').on(t.tenantId, t.pageVersionId),
    index('page_embed_idx_embed').on(t.tenantId, t.embedId),
  ],
)

export type IdbPageEmbedLinkDrizzleSqlite = InferSelectModel<typeof pageEmbedLinkTableSqlite>
export type PageEmbedLinkColumnsDrizzleSqlite = keyof IdbPageEmbedLinkDrizzleSqlite
