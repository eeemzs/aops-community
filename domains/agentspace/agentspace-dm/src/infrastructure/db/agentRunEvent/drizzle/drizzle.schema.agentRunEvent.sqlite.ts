import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { agentRunTableSqlite as agentRunTable } from '../../agentRun/drizzle/drizzle.schema.agentRun.sqlite.js'

export const agentRunEventTableSqlite = sqliteTable(
  'agent-run-events',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    agentRunId: text()
      .notNull()
      .references(() => agentRunTable.id, { onDelete: 'cascade' }),
    runId: text().notNull(),
    eventId: text().notNull(),
    sequence: integer().notNull(),
    eventType: text().notNull(),
    status: text(),
    payload: text({ mode: 'json' }),
    meta: text({ mode: 'json' }),
    emittedAt: integer({ mode: 'timestamp_ms' }).notNull(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('agent_run_event_unique_run_sequence').on(t.tenantId, t.agentRunId, t.sequence),
    index('agent_run_event_idx_scope_emitted').on(t.tenantId, t.scopeId, t.emittedAt),
    
    index('agent_run_event_idx_run_id').on(t.tenantId, t.runId),
    index('agent_run_event_idx_type').on(t.tenantId, t.eventType),
  ]
)

export type IdbAgentRunEventDrizzleSqlite = InferSelectModel<typeof agentRunEventTableSqlite>
export type AgentRunEventColumnsDrizzleSqlite = keyof IdbAgentRunEventDrizzleSqlite
