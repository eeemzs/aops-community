import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { kanbanBoardTable } from '../../kanbanBoard/drizzle/drizzle.schema.kanbanBoard.js'
import { projectTable } from '../../project/drizzle/drizzle.schema.project.js'

export const kanbanColumnTable = pgTable(
  'aops-kanban-columns',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    projectId: uuid()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    boardId: uuid()
      .notNull()
      .references(() => kanbanBoardTable.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    statusKey: text().notNull(),
    position: integer().notNull(),
    wipLimit: integer(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('agentspace_kanban_column_position_unique').on(t.tenantId, t.boardId, t.position),
    index('agentspace_kanban_column_idx_tenant').on(t.tenantId),
    index('agentspace_kanban_column_idx_board').on(t.tenantId, t.boardId),
    index('agentspace_kanban_column_idx_project').on(t.tenantId, t.projectId),
  ]
)

export type IdbKanbanColumnDrizzle = InferSelectModel<typeof kanbanColumnTable>;
export type KanbanColumnColumnsDrizzle = keyof IdbKanbanColumnDrizzle;
