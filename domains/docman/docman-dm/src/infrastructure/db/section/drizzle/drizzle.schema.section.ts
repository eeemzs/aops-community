import { domainTableName } from '../../domain-naming.js'
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const sectionTable = pgTable(
  domainTableName('sections'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    sectionUid: text().notNull(),
    title: text().notNull(),
    titleMl: jsonb().$type<Record<string, string>>(),
    kind: text(),
    slug: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('section_uid_unique').on(t.tenantId, t.scopeId, t.sectionUid),
    index('section_idx_tenant').on(t.tenantId),
    index('section_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbSectionDrizzle = InferSelectModel<typeof sectionTable>;
export type SectionColumnsDrizzle = keyof IdbSectionDrizzle;
