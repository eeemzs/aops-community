import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
export const sprintItemTableSqlite = sqliteTable(
  'sprint-items',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    projectId: text().notNull(),
    sprintId: text().notNull(),
    title: text().notNull(),
    status: text().notNull(),
    position: integer().notNull(),
    openedAt: integer({ mode: 'timestamp_ms' }),
    closedAt: integer({ mode: 'timestamp_ms' }),
    refType: text(),
    refId: text(),
    notes: text(),
    meta: text({ mode: 'json' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('sprint_item_position_unique').on(t.tenantId, t.sprintId, t.position),
    index('sprint_item_idx_tenant').on(t.tenantId),
    index('sprint_item_idx_project').on(t.tenantId, t.projectId),
    index('sprint_item_idx_sprint').on(t.tenantId, t.sprintId),
  ]
)

export type IdbSprintItemDrizzleSqlite = InferSelectModel<typeof sprintItemTableSqlite>;
export type SprintItemColumnsDrizzleSqlite = keyof IdbSprintItemDrizzleSqlite;
