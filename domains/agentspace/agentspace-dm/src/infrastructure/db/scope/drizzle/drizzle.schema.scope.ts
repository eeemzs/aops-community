import { InferSelectModel } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const scopeTable = pgTable(
  'scopes',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    type: text().notNull(),
    parentScopeId: uuid(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('scope_idx_tenant').on(t.tenantId),
    index('scope_idx_parent').on(t.tenantId, t.parentScopeId),
  ],
)

export type IdbScopeDrizzle = InferSelectModel<typeof scopeTable>
export type ScopeColumnsDrizzle = keyof IdbScopeDrizzle
