import { domainTableName } from '../../domain-naming.js'
﻿import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const issueItemTable = pgTable(
  domainTableName('issue-items'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    sprintId: uuid(),
    kanbanTaskId: uuid(),
    microTaskItemId: uuid(),
    reviewRequestId: uuid(),
    title: text().notNull(),
    description: text(),
    status: text().notNull(),
    severity: text().notNull(),
    source: text().notNull(),
    tags: jsonb(),
    notes: text(),
    meta: jsonb(),
    openedAt: timestamp({ withTimezone: true }),
    resolvedAt: timestamp({ withTimezone: true }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
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

export type IdbIssueItemDrizzle = InferSelectModel<typeof issueItemTable>;
export type IssueItemColumnsDrizzle = keyof IdbIssueItemDrizzle;
