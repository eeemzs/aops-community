import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
export const historyTableSqlite = sqliteTable(
  domainTableName('histories'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    projectId: text().notNull(),
    boardId: text(),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    status: text().notNull(),
    tags: text({ mode: 'json' }),
    meta: text({ mode: 'json' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('history_project_slug_unique').on(t.tenantId, t.scopeId, t.projectId, t.slug),
    index('history_idx_tenant').on(t.tenantId),
    index('history_idx_scope').on(t.tenantId, t.scopeId),
    index('history_idx_project').on(t.tenantId, t.projectId),
    index('history_idx_project_status').on(t.tenantId, t.projectId, t.status),
    index('history_idx_board').on(t.tenantId, t.boardId),
    index('history_idx_created_at').on(t.tenantId, t.createdAt),
  ]
)

export type IdbHistoryDrizzleSqlite = InferSelectModel<typeof historyTableSqlite>
export type HistoryColumnsDrizzleSqlite = keyof IdbHistoryDrizzleSqlite
