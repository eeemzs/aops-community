import { InferSelectModel } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { projectTable } from '../../project/drizzle/drizzle.schema.project.js'
import { taskTable } from '../../task/drizzle/drizzle.schema.task.js'

export const taskRelationTable = pgTable(
  'task-relations',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    fromTaskId: uuid()
      .notNull()
      .references(() => taskTable.id, { onDelete: 'cascade' }),
    toTaskId: uuid()
      .notNull()
      .references(() => taskTable.id, { onDelete: 'cascade' }),
    kind: text().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('task_relation_unique').on(t.tenantId, t.fromTaskId, t.toTaskId, t.kind),
    index('task_relation_idx_tenant').on(t.tenantId),
    index('task_relation_idx_scope').on(t.tenantId, t.scopeId),
    index('task_relation_idx_from').on(t.tenantId, t.fromTaskId),
    index('task_relation_idx_to').on(t.tenantId, t.toTaskId),
  ]
)

export type IdbTaskRelationDrizzle = InferSelectModel<typeof taskRelationTable>
export type TaskRelationColumnsDrizzle = keyof IdbTaskRelationDrizzle
