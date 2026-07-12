import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { chatRoomTable } from '../../chatRoom/drizzle/drizzle.schema.chatRoom.js'

export const chatRoomBindingTable = pgTable(
  'chat-room-bindings',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    roomId: uuid()
      .notNull()
      .references(() => chatRoomTable.id, { onDelete: 'cascade' }),
    bindingType: text().notNull(),
    refId: text(),
    uri: text(),
    title: text(),
    note: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('chat_room_binding_idx_tenant').on(t.tenantId),
    index('chat_room_binding_idx_room_type').on(t.tenantId, t.roomId, t.bindingType),
    index('chat_room_binding_idx_scope_type').on(t.tenantId, t.scopeId, t.bindingType),
  ]
)

export type IdbChatRoomBindingDrizzle = InferSelectModel<typeof chatRoomBindingTable>
export type ChatRoomBindingColumnsDrizzle = keyof IdbChatRoomBindingDrizzle
