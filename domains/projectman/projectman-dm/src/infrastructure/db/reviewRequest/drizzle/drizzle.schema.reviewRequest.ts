import { domainTableName } from '../../domain-naming.js'
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const reviewRequestTable = pgTable(
  domainTableName('review-requests'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    sprintId: uuid(),
    kanbanTaskId: uuid(),
    microTaskItemId: uuid(),
    collabSessionId: text(),
    collabRequestEventId: text(),
    collabResultEventIds: jsonb(),
    parentReviewRequestId: uuid(),
    rootReviewRequestId: uuid(),
    title: text().notNull(),
    description: text(),
    reviewScope: text(),
    instructions: text(),
    references: jsonb(),
    status: text().notNull(),
    priority: text().notNull(),
    source: text().notNull(),
    tags: jsonb(),
    requestedBy: text(),
    targetAgent: text(),
    targetSlot: text(),
    results: jsonb(),
    idempotencyKey: text(),
    notes: text(),
    meta: jsonb(),
    requestedAt: timestamp({ withTimezone: true }),
    closedAt: timestamp({ withTimezone: true }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
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

export type IdbReviewRequestDrizzle = InferSelectModel<typeof reviewRequestTable>;
export type ReviewRequestColumnsDrizzle = keyof IdbReviewRequestDrizzle;
