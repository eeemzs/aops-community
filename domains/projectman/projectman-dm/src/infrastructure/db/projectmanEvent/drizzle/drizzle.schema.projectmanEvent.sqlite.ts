import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
export const projectmanEventTableSqlite = sqliteTable(
  domainTableName('projectman-events'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    action: text().notNull(),
    payload: text({ mode: 'json' }),
    actorId: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index('projectman_event_idx_tenant').on(t.tenantId),
    index('projectman_event_idx_scope').on(t.tenantId, t.scopeId),
    index('projectman_event_idx_entity').on(t.tenantId, t.entityType, t.entityId),
    index('projectman_event_idx_action').on(t.tenantId, t.action),
    index('projectman_event_idx_created_at').on(t.tenantId, t.createdAt),
  ]
)

export type IdbProjectmanEventDrizzleSqlite = InferSelectModel<typeof projectmanEventTableSqlite>
export type ProjectmanEventColumnsDrizzleSqlite = keyof IdbProjectmanEventDrizzleSqlite
