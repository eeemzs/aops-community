import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
export const reviewRequestTableSqlite = sqliteTable(
  domainTableName('review-requests'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    sprintId: text(),
    kanbanTaskId: text(),
    microTaskItemId: text(),
    collabSessionId: text(),
    collabRequestEventId: text(),
    collabResultEventIds: text({ mode: 'json' }),
    parentReviewRequestId: text(),
    rootReviewRequestId: text(),
    title: text().notNull(),
    description: text(),
    reviewScope: text(),
    instructions: text(),
    references: text({ mode: 'json' }),
    status: text().notNull(),
    priority: text().notNull(),
    source: text().notNull(),
    tags: text({ mode: 'json' }),
    requestedBy: text(),
    targetAgent: text(),
    targetSlot: text(),
    results: text({ mode: 'json' }),
    idempotencyKey: text(),
    notes: text(),
    meta: text({ mode: 'json' }),
    requestedAt: integer({ mode: 'timestamp_ms' }),
    closedAt: integer({ mode: 'timestamp_ms' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index('review_request_idx_tenant').on(t.tenantId),
    index('review_request_idx_scope').on(t.tenantId, t.scopeId),
    index('review_request_idx_status').on(t.tenantId, t.scopeId, t.status),
    index('review_request_idx_priority').on(t.tenantId, t.scopeId, t.priority),
    index('review_request_idx_source').on(t.tenantId, t.scopeId, t.source),
    index('review_request_idx_sprint').on(t.tenantId, t.sprintId),
    index('review_request_idx_kanban_task').on(t.tenantId, t.kanbanTaskId),
    index('review_request_idx_micro_task').on(t.tenantId, t.microTaskItemId),
    index('review_request_idx_target_agent').on(t.tenantId, t.targetAgent),
    index('review_request_idx_parent').on(t.tenantId, t.parentReviewRequestId),
    index('review_request_idx_root').on(t.tenantId, t.rootReviewRequestId),
    index('review_request_idx_idempotency').on(t.tenantId, t.scopeId, t.idempotencyKey),
    index('review_request_idx_created_at').on(t.tenantId, t.createdAt),
  ]
)

export type IdbReviewRequestDrizzleSqlite = InferSelectModel<typeof reviewRequestTableSqlite>
export type ReviewRequestColumnsDrizzleSqlite = keyof IdbReviewRequestDrizzleSqlite
