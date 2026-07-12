import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatRoomTable } from '../../chatRoom/drizzle/drizzle.schema.chatRoom.js'

export const chatMessageTable = pgTable(
  'chat-messages',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    roomId: uuid()
      .notNull()
      .references(() => chatRoomTable.id, { onDelete: 'cascade' }),
    seq: integer().notNull(),
    authorAgentId: text().notNull(),
    kind: text().notNull(),
    text: text().notNull(),
    mentions: jsonb().$type<string[]>(),
    replyToSeq: integer(),
    idempotencyKey: text(),
    createdBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('chat_message_tenant_room_seq_unique').on(t.tenantId, t.roomId, t.seq),
    uniqueIndex('chat_message_tenant_room_idempotency_unique').on(t.tenantId, t.roomId, t.idempotencyKey),
    index('chat_message_idx_tenant').on(t.tenantId),
    index('chat_message_idx_room_seq').on(t.tenantId, t.roomId, t.seq),
    index('chat_message_idx_room_created').on(t.tenantId, t.roomId, t.createdAt),
    index('chat_message_idx_scope_created').on(t.tenantId, t.scopeId, t.createdAt),
    index('chat_message_idx_author_created').on(t.tenantId, t.authorAgentId, t.createdAt),
  ]
)

export type IdbChatMessageDrizzle = InferSelectModel<typeof chatMessageTable>
export type ChatMessageColumnsDrizzle = keyof IdbChatMessageDrizzle
