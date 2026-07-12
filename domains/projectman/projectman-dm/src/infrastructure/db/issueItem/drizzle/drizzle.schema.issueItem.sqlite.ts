import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
export const issueItemTableSqlite = sqliteTable(
  domainTableName('issue-items'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    sprintId: text(),
    kanbanTaskId: text(),
    microTaskItemId: text(),
    reviewRequestId: text(),
    title: text().notNull(),
    description: text(),
    status: text().notNull(),
    severity: text().notNull(),
    source: text().notNull(),
    tags: text({ mode: 'json' }),
    notes: text(),
    meta: text({ mode: 'json' }),
    openedAt: integer({ mode: 'timestamp_ms' }),
    resolvedAt: integer({ mode: 'timestamp_ms' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index('issue_item_idx_tenant').on(t.tenantId),
    index('issue_item_idx_scope').on(t.tenantId, t.scopeId),
    index('issue_item_idx_status').on(t.tenantId, t.scopeId, t.status),
    index('issue_item_idx_severity').on(t.tenantId, t.scopeId, t.severity),
    index('issue_item_idx_source').on(t.tenantId, t.scopeId, t.source),
    index('issue_item_idx_sprint').on(t.tenantId, t.sprintId),
    index('issue_item_idx_kanban_task').on(t.tenantId, t.kanbanTaskId),
    index('issue_item_idx_micro_task').on(t.tenantId, t.microTaskItemId),
    index('issue_item_idx_review_request').on(t.tenantId, t.reviewRequestId),
    index('issue_item_idx_created_at').on(t.tenantId, t.createdAt),
  ]
)

export type IdbIssueItemDrizzleSqlite = InferSelectModel<typeof issueItemTableSqlite>
export type IssueItemColumnsDrizzleSqlite = keyof IdbIssueItemDrizzleSqlite
