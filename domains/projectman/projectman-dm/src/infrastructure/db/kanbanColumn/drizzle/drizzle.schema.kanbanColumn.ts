import { domainTableName } from '../../domain-naming.js'
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const kanbanColumnTable = pgTable(
  domainTableName('kanban-columns'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
    description: text(),
    wipLimit: integer(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('kanban_column_idx_tenant').on(t.tenantId),
    index('kanban_column_idx_scope').on(t.tenantId, t.scopeId),
    uniqueIndex('kanban_column_scope_slug_unique').on(t.tenantId, t.scopeId, t.slug),
  ]
)

export type IdbKanbanColumnDrizzle = InferSelectModel<typeof kanbanColumnTable>;
export type KanbanColumnColumnsDrizzle = keyof IdbKanbanColumnDrizzle;
