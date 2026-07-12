import { domainTableName } from '../../domain-naming.js'
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const pageEmbedLinkTable = pgTable(
  domainTableName('page-embed-links'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    pageVersionId: uuid().notNull(),
    embedId: uuid().notNull(),
    position: integer().notNull(),
    caption: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('page_embed_pos_unique').on(t.tenantId, t.pageVersionId, t.position),
    index('page_embed_idx_page_version').on(t.tenantId, t.pageVersionId),
    index('page_embed_idx_embed').on(t.tenantId, t.embedId),
  ]
)

export type IdbPageEmbedLinkDrizzle = InferSelectModel<typeof pageEmbedLinkTable>;
export type PageEmbedLinkColumnsDrizzle = keyof IdbPageEmbedLinkDrizzle;
