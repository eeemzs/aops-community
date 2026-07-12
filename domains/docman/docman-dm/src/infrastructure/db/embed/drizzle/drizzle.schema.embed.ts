import { domainTableName } from '../../domain-naming.js'
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const embedTable = pgTable(
  domainTableName('embeds'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    embedUid: text().notNull(),
    type: text().notNull(),
    title: text(),
    content: text(),
    url: text(),
    path: text(),
    mime: text(),
    meta: jsonb().$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('embed_uid_unique').on(t.tenantId, t.scopeId, t.embedUid),
    index('embed_idx_tenant').on(t.tenantId),
    index('embed_idx_scope').on(t.tenantId, t.scopeId),
    index('embed_idx_scope_type').on(t.tenantId, t.scopeId, t.type),
  ]
)

export type IdbEmbedDrizzle = InferSelectModel<typeof embedTable>;
export type EmbedColumnsDrizzle = keyof IdbEmbedDrizzle;
