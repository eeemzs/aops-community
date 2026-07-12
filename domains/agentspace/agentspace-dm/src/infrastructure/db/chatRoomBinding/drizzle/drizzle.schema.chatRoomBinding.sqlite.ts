import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable } from 'drizzle-orm/sqlite-core'
import { chatRoomTableSqlite as chatRoomTable } from '../../chatRoom/drizzle/drizzle.schema.chatRoom.sqlite.js'

export const chatRoomBindingTableSqlite = sqliteTable(
  'chat-room-bindings',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    roomId: text()
      .notNull()
      .references(() => chatRoomTable.id, { onDelete: 'cascade' }),
    bindingType: text().notNull(),
    refId: text(),
    uri: text(),
    title: text(),
    note: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('chat_room_binding_idx_tenant').on(t.tenantId),
    index('chat_room_binding_idx_room_type').on(t.tenantId, t.roomId, t.bindingType),
    index('chat_room_binding_idx_scope_type').on(t.tenantId, t.scopeId, t.bindingType),
  ]
)

export type IdbChatRoomBindingDrizzleSqlite = InferSelectModel<typeof chatRoomBindingTableSqlite>
export type ChatRoomBindingColumnsDrizzleSqlite = keyof IdbChatRoomBindingDrizzleSqlite
