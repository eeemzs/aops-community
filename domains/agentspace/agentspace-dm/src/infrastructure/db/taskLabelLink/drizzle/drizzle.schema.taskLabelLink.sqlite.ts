import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { projectTableSqlite as projectTable } from '../../project/drizzle/drizzle.schema.project.sqlite.js'
import { taskLabelTableSqlite } from '../../taskLabel/drizzle/drizzle.schema.taskLabel.sqlite.js'
import { taskTableSqlite as taskTable } from '../../task/drizzle/drizzle.schema.task.sqlite.js'

export const taskLabelLinkTableSqlite = sqliteTable(
  'task-label-links',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    taskId: text()
      .notNull()
      .references(() => taskTable.id, { onDelete: 'cascade' }),
    labelId: text()
      .notNull()
      .references(() => taskLabelTableSqlite.id, { onDelete: 'cascade' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('task_label_link_unique').on(t.tenantId, t.taskId, t.labelId),
    index('task_label_link_idx_tenant').on(t.tenantId),
    index('task_label_link_idx_scope').on(t.tenantId, t.scopeId),
    index('task_label_link_idx_task').on(t.tenantId, t.taskId),
    index('task_label_link_idx_label').on(t.tenantId, t.labelId),
  ]
)

export type IdbTaskLabelLinkDrizzleSqlite = InferSelectModel<typeof taskLabelLinkTableSqlite>
export type TaskLabelLinkColumnsDrizzleSqlite = keyof IdbTaskLabelLinkDrizzleSqlite
