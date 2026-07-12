import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatRoomTable } from '../../chatRoom/drizzle/drizzle.schema.chatRoom.js'

export const chatRoomMemberTable = pgTable(
  'chat-room-members',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    roomId: uuid()
      .notNull()
      .references(() => chatRoomTable.id, { onDelete: 'cascade' }),
    agentId: text().notNull(),
    roleKey: text().notNull(),
    brief: text(),
    status: text().notNull(),
    lastReadSeq: integer().notNull().default(0),
    joinedAt: timestamp({ withTimezone: true }).notNull(),
    leftAt: timestamp({ withTimezone: true }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('chat_room_member_tenant_room_agent_unique').on(t.tenantId, t.roomId, t.agentId),
    index('chat_room_member_idx_tenant').on(t.tenantId),
    index('chat_room_member_idx_room_status').on(t.tenantId, t.roomId, t.status),
    index('chat_room_member_idx_scope_agent').on(t.tenantId, t.scopeId, t.agentId, t.status),
  ]
)

export type IdbChatRoomMemberDrizzle = InferSelectModel<typeof chatRoomMemberTable>
export type ChatRoomMemberColumnsDrizzle = keyof IdbChatRoomMemberDrizzle
