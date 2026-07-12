import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const documentVersionTableSqlite = sqliteTable(
  domainTableName('document-versions'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    documentId: text().notNull(),
    version: integer().notNull(),
    label: text(),
    status: text().notNull(),
    title: text(),
    summary: text(),
    releaseNotes: text(),
    releaseNotesMl: text({ mode: 'json' }).$type<Record<string, string>>(),
    isCurrent: integer({ mode: 'boolean' }).notNull().default(false),
    basedOnVersionId: text(),
    publishedAt: integer({ mode: 'timestamp_ms' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('document_version_unique').on(t.tenantId, t.documentId, t.version),
    index('document_version_idx_doc').on(t.tenantId, t.documentId),
    index('document_version_idx_status').on(t.tenantId, t.status),
    index('document_version_idx_current').on(t.tenantId, t.documentId, t.isCurrent),
  ],
)

export type IdbDocumentVersionDrizzleSqlite = InferSelectModel<typeof documentVersionTableSqlite>
export type DocumentVersionColumnsDrizzleSqlite = keyof IdbDocumentVersionDrizzleSqlite
