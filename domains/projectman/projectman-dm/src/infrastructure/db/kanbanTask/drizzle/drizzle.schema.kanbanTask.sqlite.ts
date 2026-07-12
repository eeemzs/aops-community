import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
export const kanbanTaskTableSqlite = sqliteTable(
  domainTableName('kanban-tasks'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    boardId: text().notNull(),
    boardColumnId: text().notNull(),
    sprintId: text(),
    title: text().notNull(),
    taskCode: text(),
    slug: text(),
    description: text(),
    progress: integer().notNull().default(0),
    position: integer().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('kanban_task_position_unique').on(t.tenantId, t.boardColumnId, t.position),
    index('kanban_task_idx_tenant').on(t.tenantId),
    index('kanban_task_idx_scope').on(t.tenantId, t.scopeId),
    index('kanban_task_idx_board').on(t.tenantId, t.boardId),
    index('kanban_task_idx_board_column').on(t.tenantId, t.boardColumnId),
    index('kanban_task_idx_sprint').on(t.tenantId, t.sprintId),
    uniqueIndex('kanban_task_scope_code_unique').on(t.tenantId, t.scopeId, t.taskCode),
    uniqueIndex('kanban_task_scope_slug_unique').on(t.tenantId, t.scopeId, t.slug),
  ]
)

export type IdbKanbanTaskDrizzleSqlite = InferSelectModel<typeof kanbanTaskTableSqlite>
export type KanbanTaskColumnsDrizzleSqlite = keyof IdbKanbanTaskDrizzleSqlite
