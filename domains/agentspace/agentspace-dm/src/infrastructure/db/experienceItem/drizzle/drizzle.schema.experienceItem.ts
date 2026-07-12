import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const experienceItemTable = pgTable(
  'experience-items',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    type: text().notNull(),
    title: text().notNull(),
    problem: text(),
    solution: text(),
    content: text().notNull(),
    areas: jsonb().$type<string[]>(),
    stack: jsonb().$type<string[]>(),
    commands: jsonb().$type<string[]>(),
    files: jsonb().$type<string[]>(),
    sourceRefs: jsonb().$type<unknown[]>(),
    tags: jsonb().$type<string[]>(),
    confidence: text(),
    reusability: text(),
    meta: jsonb(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('experience_item_idx_tenant').on(t.tenantId),
    index('experience_item_idx_scope').on(t.tenantId, t.scopeId),
    index('experience_item_idx_type').on(t.tenantId, t.type),
  ],
)

export type IdbExperienceItemDrizzle = InferSelectModel<typeof experienceItemTable>
export type ExperienceItemColumnsDrizzle = keyof IdbExperienceItemDrizzle
