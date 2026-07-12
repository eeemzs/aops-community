import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'
import { domainTableName } from '../../domain-naming.js'

export const sectionTableSqlite = sqliteTable(
  domainTableName('sections'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    sectionUid: text().notNull(),
    title: text().notNull(),
    titleMl: text({ mode: 'json' }).$type<Record<string, string>>(),
    kind: text(),
    slug: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('section_uid_unique').on(t.tenantId, t.scopeId, t.sectionUid),
    index('section_idx_tenant').on(t.tenantId),
    index('section_idx_scope').on(t.tenantId, t.scopeId),
  ],
)

export type IdbSectionDrizzleSqlite = InferSelectModel<typeof sectionTableSqlite>
export type SectionColumnsDrizzleSqlite = keyof IdbSectionDrizzleSqlite
