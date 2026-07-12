import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const memoryItemTable = pgTable(
  'memory-items',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    kind: text().notNull(),
    durability: text().notNull(),
    content: text().notNull(),
    tags: jsonb().$type<string[]>(),
    importance: integer(),
    sourceType: text(),
    sourceId: text(),
    meta: jsonb(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('memory_item_idx_tenant').on(t.tenantId),
    index('memory_item_idx_scope').on(t.tenantId, t.scopeId),
    index('memory_item_idx_kind').on(t.tenantId, t.kind),
    index('memory_item_idx_durability').on(t.tenantId, t.durability),
  ]
)

export type IdbMemoryItemDrizzle = InferSelectModel<typeof memoryItemTable>;
export type MemoryItemColumnsDrizzle = keyof IdbMemoryItemDrizzle;
