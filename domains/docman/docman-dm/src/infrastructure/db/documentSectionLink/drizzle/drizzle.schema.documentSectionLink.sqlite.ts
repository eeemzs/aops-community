import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const documentSectionLinkTableSqlite = sqliteTable(
  domainTableName('document-section-links'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    documentVersionId: text().notNull(),
    kind: text().notNull(),
    sectionId: text(),
    pageVersionId: text(),
    parentLinkId: text(),
    position: integer().notNull(),
    depth: integer(),
    titleOverride: text(),
    titleVisible: integer({ mode: 'boolean' }).notNull().default(true),
    numbering: text(),
    pageBreakBefore: integer({ mode: 'boolean' }).notNull().default(false),
    pageBreakAfter: integer({ mode: 'boolean' }).notNull().default(false),
    directives: text({ mode: 'json' }).$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('doc_section_pos_unique').on(t.tenantId, t.documentVersionId, t.parentLinkId, t.position),
    index('doc_section_idx_doc_version').on(t.tenantId, t.documentVersionId),
    index('doc_section_idx_section').on(t.tenantId, t.sectionId),
    index('doc_section_idx_page_version').on(t.tenantId, t.pageVersionId),
    index('doc_section_idx_parent').on(t.tenantId, t.parentLinkId),
  ],
)

export type IdbDocumentSectionLinkDrizzleSqlite = InferSelectModel<typeof documentSectionLinkTableSqlite>
export type DocumentSectionLinkColumnsDrizzleSqlite = keyof IdbDocumentSectionLinkDrizzleSqlite
