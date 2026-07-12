import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const kanbanBoardTable = pgTable(
  'kanban-boards',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    projectId: uuid().notNull(),
    name: text().notNull(),
    description: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('agentspace_kanban_board_idx_tenant').on(t.tenantId),
    index('agentspace_kanban_board_idx_project').on(t.tenantId, t.projectId),
  ]
)

export type IdbKanbanBoardDrizzle = InferSelectModel<typeof kanbanBoardTable>;
export type KanbanBoardColumnsDrizzle = keyof IdbKanbanBoardDrizzle;
