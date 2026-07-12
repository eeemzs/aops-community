import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { projectTable } from '../../project/drizzle/drizzle.schema.project.js'

export const agentProfileTable = pgTable(
  'agent-profiles',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    projectId: uuid().references(() => projectTable.id, { onDelete: 'set null' }),
    slug: text().notNull(),
    name: text().notNull(),
    role: text().notNull(),
    version: integer(),
    kind: text(),
    defaultAgents: jsonb().$type<string[]>(),
    capabilities: jsonb().$type<string[]>(),
    allowedSurfaces: jsonb().$type<string[]>(),
    requiresApprovalFor: jsonb().$type<string[]>(),
    promptRef: text(),
    skillRefs: jsonb().$type<string[]>(),
    resourceRefs: jsonb().$type<string[]>(),
    overlayRefs: jsonb().$type<string[]>(),
    additionalContextRefs: jsonb().$type<string[]>(),
    body: text(),
    tags: jsonb().$type<string[]>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('agent_profile_tenant_scope_slug_unique').on(t.tenantId, t.scopeId, t.slug),
    index('agent_profile_idx_tenant').on(t.tenantId),
    index('agent_profile_idx_scope_role').on(t.tenantId, t.scopeId, t.role),
    index('agent_profile_idx_scope_updated').on(t.tenantId, t.scopeId, t.updatedAt),
  ],
)

export type IdbAgentProfileDrizzle = InferSelectModel<typeof agentProfileTable>
export type AgentProfileColumnsDrizzle = keyof IdbAgentProfileDrizzle
