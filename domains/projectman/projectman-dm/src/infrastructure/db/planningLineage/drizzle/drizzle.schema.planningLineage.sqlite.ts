import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { domainTableName } from '../../domain-naming.js'

export const planningLineageTableSqlite = sqliteTable(
  domainTableName('planning-lineages'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    projectId: text().notNull(),
    operation: text().notNull(),
    sourceType: text().notNull(),
    sourceId: text().notNull(),
    targetType: text().notNull(),
    targetId: text().notNull(),
    copyDepth: text(),
    sourceProjectId: text(),
    targetProjectId: text(),
    details: text({ mode: 'json' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index('planning_lineage_idx_tenant').on(t.tenantId),
    index('planning_lineage_idx_scope').on(t.tenantId, t.scopeId),
    index('planning_lineage_idx_project').on(t.tenantId, t.projectId),
    index('planning_lineage_idx_operation').on(t.tenantId, t.operation),
    index('planning_lineage_idx_source').on(t.tenantId, t.sourceType, t.sourceId),
    index('planning_lineage_idx_target').on(t.tenantId, t.targetType, t.targetId),
    index('planning_lineage_idx_created_at').on(t.tenantId, t.createdAt),
  ]
)

export type IdbPlanningLineageDrizzleSqlite = InferSelectModel<typeof planningLineageTableSqlite>
export type PlanningLineageColumnsDrizzleSqlite = keyof IdbPlanningLineageDrizzleSqlite
