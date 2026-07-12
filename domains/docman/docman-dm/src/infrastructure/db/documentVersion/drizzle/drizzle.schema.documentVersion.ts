import { domainTableName } from '../../domain-naming.js'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel, sql } from 'drizzle-orm'

export const documentVersionTable = pgTable(
  domainTableName('document-versions'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    documentId: uuid().notNull(),
    version: integer().notNull(),
    label: text(),
    status: text().notNull(),
    title: text(),
    summary: text(),
    releaseNotes: text(),
    releaseNotesMl: jsonb().$type<Record<string, string>>(),
    isCurrent: boolean().notNull().default(false),
    basedOnVersionId: uuid(),
    publishedAt: timestamp({ withTimezone: true }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('document_version_unique').on(t.tenantId, t.documentId, t.version),
    uniqueIndex('document_version_unique_current')
      .on(t.tenantId, t.documentId)
      .where(sql`${t.isCurrent} = true`),
    index('document_version_idx_doc').on(t.tenantId, t.documentId),
    index('document_version_idx_status').on(t.tenantId, t.status),
    index('document_version_idx_current').on(t.tenantId, t.documentId, t.isCurrent),
  ]
)

export type IdbDocumentVersionDrizzle = InferSelectModel<typeof documentVersionTable>;
export type DocumentVersionColumnsDrizzle = keyof IdbDocumentVersionDrizzle;
