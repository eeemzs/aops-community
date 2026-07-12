import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const missionTableSqlite = sqliteTable(
  'missions',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    slug: text(),
    status: text().notNull(),
    objective: text().notNull(),
    taskDefinition: text(),
    successCriteria: text({ mode: 'json' }).$type<string[]>(),
    constraints: text({ mode: 'json' }).$type<string[]>(),
    policy: text({ mode: 'json' }),
    roles: text({ mode: 'json' }),
    references: text({ mode: 'json' }),
    visionDocRef: text({ mode: 'json' }),
    activeImplementationPlanRef: text({ mode: 'json' }),
    lineage: text({ mode: 'json' }),
    sourceTemplateRef: text({ mode: 'json' }),
    bodyMarkdown: text(),
    meta: text({ mode: 'json' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('mission_scope_slug_unique').on(t.tenantId, t.scopeId, t.slug),
    index('mission_idx_tenant').on(t.tenantId),
    index('mission_idx_scope').on(t.tenantId, t.scopeId),
    index('mission_idx_status').on(t.tenantId, t.scopeId, t.status),
  ]
)

export type IdbMissionDrizzleSqlite = InferSelectModel<typeof missionTableSqlite>;
export type MissionColumnsDrizzleSqlite = keyof IdbMissionDrizzleSqlite;
