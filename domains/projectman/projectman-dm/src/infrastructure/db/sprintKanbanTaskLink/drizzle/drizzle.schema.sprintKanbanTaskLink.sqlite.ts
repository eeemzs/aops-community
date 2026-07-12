import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
export const sprintKanbanTaskLinkTableSqlite = sqliteTable(
  domainTableName('projectman-sprint-kanban-tasks'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    projectId: text().notNull(),
    sprintId: text().notNull(),
    kanbanTaskId: text().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('projectman_sprint_kanban_task_unique').on(t.tenantId, t.sprintId, t.kanbanTaskId),
    index('projectman_sprint_kanban_task_idx_tenant').on(t.tenantId),
    index('projectman_sprint_kanban_task_idx_scope').on(t.tenantId, t.scopeId),
    index('projectman_sprint_kanban_task_idx_project').on(t.tenantId, t.projectId),
    index('projectman_sprint_kanban_task_idx_sprint').on(t.tenantId, t.sprintId),
    index('projectman_sprint_kanban_task_idx_task').on(t.tenantId, t.kanbanTaskId),
  ]
)

export type IdbSprintKanbanTaskLinkDrizzleSqlite = InferSelectModel<typeof sprintKanbanTaskLinkTableSqlite>
export type SprintKanbanTaskLinkColumnsDrizzleSqlite = keyof IdbSprintKanbanTaskLinkDrizzleSqlite
