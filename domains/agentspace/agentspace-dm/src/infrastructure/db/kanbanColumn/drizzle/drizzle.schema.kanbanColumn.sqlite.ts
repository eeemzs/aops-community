import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { kanbanBoardTableSqlite as kanbanBoardTable } from '../../kanbanBoard/drizzle/drizzle.schema.kanbanBoard.sqlite.js'
import { projectTableSqlite as projectTable } from '../../project/drizzle/drizzle.schema.project.sqlite.js'

export const kanbanColumnTableSqlite = sqliteTable(
  'aops-kanban-columns',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    projectId: text()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    boardId: text()
      .notNull()
      .references(() => kanbanBoardTable.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    statusKey: text().notNull(),
    position: integer().notNull(),
    wipLimit: integer(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('agentspace_kanban_column_position_unique').on(t.tenantId, t.boardId, t.position),
    index('agentspace_kanban_column_idx_tenant').on(t.tenantId),
    index('agentspace_kanban_column_idx_board').on(t.tenantId, t.boardId),
    index('agentspace_kanban_column_idx_project').on(t.tenantId, t.projectId),
  ]
)

export type IdbKanbanColumnDrizzleSqlite = InferSelectModel<typeof kanbanColumnTableSqlite>;
export type KanbanColumnColumnsDrizzleSqlite = keyof IdbKanbanColumnDrizzleSqlite;
