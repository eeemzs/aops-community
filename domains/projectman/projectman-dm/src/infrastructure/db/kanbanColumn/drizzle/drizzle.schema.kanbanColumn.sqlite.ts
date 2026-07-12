import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
export const kanbanColumnTableSqlite = sqliteTable(
  domainTableName('kanban-columns'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    description: text(),
    wipLimit: integer(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index('kanban_column_idx_tenant').on(t.tenantId),
    index('kanban_column_idx_scope').on(t.tenantId, t.scopeId),
    uniqueIndex('kanban_column_scope_slug_unique').on(t.tenantId, t.scopeId, t.slug),
  ]
)

export type IdbKanbanColumnDrizzleSqlite = InferSelectModel<typeof kanbanColumnTableSqlite>
export type KanbanColumnColumnsDrizzleSqlite = keyof IdbKanbanColumnDrizzleSqlite
