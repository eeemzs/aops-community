import { domainTableName } from '../../domain-naming.js'
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const documentTable = pgTable(
  domainTableName('documents'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    documentUid: text().notNull(),
    groupId: uuid(),
    groupUid: text(),
    slug: text(),
    title: text().notNull(),
    titleMl: jsonb().$type<Record<string, string>>(),
    summary: text(),
    summaryMl: jsonb().$type<Record<string, string>>(),
    description: text(),
    descriptionMl: jsonb().$type<Record<string, string>>(),
    status: text().notNull(),
    visibility: text().notNull(),
    tags: jsonb().$type<string[]>(),
    pageSize: text(),
    meta: jsonb().$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('document_uid_unique').on(t.tenantId, t.scopeId, t.documentUid),
    index('document_idx_tenant').on(t.tenantId),
    index('document_idx_scope').on(t.tenantId, t.scopeId),
    index('document_idx_status').on(t.tenantId, t.status),
    index('document_idx_scope_slug').on(t.tenantId, t.scopeId, t.slug),
    index('document_idx_scope_group_id').on(t.tenantId, t.scopeId, t.groupId),
    index('document_idx_scope_group_uid').on(t.tenantId, t.scopeId, t.groupUid),
  ]
)

export type IdbDocumentDrizzle = InferSelectModel<typeof documentTable>;
export type DocumentColumnsDrizzle = keyof IdbDocumentDrizzle;
