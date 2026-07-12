import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { projectTableSqlite as projectTable } from '../../project/drizzle/drizzle.schema.project.sqlite.js'
import { taskTableSqlite as taskTable } from '../../task/drizzle/drizzle.schema.task.sqlite.js'

export const taskRelationTableSqlite = sqliteTable(
  'task-relations',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    fromTaskId: text()
      .notNull()
      .references(() => taskTable.id, { onDelete: 'cascade' }),
    toTaskId: text()
      .notNull()
      .references(() => taskTable.id, { onDelete: 'cascade' }),
    kind: text().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('task_relation_unique').on(t.tenantId, t.fromTaskId, t.toTaskId, t.kind),
    index('task_relation_idx_tenant').on(t.tenantId),
    index('task_relation_idx_scope').on(t.tenantId, t.scopeId),
    index('task_relation_idx_from').on(t.tenantId, t.fromTaskId),
    index('task_relation_idx_to').on(t.tenantId, t.toTaskId),
  ]
)

export type IdbTaskRelationDrizzleSqlite = InferSelectModel<typeof taskRelationTableSqlite>
export type TaskRelationColumnsDrizzleSqlite = keyof IdbTaskRelationDrizzleSqlite
