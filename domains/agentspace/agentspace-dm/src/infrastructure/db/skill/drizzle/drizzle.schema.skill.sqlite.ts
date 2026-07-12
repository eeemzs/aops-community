import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const skillTableSqlite = sqliteTable(
  'skills',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    name: text().notNull(),
    description: text(),
    shortDescription: text(),
    tags: text({ mode: 'json' }).$type<string[]>(),
    currentVersionId: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('skill_scope_name_tenant_unique').on(t.tenantId, t.scopeId, t.name),
    index('skill_idx_tenant').on(t.tenantId),
    index('skill_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbSkillDrizzleSqlite = InferSelectModel<typeof skillTableSqlite>;
export type SkillColumnsDrizzleSqlite = keyof IdbSkillDrizzleSqlite;
