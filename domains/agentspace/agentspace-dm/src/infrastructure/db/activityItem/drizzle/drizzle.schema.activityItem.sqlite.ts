import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable } from 'drizzle-orm/sqlite-core'

export const activityItemTableSqlite = sqliteTable(
  'activity-items',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    projectId: text(),
    sourceKind: text().notNull(),
    sourceId: text().notNull(),
    action: text().notNull(),
    status: text().notNull(),
    summary: text().notNull(),
    refs: text({ mode: 'json' }).notNull().$defaultFn(() => []),
    payload: text({ mode: 'json' }),
    meta: text({ mode: 'json' }),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('activity_item_idx_scope_created').on(t.tenantId, t.scopeId, t.createdAt),
    index('activity_item_idx_project_created').on(t.tenantId, t.projectId, t.createdAt),
    index('activity_item_idx_source_kind_created').on(t.tenantId, t.sourceKind, t.createdAt),
  ]
)

export type IdbActivityItemDrizzleSqlite = InferSelectModel<typeof activityItemTableSqlite>
export type ActivityItemColumnsDrizzleSqlite = keyof IdbActivityItemDrizzleSqlite
