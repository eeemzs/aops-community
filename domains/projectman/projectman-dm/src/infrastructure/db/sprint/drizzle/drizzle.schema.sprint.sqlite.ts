import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
export const sprintTableSqlite = sqliteTable(
  domainTableName('projectman-sprints'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    kanbanTaskId: text().notNull(),
    name: text().notNull(),
    goal: text().notNull(),
    references: text({ mode: 'json' }).$type<string[]>(),
    scope: text({ mode: 'json' }).$type<string[]>(),
    validationPlan: text({ mode: 'json' }).$type<string[]>(),
    notes: text(),
    archivedAt: integer({ mode: 'timestamp_ms' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  },
  (t) => [
    index('projectman_sprint_idx_tenant').on(t.tenantId),
    index('projectman_sprint_idx_scope').on(t.tenantId, t.scopeId),
    index('projectman_sprint_idx_kanban_task').on(t.tenantId, t.kanbanTaskId),
  ]
)

export type IdbSprintDrizzleSqlite = InferSelectModel<typeof sprintTableSqlite>
export type SprintColumnsDrizzleSqlite = keyof IdbSprintDrizzleSqlite
