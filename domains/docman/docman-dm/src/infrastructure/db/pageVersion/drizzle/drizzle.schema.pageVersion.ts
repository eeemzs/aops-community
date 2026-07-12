import { domainTableName } from '../../domain-naming.js'
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const pageVersionTable = pgTable(
  domainTableName('page-versions'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    pageId: uuid().notNull(),
    version: integer().notNull(),
    title: text(),
    format: text().notNull(),
    content: text(),
    contentMl: jsonb().$type<Record<string, string>>(),
    contentData: jsonb().$type<Record<string, unknown>>(),
    directives: jsonb().$type<Record<string, unknown>>(),
    status: text().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('page_version_unique').on(t.tenantId, t.pageId, t.version),
    index('page_version_idx_page').on(t.tenantId, t.pageId),
    index('page_version_idx_status').on(t.tenantId, t.status),
  ]
)

export type IdbPageVersionDrizzle = InferSelectModel<typeof pageVersionTable>;
export type PageVersionColumnsDrizzle = keyof IdbPageVersionDrizzle;
