import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const documentTableSqlite = sqliteTable(
  domainTableName('documents'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    documentUid: text().notNull(),
    groupId: text(),
    groupUid: text(),
    slug: text(),
    title: text().notNull(),
    titleMl: text({ mode: 'json' }).$type<Record<string, string>>(),
    summary: text(),
    summaryMl: text({ mode: 'json' }).$type<Record<string, string>>(),
    description: text(),
    descriptionMl: text({ mode: 'json' }).$type<Record<string, string>>(),
    status: text().notNull(),
    visibility: text().notNull(),
    tags: text({ mode: 'json' }).$type<string[]>(),
    pageSize: text(),
    meta: text({ mode: 'json' }).$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('document_uid_unique').on(t.tenantId, t.scopeId, t.documentUid),
    index('document_idx_tenant').on(t.tenantId),
    index('document_idx_scope').on(t.tenantId, t.scopeId),
    index('document_idx_status').on(t.tenantId, t.status),
    index('document_idx_scope_slug').on(t.tenantId, t.scopeId, t.slug),
    index('document_idx_scope_group_id').on(t.tenantId, t.scopeId, t.groupId),
    index('document_idx_scope_group_uid').on(t.tenantId, t.scopeId, t.groupUid),
  ],
)

export type IdbDocumentDrizzleSqlite = InferSelectModel<typeof documentTableSqlite>
export type DocumentColumnsDrizzleSqlite = keyof IdbDocumentDrizzleSqlite
