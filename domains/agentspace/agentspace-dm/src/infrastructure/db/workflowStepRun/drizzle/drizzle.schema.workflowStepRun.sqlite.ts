import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { agentRunTableSqlite as agentRunTable } from '../../agentRun/drizzle/drizzle.schema.agentRun.sqlite.js'
import { workflowInstanceTableSqlite as workflowInstanceTable } from '../../workflowInstance/drizzle/drizzle.schema.workflowInstance.sqlite.js'

export const workflowStepRunTableSqlite = sqliteTable(
  'workflow-step-runs',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    workflowId: text()
      .notNull()
      .references(() => workflowInstanceTable.id, { onDelete: 'cascade' }),
    workflowInstanceId: text().notNull(),
    stepId: text().notNull(),
    sequence: integer().notNull(),
    kind: text().notNull(),
    title: text(),
    status: text().notNull(),
    agentRunId: text().references(() => agentRunTable.id, { onDelete: 'set null' }),
    approvalId: text(),
    childWorkflowId: text().references(() => workflowInstanceTable.id, { onDelete: 'set null' }),
    childWorkflowInstanceId: text(),
    input: text({ mode: 'json' }),
    approval: text({ mode: 'json' }),
    error: text({ mode: 'json' }),
    meta: text({ mode: 'json' }),
    openedAt: integer({ mode: 'timestamp_ms' }).notNull(),
    closedAt: integer({ mode: 'timestamp_ms' }),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
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

export type IdbWorkflowStepRunDrizzleSqlite = InferSelectModel<typeof workflowStepRunTableSqlite>
export type WorkflowStepRunColumnsDrizzleSqlite = keyof IdbWorkflowStepRunDrizzleSqlite
