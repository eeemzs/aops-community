import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const resourceTableSqlite = sqliteTable(
  'resources',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    name: text().notNull(),
    description: text(),
    resourceType: text().notNull(),
    uri: text(),
    tags: text({ mode: 'json' }).$type<string[]>(),
    refType: text(),
    refId: text(),
    meta: text({ mode: 'json' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('resource_scope_ref_unique').on(t.tenantId, t.scopeId, t.refType, t.refId),
    index('resource_idx_tenant').on(t.tenantId),
    index('resource_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbResourceDrizzleSqlite = InferSelectModel<typeof resourceTableSqlite>;
export type ResourceColumnsDrizzleSqlite = keyof IdbResourceDrizzleSqlite;
