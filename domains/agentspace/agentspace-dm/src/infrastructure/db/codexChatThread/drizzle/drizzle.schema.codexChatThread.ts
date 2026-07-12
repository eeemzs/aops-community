import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const codexChatThreadTable = pgTable(
  'codex-chat-threads',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    externalThreadId: text().notNull(),
    scopeLabel: text(),
    cwd: text(),
    title: text(),
    tags: jsonb().$type<string[]>(),
    lastPrompt: text(),
    lastAssistant: text(),
    tokenInput: integer(),
    tokenOutput: integer(),
    tokenTotal: integer(),
    lastMessageAt: timestamp({ withTimezone: true }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
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

export type IdbCodexChatThreadDrizzle = InferSelectModel<typeof codexChatThreadTable>
export type CodexChatThreadColumnsDrizzle = keyof IdbCodexChatThreadDrizzle
