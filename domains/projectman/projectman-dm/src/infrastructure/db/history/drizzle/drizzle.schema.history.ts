import { domainTableName } from '../../domain-naming.js'
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const historyTable = pgTable(
  domainTableName('histories'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    projectId: uuid().notNull(),
    boardId: uuid(),
    slug: text().notNull(),
    name: text().notNull(),
    description: text(),
    status: text().notNull(),
    tags: jsonb(),
    meta: jsonb(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
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

export type IdbHistoryDrizzle = InferSelectModel<typeof historyTable>
export type HistoryColumnsDrizzle = keyof IdbHistoryDrizzle
