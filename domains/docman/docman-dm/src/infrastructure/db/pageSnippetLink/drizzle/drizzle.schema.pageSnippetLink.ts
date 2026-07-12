import { domainTableName } from '../../domain-naming.js'
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const pageSnippetLinkTable = pgTable(
  domainTableName('page-snippet-links'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    pageVersionId: uuid().notNull(),
    snippetId: uuid().notNull(),
    position: integer().notNull(),
    caption: text(),
    showLineNumbers: boolean(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('page_snippet_pos_unique').on(t.tenantId, t.pageVersionId, t.position),
    index('page_snippet_idx_page_version').on(t.tenantId, t.pageVersionId),
    index('page_snippet_idx_snippet').on(t.tenantId, t.snippetId),
  ]
)

export type IdbPageSnippetLinkDrizzle = InferSelectModel<typeof pageSnippetLinkTable>;
export type PageSnippetLinkColumnsDrizzle = keyof IdbPageSnippetLinkDrizzle;

