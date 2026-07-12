import { InferSelectModel } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { projectTable } from '../../project/drizzle/drizzle.schema.project.js'
import { taskTable } from '../../task/drizzle/drizzle.schema.task.js'

export const taskChecklistItemTable = pgTable(
  'task-checklist-items',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    taskId: uuid()
      .notNull()
      .references(() => taskTable.id, { onDelete: 'cascade' }),
    content: text().notNull(),
    isDone: boolean().notNull().default(false),
    position: integer().notNull().default(0),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('task_checklist_item_idx_tenant').on(t.tenantId),
    index('task_checklist_item_idx_scope').on(t.tenantId, t.scopeId),
    index('task_checklist_item_idx_task').on(t.tenantId, t.taskId),
  ]
)

export type IdbTaskChecklistItemDrizzle = InferSelectModel<typeof taskChecklistItemTable>
export type TaskChecklistItemColumnsDrizzle = keyof IdbTaskChecklistItemDrizzle
