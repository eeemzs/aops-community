import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { projectTableSqlite as projectTable } from '../../project/drizzle/drizzle.schema.project.sqlite.js'

export const chatRoomTableSqlite = sqliteTable(
  'chat-rooms',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    projectId: text().references(() => projectTable.id, { onDelete: 'set null' }),
    slug: text().notNull(),
    title: text().notNull(),
    kind: text().notNull(),
    purpose: text(),
    guidanceMarkdown: text(),
    status: text().notNull(),
    dmKey: text(),
    lastSeq: integer().notNull().default(0),
    lastMessageAt: integer({ mode: 'timestamp_ms' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
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

export type IdbChatRoomDrizzleSqlite = InferSelectModel<typeof chatRoomTableSqlite>
export type ChatRoomColumnsDrizzleSqlite = keyof IdbChatRoomDrizzleSqlite
