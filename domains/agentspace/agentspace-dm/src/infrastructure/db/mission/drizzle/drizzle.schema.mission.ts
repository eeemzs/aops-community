import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const missionTable = pgTable(
  'missions',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    slug: text(),
    status: text().notNull(),
    objective: text().notNull(),
    taskDefinition: text(),
    successCriteria: jsonb().$type<string[]>(),
    constraints: jsonb().$type<string[]>(),
    policy: jsonb(),
    roles: jsonb(),
    references: jsonb(),
    visionDocRef: jsonb(),
    activeImplementationPlanRef: jsonb(),
    lineage: jsonb(),
    sourceTemplateRef: jsonb(),
    bodyMarkdown: text(),
    meta: jsonb(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('mission_scope_slug_unique').on(t.tenantId, t.scopeId, t.slug),
    index('mission_idx_tenant').on(t.tenantId),
    index('mission_idx_scope').on(t.tenantId, t.scopeId),
    index('mission_idx_status').on(t.tenantId, t.scopeId, t.status),
  ]
)

export type IdbMissionDrizzle = InferSelectModel<typeof missionTable>;
export type MissionColumnsDrizzle = keyof IdbMissionDrizzle;
