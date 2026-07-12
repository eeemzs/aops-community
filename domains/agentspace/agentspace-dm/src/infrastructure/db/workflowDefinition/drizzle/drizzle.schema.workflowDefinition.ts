import { InferSelectModel } from 'drizzle-orm'
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const workflowDefinitionTable = pgTable(
  'workflow-definitions',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    definitionId: text().notNull(),
    name: text().notNull(),
    mode: text().notNull(),
    subjectType: text(),
    runtimeProfile: text(),
    steps: jsonb().$type<Array<Record<string, unknown>>>().notNull(),
    policies: jsonb(),
    meta: jsonb(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('workflow_definition_unique_definition_id').on(t.tenantId, t.scopeId, t.definitionId),
    index('workflow_definition_idx_scope_mode').on(t.tenantId, t.scopeId, t.mode),
    index('workflow_definition_idx_scope_subject').on(t.tenantId, t.scopeId, t.subjectType),
  ]
)

export type IdbWorkflowDefinitionDrizzle = InferSelectModel<typeof workflowDefinitionTable>
export type WorkflowDefinitionColumnsDrizzle = keyof IdbWorkflowDefinitionDrizzle
