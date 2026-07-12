import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, real, sqliteTable } from 'drizzle-orm/sqlite-core'
import { agentSessionTableSqlite as agentSessionTable } from '../../agentSession/drizzle/drizzle.schema.agentSession.sqlite.js'
import { projectTableSqlite as projectTable } from '../../project/drizzle/drizzle.schema.project.sqlite.js'

export const agentRunTableSqlite = sqliteTable(
  'agent-runs',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    projectId: text().references(() => projectTable.id, { onDelete: 'set null' }),
    agentSessionId: text()
      .notNull()
      .references(() => agentSessionTable.id, { onDelete: 'cascade' }),
    taskId: text(),
    runId: text().notNull(),
    sessionId: text().notNull(),
    agent: text().notNull(),
    profile: text(),
    model: text(),
    outputFormat: text(),
    tokensUsed: integer(),
    costUsd: real(),
    exitCode: integer(),
    stdout: text(),
    stderr: text(),
    resultText: text(),
    startedAt: integer({ mode: 'timestamp_ms' }),
    endedAt: integer({ mode: 'timestamp_ms' }),
    durationMs: integer(),
    meta: text({ mode: 'json' }),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('agent_run_idx_tenant').on(t.tenantId),
    index('agent_run_idx_scope').on(t.tenantId, t.scopeId),
    index('agent_run_idx_session_started').on(t.tenantId, t.agentSessionId, t.startedAt),
    index('agent_run_idx_task_started').on(t.tenantId, t.taskId, t.startedAt),
    index('agent_run_idx_project').on(t.tenantId, t.projectId),
  ]
)

export type IdbAgentRunDrizzleSqlite = InferSelectModel<typeof agentRunTableSqlite>;
export type AgentRunColumnsDrizzleSqlite = keyof IdbAgentRunDrizzleSqlite;
