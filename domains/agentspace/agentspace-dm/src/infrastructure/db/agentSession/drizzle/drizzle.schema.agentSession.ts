import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const agentSessionTable = pgTable(
  'agent-sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    missionId: uuid(),
    sessionId: text().notNull(),
    agent: text().notNull(),
    profile: text(),
    model: text(),
    status: text().notNull(),
    startedAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('agent_session_idx_tenant').on(t.tenantId),
    index('agent_session_idx_scope').on(t.tenantId, t.scopeId),
    index('agent_session_idx_mission').on(t.tenantId, t.missionId),
    index('agent_session_idx_scope_started').on(t.tenantId, t.scopeId, t.startedAt),
  ]
)

export type IdbAgentSessionDrizzle = InferSelectModel<typeof agentSessionTable>;
export type AgentSessionColumnsDrizzle = keyof IdbAgentSessionDrizzle;
