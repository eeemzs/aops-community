import { domainTableName } from '../../domain-naming.js'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const documentSectionLinkTable = pgTable(
  domainTableName('document-section-links'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    documentVersionId: uuid().notNull(),
    kind: text().notNull(),
    sectionId: uuid(),
    pageVersionId: uuid(),
    parentLinkId: uuid(),
    position: integer().notNull(),
    depth: integer(),
    titleOverride: text(),
    titleVisible: boolean().notNull().default(true),
    numbering: text(),
    pageBreakBefore: boolean().notNull().default(false),
    pageBreakAfter: boolean().notNull().default(false),
    directives: jsonb().$type<Record<string, unknown>>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('doc_section_pos_unique').on(t.tenantId, t.documentVersionId, t.parentLinkId, t.position),
    index('doc_section_idx_doc_version').on(t.tenantId, t.documentVersionId),
    index('doc_section_idx_section').on(t.tenantId, t.sectionId),
    index('doc_section_idx_page_version').on(t.tenantId, t.pageVersionId),
    index('doc_section_idx_parent').on(t.tenantId, t.parentLinkId),
  ]
)

export type IdbDocumentSectionLinkDrizzle = InferSelectModel<typeof documentSectionLinkTable>;
export type DocumentSectionLinkColumnsDrizzle = keyof IdbDocumentSectionLinkDrizzle;
