import { domainTableName } from '../../domain-naming.js'
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const sectionPageLinkTable = pgTable(
  domainTableName('section-page-links'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    sectionId: uuid().notNull(),
    pageVersionId: uuid().notNull(),
    position: integer().notNull(),
    numbering: text(),
    titleOverride: text(),
    titleVisible: boolean().notNull().default(true),
    pageBreakBefore: boolean().notNull().default(false),
    pageBreakAfter: boolean().notNull().default(false),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('section_page_pos_unique').on(t.tenantId, t.sectionId, t.position),
    index('section_page_idx_section').on(t.tenantId, t.sectionId),
    index('section_page_idx_page_version').on(t.tenantId, t.pageVersionId),
  ]
)

export type IdbSectionPageLinkDrizzle = InferSelectModel<typeof sectionPageLinkTable>;
export type SectionPageLinkColumnsDrizzle = keyof IdbSectionPageLinkDrizzle;
