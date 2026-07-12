import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable } from 'drizzle-orm/sqlite-core'

export const memoryItemTableSqlite = sqliteTable(
  'memory-items',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    kind: text().notNull(),
    durability: text().notNull(),
    content: text().notNull(),
    tags: text({ mode: 'json' }).$type<string[]>(),
    importance: integer(),
    sourceType: text(),
    sourceId: text(),
    meta: text({ mode: 'json' }),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('memory_item_idx_tenant').on(t.tenantId),
    index('memory_item_idx_scope').on(t.tenantId, t.scopeId),
    index('memory_item_idx_kind').on(t.tenantId, t.kind),
    index('memory_item_idx_durability').on(t.tenantId, t.durability),
  ]
)

export type IdbMemoryItemDrizzleSqlite = InferSelectModel<typeof memoryItemTableSqlite>;
export type MemoryItemColumnsDrizzleSqlite = keyof IdbMemoryItemDrizzleSqlite;
