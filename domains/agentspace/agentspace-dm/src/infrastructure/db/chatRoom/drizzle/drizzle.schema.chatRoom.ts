import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { projectTable } from '../../project/drizzle/drizzle.schema.project.js'

export const chatRoomTable = pgTable(
  'chat-rooms',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    projectId: uuid().references(() => projectTable.id, { onDelete: 'set null' }),
    slug: text().notNull(),
    title: text().notNull(),
    kind: text().notNull(),
    purpose: text(),
    guidanceMarkdown: text(),
    status: text().notNull(),
    dmKey: text(),
    lastSeq: integer().notNull().default(0),
    lastMessageAt: timestamp({ withTimezone: true }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('chat_room_tenant_scope_slug_unique').on(t.tenantId, t.scopeId, t.slug),
    uniqueIndex('chat_room_tenant_scope_dm_key_unique').on(t.tenantId, t.scopeId, t.dmKey),
    index('chat_room_idx_tenant').on(t.tenantId),
    index('chat_room_idx_scope_updated').on(t.tenantId, t.scopeId, t.updatedAt),
    index('chat_room_idx_project_updated').on(t.tenantId, t.projectId, t.updatedAt),
    index('chat_room_idx_scope_last_message').on(t.tenantId, t.scopeId, t.lastMessageAt),
  ]
)

export type IdbChatRoomDrizzle = InferSelectModel<typeof chatRoomTable>
export type ChatRoomColumnsDrizzle = keyof IdbChatRoomDrizzle
