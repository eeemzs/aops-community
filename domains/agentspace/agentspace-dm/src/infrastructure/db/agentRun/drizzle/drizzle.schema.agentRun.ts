import { doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { agentSessionTable } from '../../agentSession/drizzle/drizzle.schema.agentSession.js'
import { projectTable } from '../../project/drizzle/drizzle.schema.project.js'

export const agentRunTable = pgTable(
  'agent-runs',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    projectId: uuid().references(() => projectTable.id, { onDelete: 'set null' }),
    agentSessionId: uuid()
      .notNull()
      .references(() => agentSessionTable.id, { onDelete: 'cascade' }),
    taskId: uuid(),
    runId: text().notNull(),
    sessionId: text().notNull(),
    agent: text().notNull(),
    profile: text(),
    model: text(),
    outputFormat: text(),
    tokensUsed: integer(),
    costUsd: doublePrecision(),
    exitCode: integer(),
    stdout: text(),
    stderr: text(),
    resultText: text(),
    startedAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    durationMs: integer(),
    meta: jsonb(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('agent_run_idx_tenant').on(t.tenantId),
    index('agent_run_idx_scope').on(t.tenantId, t.scopeId),
    index('agent_run_idx_session_started').on(t.tenantId, t.agentSessionId, t.startedAt),
    index('agent_run_idx_task_started').on(t.tenantId, t.taskId, t.startedAt),
    index('agent_run_idx_project').on(t.tenantId, t.projectId),
  ]
)

export type IdbAgentRunDrizzle = InferSelectModel<typeof agentRunTable>;
export type AgentRunColumnsDrizzle = keyof IdbAgentRunDrizzle;
