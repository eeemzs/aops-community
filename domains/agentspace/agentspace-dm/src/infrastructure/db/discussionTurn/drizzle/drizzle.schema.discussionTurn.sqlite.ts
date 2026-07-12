import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { discussionTopicTableSqlite as discussionTopicTable } from '../../discussionTopic/drizzle/drizzle.schema.discussionTopic.sqlite.js'

export const discussionTurnTableSqlite = sqliteTable(
  'discussion-turns',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    topicId: text()
      .notNull()
      .references(() => discussionTopicTable.id, { onDelete: 'cascade' }),
    seq: integer().notNull(),
    agentId: text().notNull(),
    kind: text().notNull(),
    text: text().notNull(),
    addressedTo: text(),
    replyToSeq: integer(),
    idempotencyKey: text(),
    createdBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('discussion_turn_tenant_topic_seq_unique').on(t.tenantId, t.topicId, t.seq),
    uniqueIndex('discussion_turn_tenant_topic_idempotency_unique').on(t.tenantId, t.topicId, t.idempotencyKey),
    index('discussion_turn_idx_tenant').on(t.tenantId),
    index('discussion_turn_idx_topic_seq').on(t.tenantId, t.topicId, t.seq),
    index('discussion_turn_idx_topic_created').on(t.tenantId, t.topicId, t.createdAt),
  ]
)

export type IdbDiscussionTurnDrizzleSqlite = InferSelectModel<typeof discussionTurnTableSqlite>
export type DiscussionTurnColumnsDrizzleSqlite = keyof IdbDiscussionTurnDrizzleSqlite
