import { domainTableName } from '../../domain-naming.js'
﻿import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const feedbackItemTable = pgTable(
  domainTableName('feedback-items'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    sprintId: uuid(),
    kanbanTaskId: uuid(),
    microTaskItemId: uuid(),
    title: text().notNull(),
    description: text(),
    status: text().notNull(),
    type: text().notNull(),
    severity: text().notNull(),
    source: text().notNull(),
    tags: jsonb(),
    suggestion: text(),
    notes: text(),
    meta: jsonb(),
    recordedAt: timestamp({ withTimezone: true }),
    handledAt: timestamp({ withTimezone: true }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('feedback_item_idx_tenant').on(t.tenantId),
    index('feedback_item_idx_scope').on(t.tenantId, t.scopeId),
    index('feedback_item_idx_status').on(t.tenantId, t.scopeId, t.status),
    index('feedback_item_idx_type').on(t.tenantId, t.scopeId, t.type),
    index('feedback_item_idx_severity').on(t.tenantId, t.scopeId, t.severity),
    index('feedback_item_idx_source').on(t.tenantId, t.scopeId, t.source),
    index('feedback_item_idx_sprint').on(t.tenantId, t.sprintId),
    index('feedback_item_idx_kanban_task').on(t.tenantId, t.kanbanTaskId),
    index('feedback_item_idx_micro_task').on(t.tenantId, t.microTaskItemId),
    index('feedback_item_idx_created_at').on(t.tenantId, t.createdAt),
  ]
)

export type IdbFeedbackItemDrizzle = InferSelectModel<typeof feedbackItemTable>;
export type FeedbackItemColumnsDrizzle = keyof IdbFeedbackItemDrizzle;
