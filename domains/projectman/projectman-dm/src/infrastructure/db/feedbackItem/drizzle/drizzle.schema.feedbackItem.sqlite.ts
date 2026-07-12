import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
export const feedbackItemTableSqlite = sqliteTable(
  domainTableName('feedback-items'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    sprintId: text(),
    kanbanTaskId: text(),
    microTaskItemId: text(),
    title: text().notNull(),
    description: text(),
    status: text().notNull(),
    type: text().notNull(),
    severity: text().notNull(),
    source: text().notNull(),
    tags: text({ mode: 'json' }),
    suggestion: text(),
    notes: text(),
    meta: text({ mode: 'json' }),
    recordedAt: integer({ mode: 'timestamp_ms' }),
    handledAt: integer({ mode: 'timestamp_ms' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
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

export type IdbFeedbackItemDrizzleSqlite = InferSelectModel<typeof feedbackItemTableSqlite>
export type FeedbackItemColumnsDrizzleSqlite = keyof IdbFeedbackItemDrizzleSqlite
