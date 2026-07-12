import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { projectTable } from '../../project/drizzle/drizzle.schema.project.js'
import { taskTable } from '../../task/drizzle/drizzle.schema.task.js'

export const taskCommentTable = pgTable(
  'task-comments',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    projectId: uuid()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    taskId: uuid()
      .notNull()
      .references(() => taskTable.id, { onDelete: 'cascade' }),
    author: text().notNull(),
    body: text().notNull(),
    meta: jsonb(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('task_comment_idx_tenant').on(t.tenantId),
    index('task_comment_idx_project').on(t.tenantId, t.projectId),
    index('task_comment_idx_task').on(t.tenantId, t.taskId),
  ]
)

export type IdbTaskCommentDrizzle = InferSelectModel<typeof taskCommentTable>;
export type TaskCommentColumnsDrizzle = keyof IdbTaskCommentDrizzle;
