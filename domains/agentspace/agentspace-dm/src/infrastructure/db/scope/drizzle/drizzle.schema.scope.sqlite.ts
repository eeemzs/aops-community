import { InferSelectModel } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

export const scopeTableSqlite = sqliteTable(
  'scopes',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    type: text().notNull(),
    parentScopeId: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('scope_idx_tenant').on(t.tenantId),
    index('scope_idx_parent').on(t.tenantId, t.parentScopeId),
  ],
)

export type IdbScopeDrizzleSqlite = InferSelectModel<typeof scopeTableSqlite>
export type ScopeColumnsDrizzleSqlite = keyof IdbScopeDrizzleSqlite
