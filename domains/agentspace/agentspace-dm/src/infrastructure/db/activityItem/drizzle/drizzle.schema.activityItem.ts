import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const activityItemTable = pgTable(
  'activity-items',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    projectId: uuid(),
    sourceKind: text().notNull(),
    sourceId: text().notNull(),
    action: text().notNull(),
    status: text().notNull(),
    summary: text().notNull(),
    refs: jsonb().notNull().default([]),
    payload: jsonb(),
    meta: jsonb(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('activity_item_idx_scope_created').on(t.tenantId, t.scopeId, t.createdAt),
    index('activity_item_idx_project_created').on(t.tenantId, t.projectId, t.createdAt),
    index('activity_item_idx_source_kind_created').on(t.tenantId, t.sourceKind, t.createdAt),
  ]
)

export type IdbActivityItemDrizzle = InferSelectModel<typeof activityItemTable>
export type ActivityItemColumnsDrizzle = keyof IdbActivityItemDrizzle
