import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { discussionTopicTableSqlite as discussionTopicTable } from '../../discussionTopic/drizzle/drizzle.schema.discussionTopic.sqlite.js'

export const discussionOutputTableSqlite = sqliteTable(
  'discussion-outputs',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    topicId: text()
      .notNull()
      .references(() => discussionTopicTable.id, { onDelete: 'cascade' }),
    outputKind: text().notNull(),
    ownerAgentId: text().notNull(),
    content: text().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('discussion_output_tenant_topic_kind_unique').on(t.tenantId, t.topicId, t.outputKind),
    index('discussion_output_idx_tenant').on(t.tenantId),
    index('discussion_output_idx_topic').on(t.tenantId, t.topicId),
  ]
)

export type IdbDiscussionOutputDrizzleSqlite = InferSelectModel<typeof discussionOutputTableSqlite>
export type DiscussionOutputColumnsDrizzleSqlite = keyof IdbDiscussionOutputDrizzleSqlite
