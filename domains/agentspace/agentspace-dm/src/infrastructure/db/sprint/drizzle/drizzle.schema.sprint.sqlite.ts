import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable } from 'drizzle-orm/sqlite-core'
export const sprintTableSqlite = sqliteTable(
  'sprints',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    name: text().notNull(),
    goal: text(),
    status: text().notNull(),
    tags: text({ mode: 'json' }).$type<string[]>(),
    createdBy: text(),
    updatedBy: text(),
    startAt: integer({ mode: 'timestamp_ms' }),
    endAt: integer({ mode: 'timestamp_ms' }),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('sprint_idx_tenant').on(t.tenantId),
    index('sprint_idx_scope').on(t.tenantId, t.scopeId),
    index('sprint_idx_scope_status_start').on(t.tenantId, t.scopeId, t.status, t.startAt),
  ]
)

export type IdbSprintDrizzleSqlite = InferSelectModel<typeof sprintTableSqlite>;
export type SprintColumnsDrizzleSqlite = keyof IdbSprintDrizzleSqlite;
