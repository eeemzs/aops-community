import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const workflowDefinitionTableSqlite = sqliteTable(
  'workflow-definitions',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    definitionId: text().notNull(),
    name: text().notNull(),
    mode: text().notNull(),
    subjectType: text(),
    runtimeProfile: text(),
    steps: text({ mode: 'json' }).$type<Array<Record<string, unknown>>>().notNull(),
    policies: text({ mode: 'json' }),
    meta: text({ mode: 'json' }),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('workflow_definition_unique_definition_id').on(t.tenantId, t.scopeId, t.definitionId),
    index('workflow_definition_idx_scope_mode').on(t.tenantId, t.scopeId, t.mode),
    index('workflow_definition_idx_scope_subject').on(t.tenantId, t.scopeId, t.subjectType),
  ]
)

export type IdbWorkflowDefinitionDrizzleSqlite = InferSelectModel<typeof workflowDefinitionTableSqlite>
export type WorkflowDefinitionColumnsDrizzleSqlite = keyof IdbWorkflowDefinitionDrizzleSqlite
