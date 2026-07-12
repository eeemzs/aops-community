import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const codexChatThreadTableSqlite = sqliteTable(
  'codex-chat-threads',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    externalThreadId: text().notNull(),
    scopeLabel: text(),
    cwd: text(),
    title: text(),
    tags: text({ mode: 'json' }).$type<string[]>(),
    lastPrompt: text(),
    lastAssistant: text(),
    tokenInput: integer(),
    tokenOutput: integer(),
    tokenTotal: integer(),
    lastMessageAt: integer({ mode: 'timestamp_ms' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('codex_chat_thread_tenant_scope_external_unique').on(
      t.tenantId,
      t.scopeId,
      t.externalThreadId
    ),
    index('codex_chat_thread_idx_tenant').on(t.tenantId),
    index('codex_chat_thread_idx_scope_updated').on(t.tenantId, t.scopeId, t.updatedAt),
    
  ]
)

export type IdbCodexChatThreadDrizzleSqlite = InferSelectModel<typeof codexChatThreadTableSqlite>
export type CodexChatThreadColumnsDrizzleSqlite = keyof IdbCodexChatThreadDrizzleSqlite
