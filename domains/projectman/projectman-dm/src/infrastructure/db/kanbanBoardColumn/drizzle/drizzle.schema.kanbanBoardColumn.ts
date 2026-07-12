import { domainTableName } from '../../domain-naming.js'
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const kanbanBoardColumnTable = pgTable(
  domainTableName('kanban-board-columns'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    boardId: uuid().notNull(),
    columnId: uuid().notNull(),
    position: integer().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
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

export type IdbKanbanBoardColumnDrizzle = InferSelectModel<typeof kanbanBoardColumnTable>;
export type KanbanBoardColumnColumnsDrizzle = keyof IdbKanbanBoardColumnDrizzle;
