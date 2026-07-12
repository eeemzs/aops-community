import { domainTableName } from '../../domain-naming.js'
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const projectmanEventTable = pgTable(
  domainTableName('projectman-events'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    action: text().notNull(),
    payload: jsonb(),
    actorId: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('projectman_event_idx_tenant').on(t.tenantId),
    index('projectman_event_idx_scope').on(t.tenantId, t.scopeId),
    index('projectman_event_idx_entity').on(t.tenantId, t.entityType, t.entityId),
    index('projectman_event_idx_action').on(t.tenantId, t.action),
    index('projectman_event_idx_created_at').on(t.tenantId, t.createdAt),
  ]
)

export type IdbProjectmanEventDrizzle = InferSelectModel<typeof projectmanEventTable>;
export type ProjectmanEventColumnsDrizzle = keyof IdbProjectmanEventDrizzle;
