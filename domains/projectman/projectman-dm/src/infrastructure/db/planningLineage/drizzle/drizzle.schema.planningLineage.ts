import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { domainTableName } from '../../domain-naming.js'

export const planningLineageTable = pgTable(
  domainTableName('planning-lineages'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    projectId: uuid().notNull(),
    operation: text().notNull(),
    sourceType: text().notNull(),
    sourceId: text().notNull(),
    targetType: text().notNull(),
    targetId: text().notNull(),
    copyDepth: text(),
    sourceProjectId: uuid(),
    targetProjectId: uuid(),
    details: jsonb(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
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

export type IdbPlanningLineageDrizzle = InferSelectModel<typeof planningLineageTable>
export type PlanningLineageColumnsDrizzle = keyof IdbPlanningLineageDrizzle
