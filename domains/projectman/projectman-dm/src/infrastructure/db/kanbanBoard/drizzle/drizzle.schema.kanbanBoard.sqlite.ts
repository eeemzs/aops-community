import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
export const kanbanBoardTableSqlite = sqliteTable(
  domainTableName('kanban-boards'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    name: text().notNull(),
    slug: text(),
    description: text(),
    position: integer().notNull(),
    archivedAt: integer({ mode: 'timestamp_ms' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('kanban_board_scope_name_unique').on(t.tenantId, t.scopeId, t.name),
    uniqueIndex('kanban_board_scope_slug_unique').on(t.tenantId, t.scopeId, t.slug),
    uniqueIndex('kanban_board_position_unique').on(t.tenantId, t.scopeId, t.position),
    index('kanban_board_idx_tenant').on(t.tenantId),
    index('kanban_board_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbKanbanBoardDrizzleSqlite = InferSelectModel<typeof kanbanBoardTableSqlite>
export type KanbanBoardColumnsDrizzleSqlite = keyof IdbKanbanBoardDrizzleSqlite
