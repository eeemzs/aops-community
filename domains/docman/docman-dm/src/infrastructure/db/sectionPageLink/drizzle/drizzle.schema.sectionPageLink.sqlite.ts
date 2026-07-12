import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const sectionPageLinkTableSqlite = sqliteTable(
  domainTableName('section-page-links'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    sectionId: text().notNull(),
    pageVersionId: text().notNull(),
    position: integer().notNull(),
    numbering: text(),
    titleOverride: text(),
    titleVisible: integer({ mode: 'boolean' }).notNull().default(true),
    pageBreakBefore: integer({ mode: 'boolean' }).notNull().default(false),
    pageBreakAfter: integer({ mode: 'boolean' }).notNull().default(false),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('section_page_pos_unique').on(t.tenantId, t.sectionId, t.position),
    index('section_page_idx_section').on(t.tenantId, t.sectionId),
    index('section_page_idx_page_version').on(t.tenantId, t.pageVersionId),
  ],
)

export type IdbSectionPageLinkDrizzleSqlite = InferSelectModel<typeof sectionPageLinkTableSqlite>
export type SectionPageLinkColumnsDrizzleSqlite = keyof IdbSectionPageLinkDrizzleSqlite
