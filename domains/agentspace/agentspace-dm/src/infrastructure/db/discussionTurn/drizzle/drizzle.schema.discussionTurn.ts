import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { discussionTopicTable } from '../../discussionTopic/drizzle/drizzle.schema.discussionTopic.js'

export const discussionTurnTable = pgTable(
  'discussion-turns',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    topicId: uuid()
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
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('discussion_turn_tenant_topic_seq_unique').on(t.tenantId, t.topicId, t.seq),
    uniqueIndex('discussion_turn_tenant_topic_idempotency_unique').on(t.tenantId, t.topicId, t.idempotencyKey),
    index('discussion_turn_idx_tenant').on(t.tenantId),
    index('discussion_turn_idx_topic_seq').on(t.tenantId, t.topicId, t.seq),
    index('discussion_turn_idx_topic_created').on(t.tenantId, t.topicId, t.createdAt),
  ]
)

export type IdbDiscussionTurnDrizzle = InferSelectModel<typeof discussionTurnTable>
export type DiscussionTurnColumnsDrizzle = keyof IdbDiscussionTurnDrizzle
