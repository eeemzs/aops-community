import { domainTableName } from '../../domain-naming.js'
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const kanbanTemplateTable = pgTable(
  domainTableName('projectman-kanban-templates'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    name: text().notNull(),
    description: text(),
    definition: jsonb().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('projectman_kanban_template_name_unique').on(t.tenantId, t.scopeId, t.name),
    index('projectman_kanban_template_idx_tenant').on(t.tenantId),
    index('projectman_kanban_template_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbKanbanTemplateDrizzle = InferSelectModel<typeof kanbanTemplateTable>;
export type KanbanTemplateColumnsDrizzle = keyof IdbKanbanTemplateDrizzle;
