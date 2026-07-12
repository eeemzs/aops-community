import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { chatRoomTableSqlite as chatRoomTable } from '../../chatRoom/drizzle/drizzle.schema.chatRoom.sqlite.js'

export const chatMessageTableSqlite = sqliteTable(
  'chat-messages',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    roomId: text()
      .notNull()
      .references(() => chatRoomTable.id, { onDelete: 'cascade' }),
    seq: integer().notNull(),
    authorAgentId: text().notNull(),
    kind: text().notNull(),
    text: text().notNull(),
    mentions: text({ mode: 'json' }).$type<string[]>(),
    replyToSeq: integer(),
    idempotencyKey: text(),
    createdBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
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

export type IdbChatMessageDrizzleSqlite = InferSelectModel<typeof chatMessageTableSqlite>
export type ChatMessageColumnsDrizzleSqlite = keyof IdbChatMessageDrizzleSqlite
