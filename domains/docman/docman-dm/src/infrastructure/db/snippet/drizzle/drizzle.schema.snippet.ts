import { domainTableName } from '../../domain-naming.js'
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const snippetTable = pgTable(
  domainTableName('snippets'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    snippetUid: text().notNull(),
    title: text(),
    language: text().notNull(),
    code: text().notNull(),
    description: text(),
    meta: jsonb().$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('snippet_uid_unique').on(t.tenantId, t.scopeId, t.snippetUid),
    index('snippet_idx_tenant').on(t.tenantId),
    index('snippet_idx_scope').on(t.tenantId, t.scopeId),
    index('snippet_idx_scope_language').on(t.tenantId, t.scopeId, t.language),
  ]
)

export type IdbSnippetDrizzle = InferSelectModel<typeof snippetTable>;
export type SnippetColumnsDrizzle = keyof IdbSnippetDrizzle;
