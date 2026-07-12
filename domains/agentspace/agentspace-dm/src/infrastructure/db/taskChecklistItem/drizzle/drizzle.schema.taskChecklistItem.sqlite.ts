import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { projectTableSqlite as projectTable } from '../../project/drizzle/drizzle.schema.project.sqlite.js'
import { taskTableSqlite as taskTable } from '../../task/drizzle/drizzle.schema.task.sqlite.js'

export const taskChecklistItemTableSqlite = sqliteTable(
  'task-checklist-items',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    taskId: text()
      .notNull()
      .references(() => taskTable.id, { onDelete: 'cascade' }),
    content: text().notNull(),
    isDone: integer({ mode: 'boolean' }).notNull().default(false),
    position: integer().notNull().default(0),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('task_checklist_item_idx_tenant').on(t.tenantId),
    index('task_checklist_item_idx_scope').on(t.tenantId, t.scopeId),
    index('task_checklist_item_idx_task').on(t.tenantId, t.taskId),
  ]
)

export type IdbTaskChecklistItemDrizzleSqlite = InferSelectModel<typeof taskChecklistItemTableSqlite>
export type TaskChecklistItemColumnsDrizzleSqlite = keyof IdbTaskChecklistItemDrizzleSqlite
