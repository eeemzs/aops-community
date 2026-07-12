import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { agentRunTable } from '../../agentRun/drizzle/drizzle.schema.agentRun.js'

export const agentRunEventTable = pgTable(
  'agent-run-events',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    agentRunId: uuid()
      .notNull()
      .references(() => agentRunTable.id, { onDelete: 'cascade' }),
    runId: text().notNull(),
    eventId: text().notNull(),
    sequence: integer().notNull(),
    eventType: text().notNull(),
    status: text(),
    payload: jsonb(),
    meta: jsonb(),
    emittedAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('agent_run_event_unique_run_sequence').on(t.tenantId, t.agentRunId, t.sequence),
    index('agent_run_event_idx_scope_emitted').on(t.tenantId, t.scopeId, t.emittedAt),
    index('agent_run_event_idx_run_id').on(t.tenantId, t.runId),
    index('agent_run_event_idx_type').on(t.tenantId, t.eventType),
  ]
)

export type IdbAgentRunEventDrizzle = InferSelectModel<typeof agentRunEventTable>
export type AgentRunEventColumnsDrizzle = keyof IdbAgentRunEventDrizzle
