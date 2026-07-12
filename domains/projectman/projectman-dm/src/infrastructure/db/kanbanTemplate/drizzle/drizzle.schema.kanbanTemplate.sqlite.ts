import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
export const kanbanTemplateTableSqlite = sqliteTable(
  domainTableName('projectman-kanban-templates'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    name: text().notNull(),
    description: text(),
    definition: text({ mode: 'json' }).notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('projectman_kanban_template_name_unique').on(t.tenantId, t.scopeId, t.name),
    index('projectman_kanban_template_idx_tenant').on(t.tenantId),
    index('projectman_kanban_template_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbKanbanTemplateDrizzleSqlite = InferSelectModel<typeof kanbanTemplateTableSqlite>
export type KanbanTemplateColumnsDrizzleSqlite = keyof IdbKanbanTemplateDrizzleSqlite
