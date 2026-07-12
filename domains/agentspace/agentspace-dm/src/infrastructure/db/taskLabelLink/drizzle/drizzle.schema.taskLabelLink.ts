import { InferSelectModel } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { projectTable } from '../../project/drizzle/drizzle.schema.project.js'
import { taskLabelTable } from '../../taskLabel/drizzle/drizzle.schema.taskLabel.js'
import { taskTable } from '../../task/drizzle/drizzle.schema.task.js'

export const taskLabelLinkTable = pgTable(
  'task-label-links',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    taskId: uuid()
      .notNull()
      .references(() => taskTable.id, { onDelete: 'cascade' }),
    labelId: uuid()
      .notNull()
      .references(() => taskLabelTable.id, { onDelete: 'cascade' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('task_label_link_unique').on(t.tenantId, t.taskId, t.labelId),
    index('task_label_link_idx_tenant').on(t.tenantId),
    index('task_label_link_idx_scope').on(t.tenantId, t.scopeId),
    index('task_label_link_idx_task').on(t.tenantId, t.taskId),
    index('task_label_link_idx_label').on(t.tenantId, t.labelId),
  ]
)

export type IdbTaskLabelLinkDrizzle = InferSelectModel<typeof taskLabelLinkTable>
export type TaskLabelLinkColumnsDrizzle = keyof IdbTaskLabelLinkDrizzle
