import { domainTableName } from '../../domain-naming.js'
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const pageTable = pgTable(
  domainTableName('pages'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    pageUid: text().notNull(),
    title: text().notNull(),
    titleMl: jsonb().$type<Record<string, string>>(),
    kind: text(),
    meta: jsonb().$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('page_uid_unique').on(t.tenantId, t.scopeId, t.pageUid),
    index('page_idx_tenant').on(t.tenantId),
    index('page_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbPageDrizzle = InferSelectModel<typeof pageTable>;
export type PageColumnsDrizzle = keyof IdbPageDrizzle;
