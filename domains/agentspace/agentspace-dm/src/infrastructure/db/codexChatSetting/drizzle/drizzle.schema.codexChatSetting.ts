import { boolean, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const codexChatSettingTable = pgTable(
  'codex-chat-settings',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    projectId: uuid().notNull(),
    userId: text().notNull(),
    binaryPath: text(),
    model: text(),
    modelProvider: text(),
    reasoningEffort: text(),
    profile: text(),
    serviceTier: text(),
    personality: text(),
    approvalsReviewer: text(),
    executionMode: text().notNull(),
    sandboxMode: text().notNull(),
    manualCwd: text(),
    autoStart: boolean(),
    persistExtendedHistory: boolean(),
    experimentalApi: boolean(),
    optOutNotificationMethods: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('codex_chat_setting_tenant_project_user_unique').on(t.tenantId, t.projectId, t.userId),
    index('codex_chat_setting_idx_tenant').on(t.tenantId),
    index('codex_chat_setting_idx_project_user').on(t.tenantId, t.projectId, t.userId),
  ]
)

export type IdbCodexChatSettingDrizzle = InferSelectModel<typeof codexChatSettingTable>
export type CodexChatSettingColumnsDrizzle = keyof IdbCodexChatSettingDrizzle
