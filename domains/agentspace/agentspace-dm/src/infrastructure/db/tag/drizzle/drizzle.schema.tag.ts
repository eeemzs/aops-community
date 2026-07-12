import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const tagTable = pgTable(
  'tags',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    scopeType: text().notNull(),
    name: text().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('tag_scope_name_tenant_unique').on(t.tenantId, t.scopeId, t.scopeType, t.name),
    index('tag_idx_tenant').on(t.tenantId),
    index('tag_idx_scope').on(t.tenantId, t.scopeId),
    index('tag_idx_target_type').on(t.tenantId, t.scopeType),
  ]
)

export type IdbTagDrizzle = InferSelectModel<typeof tagTable>;
export type TagColumnsDrizzle = keyof IdbTagDrizzle;
