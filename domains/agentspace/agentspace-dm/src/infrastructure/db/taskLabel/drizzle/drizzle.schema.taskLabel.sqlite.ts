import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { projectTableSqlite as projectTable } from '../../project/drizzle/drizzle.schema.project.sqlite.js'

export const taskLabelTableSqlite = sqliteTable(
  'task-labels',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    color: text().notNull(),
    position: integer().notNull().default(0),
    meta: text({ mode: 'json' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('task_label_scope_name_tenant_unique').on(t.tenantId, t.scopeId, t.name),
    index('task_label_idx_tenant').on(t.tenantId),
    index('task_label_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbTaskLabelDrizzleSqlite = InferSelectModel<typeof taskLabelTableSqlite>
export type TaskLabelColumnsDrizzleSqlite = keyof IdbTaskLabelDrizzleSqlite
