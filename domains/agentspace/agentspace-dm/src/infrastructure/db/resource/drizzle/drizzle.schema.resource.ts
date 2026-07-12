import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const resourceTable = pgTable(
  'resources',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    name: text().notNull(),
    description: text(),
    resourceType: text().notNull(),
    uri: text(),
    tags: jsonb().$type<string[]>(),
    refType: text(),
    refId: text(),
    meta: jsonb(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('resource_scope_ref_unique').on(t.tenantId, t.scopeId, t.refType, t.refId),
    index('resource_idx_tenant').on(t.tenantId),
    index('resource_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbResourceDrizzle = InferSelectModel<typeof resourceTable>;
export type ResourceColumnsDrizzle = keyof IdbResourceDrizzle;
