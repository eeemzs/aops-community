import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { agentRunTable } from '../../agentRun/drizzle/drizzle.schema.agentRun.js'
import { workflowInstanceTable } from '../../workflowInstance/drizzle/drizzle.schema.workflowInstance.js'

export const workflowStepRunTable = pgTable(
  'workflow-step-runs',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    workflowId: uuid()
      .notNull()
      .references(() => workflowInstanceTable.id, { onDelete: 'cascade' }),
    workflowInstanceId: text().notNull(),
    stepId: text().notNull(),
    sequence: integer().notNull(),
    kind: text().notNull(),
    title: text(),
    status: text().notNull(),
    agentRunId: uuid().references(() => agentRunTable.id, { onDelete: 'set null' }),
    approvalId: text(),
    childWorkflowId: uuid().references(() => workflowInstanceTable.id, { onDelete: 'set null' }),
    childWorkflowInstanceId: text(),
    input: jsonb(),
    approval: jsonb(),
    error: jsonb(),
    meta: jsonb(),
    openedAt: timestamp({ withTimezone: true }).notNull(),
    closedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('workflow_step_run_unique_sequence').on(t.tenantId, t.workflowId, t.sequence),
    index('workflow_step_run_idx_scope').on(t.tenantId, t.scopeId),
    index('workflow_step_run_idx_workflow_step').on(t.tenantId, t.workflowId, t.stepId),
    index('workflow_step_run_idx_instance').on(t.tenantId, t.workflowInstanceId),
    index('workflow_step_run_idx_agent_run').on(t.tenantId, t.agentRunId),
    index('workflow_step_run_idx_child_workflow').on(t.tenantId, t.childWorkflowId),
  ]
)

export type IdbWorkflowStepRunDrizzle = InferSelectModel<typeof workflowStepRunTable>
export type WorkflowStepRunColumnsDrizzle = keyof IdbWorkflowStepRunDrizzle
