import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { codexChatThreadTableSqlite as codexChatThreadTable } from '../../codexChatThread/drizzle/drizzle.schema.codexChatThread.sqlite.js'
import { projectTableSqlite as projectTable } from '../../project/drizzle/drizzle.schema.project.sqlite.js'

export const codexChatMessageTableSqlite = sqliteTable(
  'codex-chat-messages',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    projectId: text()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    threadId: text()
      .notNull()
      .references(() => codexChatThreadTable.id, { onDelete: 'cascade' }),
    externalThreadId: text(),
    role: text().notNull(),
    text: text().notNull(),
    turnId: text(),
    itemId: text(),
    messageAt: integer({ mode: 'timestamp_ms' }).notNull(),
    seq: integer().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('codex_chat_message_tenant_thread_seq_unique').on(t.tenantId, t.threadId, t.seq),
    index('codex_chat_message_idx_tenant').on(t.tenantId),
    index('codex_chat_message_idx_thread_messageat').on(t.tenantId, t.threadId, t.messageAt),
    index('codex_chat_message_idx_project_messageat').on(t.tenantId, t.projectId, t.messageAt),
  ]
)

export type IdbCodexChatMessageDrizzleSqlite = InferSelectModel<typeof codexChatMessageTableSqlite>
export type CodexChatMessageColumnsDrizzleSqlite = keyof IdbCodexChatMessageDrizzleSqlite
