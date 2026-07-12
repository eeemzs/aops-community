import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const promptTable = pgTable(
  'prompts',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    name: text().notNull(),
    description: text(),
    tags: jsonb().$type<string[]>(),
    status: text().notNull().default('draft'),
    currentVersionId: uuid(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('prompt_scope_name_tenant_unique').on(t.tenantId, t.scopeId, t.name),
    index('prompt_idx_tenant').on(t.tenantId),
    index('prompt_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbPromptDrizzle = InferSelectModel<typeof promptTable>;
export type PromptColumnsDrizzle = keyof IdbPromptDrizzle;
