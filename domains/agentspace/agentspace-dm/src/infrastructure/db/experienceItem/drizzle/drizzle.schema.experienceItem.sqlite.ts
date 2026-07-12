import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable } from 'drizzle-orm/sqlite-core'

export const experienceItemTableSqlite = sqliteTable(
  'experience-items',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    type: text().notNull(),
    title: text().notNull(),
    problem: text(),
    solution: text(),
    content: text().notNull(),
    areas: text({ mode: 'json' }).$type<string[]>(),
    stack: text({ mode: 'json' }).$type<string[]>(),
    commands: text({ mode: 'json' }).$type<string[]>(),
    files: text({ mode: 'json' }).$type<string[]>(),
    sourceRefs: text({ mode: 'json' }).$type<unknown[]>(),
    tags: text({ mode: 'json' }).$type<string[]>(),
    confidence: text(),
    reusability: text(),
    meta: text({ mode: 'json' }),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('experience_item_idx_tenant').on(t.tenantId),
    index('experience_item_idx_scope').on(t.tenantId, t.scopeId),
    index('experience_item_idx_type').on(t.tenantId, t.type),
  ],
)

export type IdbExperienceItemDrizzleSqlite = InferSelectModel<typeof experienceItemTableSqlite>
export type ExperienceItemColumnsDrizzleSqlite = keyof IdbExperienceItemDrizzleSqlite
