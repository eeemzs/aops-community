import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable } from 'drizzle-orm/sqlite-core'
export const kanbanBoardTableSqlite = sqliteTable(
  'kanban-boards',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    projectId: text().notNull(),
    name: text().notNull(),
    description: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('agentspace_kanban_board_idx_tenant').on(t.tenantId),
    index('agentspace_kanban_board_idx_project').on(t.tenantId, t.projectId),
  ]
)

export type IdbKanbanBoardDrizzleSqlite = InferSelectModel<typeof kanbanBoardTableSqlite>;
export type KanbanBoardColumnsDrizzleSqlite = keyof IdbKanbanBoardDrizzleSqlite;
