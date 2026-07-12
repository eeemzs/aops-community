import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { discussionTopicTable } from '../../discussionTopic/drizzle/drizzle.schema.discussionTopic.js'

export const discussionOutputTable = pgTable(
  'discussion-outputs',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    topicId: uuid()
      .notNull()
      .references(() => discussionTopicTable.id, { onDelete: 'cascade' }),
    outputKind: text().notNull(),
    ownerAgentId: text().notNull(),
    content: text().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('discussion_output_tenant_topic_kind_unique').on(t.tenantId, t.topicId, t.outputKind),
    index('discussion_output_idx_tenant').on(t.tenantId),
    index('discussion_output_idx_topic').on(t.tenantId, t.topicId),
  ]
)

export type IdbDiscussionOutputDrizzle = InferSelectModel<typeof discussionOutputTable>
export type DiscussionOutputColumnsDrizzle = keyof IdbDiscussionOutputDrizzle
