import { InferSelectModel } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { projectTable } from '../../project/drizzle/drizzle.schema.project.js'

export const taskLabelTable = pgTable(
  'task-labels',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    color: text().notNull(),
    position: integer().notNull().default(0),
    meta: jsonb(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('task_label_scope_name_tenant_unique').on(t.tenantId, t.scopeId, t.name),
    index('task_label_idx_tenant').on(t.tenantId),
    index('task_label_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbTaskLabelDrizzle = InferSelectModel<typeof taskLabelTable>
export type TaskLabelColumnsDrizzle = keyof IdbTaskLabelDrizzle
