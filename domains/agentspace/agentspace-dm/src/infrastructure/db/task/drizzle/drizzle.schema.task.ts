import { foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { promptVersionTable } from '../../promptVersion/drizzle/drizzle.schema.promptVersion.js'

export const taskTable = pgTable(
  'tasks',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    columnId: uuid().notNull(),
    sprintId: uuid(),
    promptVersionId: uuid().references(() => promptVersionTable.id, { onDelete: 'set null' }),
    parentTaskId: uuid(),
    type: text().notNull(),
    title: text().notNull(),
    description: text(),
    input: jsonb(),
    meta: jsonb(),
    assignee: text(),
    position: integer().notNull(),
    priority: integer(),
    dueAt: timestamp({ withTimezone: true }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('task_column_position_unique').on(t.tenantId, t.columnId, t.position),
    foreignKey({
      name: 'task_parent_task_fk',
      columns: [t.parentTaskId],
      foreignColumns: [t.id],
    }).onDelete('set null'),
    index('task_idx_tenant').on(t.tenantId),
    index('task_idx_scope').on(t.tenantId, t.scopeId),
    index('task_idx_column').on(t.tenantId, t.columnId),
    index('task_idx_sprint').on(t.tenantId, t.sprintId),
    index('task_idx_prompt_version').on(t.tenantId, t.promptVersionId),
    index('task_idx_parent').on(t.tenantId, t.parentTaskId),
  ]
)

export type IdbTaskDrizzle = InferSelectModel<typeof taskTable>;
export type TaskColumnsDrizzle = keyof IdbTaskDrizzle;
