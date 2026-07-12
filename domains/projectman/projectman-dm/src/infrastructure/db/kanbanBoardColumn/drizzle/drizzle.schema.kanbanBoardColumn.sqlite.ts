import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
export const kanbanBoardColumnTableSqlite = sqliteTable(
  domainTableName('kanban-board-columns'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    boardId: text().notNull(),
    columnId: text().notNull(),
    position: integer().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('kanban_board_column_unique').on(t.tenantId, t.boardId, t.columnId),
    uniqueIndex('kanban_board_column_position_unique').on(t.tenantId, t.boardId, t.position),
    index('kanban_board_column_idx_tenant').on(t.tenantId),
    index('kanban_board_column_idx_scope').on(t.tenantId, t.scopeId),
    index('kanban_board_column_idx_board').on(t.tenantId, t.boardId),
    index('kanban_board_column_idx_column').on(t.tenantId, t.columnId),
  ]
)

export type IdbKanbanBoardColumnDrizzleSqlite = InferSelectModel<typeof kanbanBoardColumnTableSqlite>
export type KanbanBoardColumnColumnsDrizzleSqlite = keyof IdbKanbanBoardColumnDrizzleSqlite
