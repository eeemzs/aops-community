import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const skillTable = pgTable(
  'skills',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    name: text().notNull(),
    description: text(),
    shortDescription: text(),
    tags: jsonb().$type<string[]>(),
    currentVersionId: uuid(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('skill_scope_name_tenant_unique').on(t.tenantId, t.scopeId, t.name),
    index('skill_idx_tenant').on(t.tenantId),
    index('skill_idx_scope').on(t.tenantId, t.scopeId),
  ]
)

export type IdbSkillDrizzle = InferSelectModel<typeof skillTable>;
export type SkillColumnsDrizzle = keyof IdbSkillDrizzle;
