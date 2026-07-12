import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const workflowInstanceTable = pgTable(
  'workflow-instances',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    workflowInstanceId: text().notNull(),
    definitionId: text(),
    mode: text().notNull(),
    status: text().notNull(),
    subjectType: text().notNull(),
    subjectId: text().notNull(),
    subjectLabel: text(),
    subjectMeta: jsonb(),
    input: jsonb(),
    currentStepId: text(),
    activeApprovalId: text(),
    runtimeProfile: text(),
    runRecordIds: jsonb().$type<string[]>().notNull(),
    steps: jsonb().$type<Array<Record<string, unknown>>>().notNull(),
    definitionSnapshot: jsonb(),
    meta: jsonb(),
    openedAt: timestamp({ withTimezone: true }).notNull(),
    closedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('workflow_instance_unique_instance_id').on(t.tenantId, t.scopeId, t.workflowInstanceId),
    index('workflow_instance_idx_scope_status').on(t.tenantId, t.scopeId, t.status),
    index('workflow_instance_idx_subject').on(t.tenantId, t.subjectType, t.subjectId),
  ]
)

export type IdbWorkflowInstanceDrizzle = InferSelectModel<typeof workflowInstanceTable>
export type WorkflowInstanceColumnsDrizzle = keyof IdbWorkflowInstanceDrizzle
