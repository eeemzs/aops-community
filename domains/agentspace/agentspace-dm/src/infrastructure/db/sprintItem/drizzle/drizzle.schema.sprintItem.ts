import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const sprintItemTable = pgTable(
  'sprint-items',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    projectId: uuid().notNull(),
    sprintId: uuid().notNull(),
    title: text().notNull(),
    status: text().notNull(),
    position: integer().notNull(),
    openedAt: timestamp({ withTimezone: true }),
    closedAt: timestamp({ withTimezone: true }),
    refType: text(),
    refId: text(),
    notes: text(),
    meta: jsonb(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('sprint_item_position_unique').on(t.tenantId, t.sprintId, t.position),
    index('sprint_item_idx_tenant').on(t.tenantId),
    index('sprint_item_idx_project').on(t.tenantId, t.projectId),
    index('sprint_item_idx_sprint').on(t.tenantId, t.sprintId),
  ]
)

export type IdbSprintItemDrizzle = InferSelectModel<typeof sprintItemTable>;
export type SprintItemColumnsDrizzle = keyof IdbSprintItemDrizzle;
