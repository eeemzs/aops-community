import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const promptTableSqlite = sqliteTable(
  'prompts',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    name: text().notNull(),
    description: text(),
    tags: text({ mode: 'json' }).$type<string[]>(),
    status: text().notNull().default('draft'),
    currentVersionId: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('prompt_scope_name_tenant_unique').on(t.tenantId, t.scopeId, t.name),
    index('prompt_idx_tenant').on(t.tenantId),
    index('prompt_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbPromptDrizzleSqlite = InferSelectModel<typeof promptTableSqlite>;
export type PromptColumnsDrizzleSqlite = keyof IdbPromptDrizzleSqlite;
