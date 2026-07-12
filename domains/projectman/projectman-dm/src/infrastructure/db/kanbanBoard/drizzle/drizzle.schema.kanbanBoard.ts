import { domainTableName } from '../../domain-naming.js'
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const kanbanBoardTable = pgTable(
  domainTableName('kanban-boards'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    name: text().notNull(),
    slug: text(),
    description: text(),
    position: integer().notNull(),
    archivedAt: timestamp({ withTimezone: true }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('kanban_board_scope_name_unique').on(t.tenantId, t.scopeId, t.name),
    uniqueIndex('kanban_board_scope_slug_unique').on(t.tenantId, t.scopeId, t.slug),
    uniqueIndex('kanban_board_position_unique').on(t.tenantId, t.scopeId, t.position),
    index('kanban_board_idx_tenant').on(t.tenantId),
    index('kanban_board_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbKanbanBoardDrizzle = InferSelectModel<typeof kanbanBoardTable>;
export type KanbanBoardColumnsDrizzle = keyof IdbKanbanBoardDrizzle;
