import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const documentGroupTableSqlite = sqliteTable(
  domainTableName('document-groups'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    groupUid: text().notNull(),
    parentGroupId: text(),
    parentGroupUid: text(),
    title: text().notNull(),
    description: text(),
    meta: text({ mode: 'json' }).$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('document_group_uid_unique').on(t.tenantId, t.scopeId, t.groupUid),
    index('document_group_idx_tenant').on(t.tenantId),
    index('document_group_idx_scope').on(t.tenantId, t.scopeId),
    index('document_group_idx_parent').on(t.tenantId, t.parentGroupId),
  ],
)

export type IdbDocumentGroupDrizzleSqlite = InferSelectModel<typeof documentGroupTableSqlite>
export type DocumentGroupColumnsDrizzleSqlite = keyof IdbDocumentGroupDrizzleSqlite
