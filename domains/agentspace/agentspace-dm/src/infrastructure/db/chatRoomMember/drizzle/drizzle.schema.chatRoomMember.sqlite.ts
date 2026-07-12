import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { chatRoomTableSqlite as chatRoomTable } from '../../chatRoom/drizzle/drizzle.schema.chatRoom.sqlite.js'

export const chatRoomMemberTableSqlite = sqliteTable(
  'chat-room-members',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    roomId: text()
      .notNull()
      .references(() => chatRoomTable.id, { onDelete: 'cascade' }),
    agentId: text().notNull(),
    roleKey: text().notNull(),
    brief: text(),
    status: text().notNull(),
    lastReadSeq: integer().notNull().default(0),
    joinedAt: integer({ mode: 'timestamp_ms' }).notNull(),
    leftAt: integer({ mode: 'timestamp_ms' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('chat_room_member_tenant_room_agent_unique').on(t.tenantId, t.roomId, t.agentId),
    index('chat_room_member_idx_tenant').on(t.tenantId),
    index('chat_room_member_idx_room_status').on(t.tenantId, t.roomId, t.status),
    index('chat_room_member_idx_scope_agent').on(t.tenantId, t.scopeId, t.agentId, t.status),
  ]
)

export type IdbChatRoomMemberDrizzleSqlite = InferSelectModel<typeof chatRoomMemberTableSqlite>
export type ChatRoomMemberColumnsDrizzleSqlite = keyof IdbChatRoomMemberDrizzleSqlite
