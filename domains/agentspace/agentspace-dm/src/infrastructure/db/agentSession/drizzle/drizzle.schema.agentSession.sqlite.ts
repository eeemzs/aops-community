import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable } from 'drizzle-orm/sqlite-core'

export const agentSessionTableSqlite = sqliteTable(
  'agent-sessions',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    missionId: text(),
    sessionId: text().notNull(),
    agent: text().notNull(),
    profile: text(),
    model: text(),
    status: text().notNull(),
    startedAt: integer({ mode: 'timestamp_ms' }),
    endedAt: integer({ mode: 'timestamp_ms' }),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('agent_session_idx_tenant').on(t.tenantId),
    index('agent_session_idx_scope').on(t.tenantId, t.scopeId),
    index('agent_session_idx_mission').on(t.tenantId, t.missionId),
    index('agent_session_idx_scope_started').on(t.tenantId, t.scopeId, t.startedAt),
  ]
)

export type IdbAgentSessionDrizzleSqlite = InferSelectModel<typeof agentSessionTableSqlite>;
export type AgentSessionColumnsDrizzleSqlite = keyof IdbAgentSessionDrizzleSqlite;
