import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { scopeTableSqlite as scopeTable } from '../../scope/drizzle/drizzle.schema.scope.sqlite.js'

export const projectTableSqlite = sqliteTable(
  'projects',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text()
      .notNull()
      .references(() => scopeTable.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    description: text(),
    tags: text({ mode: 'json' }).$type<string[]>(),
    slug: text(),
    status: text(),
    visibility: text(),
    projectType: text(),
    ownerId: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('project_scope_unique').on(t.scopeId),
    uniqueIndex('project_slug_tenant_unique').on(t.tenantId, t.slug),
    index('project_idx_tenant').on(t.tenantId),
  ]
)

export type IdbProjectDrizzleSqlite = InferSelectModel<typeof projectTableSqlite>;
export type ProjectColumnsDrizzleSqlite = keyof IdbProjectDrizzleSqlite;
