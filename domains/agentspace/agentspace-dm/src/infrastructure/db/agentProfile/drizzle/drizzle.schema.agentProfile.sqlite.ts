import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const agentProfileTableSqlite = sqliteTable(
  'agent-profiles',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    projectId: text(),
    slug: text().notNull(),
    name: text().notNull(),
    role: text().notNull(),
    version: integer(),
    kind: text(),
    defaultAgents: text({ mode: 'json' }).$type<string[]>(),
    capabilities: text({ mode: 'json' }).$type<string[]>(),
    allowedSurfaces: text({ mode: 'json' }).$type<string[]>(),
    requiresApprovalFor: text({ mode: 'json' }).$type<string[]>(),
    promptRef: text(),
    skillRefs: text({ mode: 'json' }).$type<string[]>(),
    resourceRefs: text({ mode: 'json' }).$type<string[]>(),
    overlayRefs: text({ mode: 'json' }).$type<string[]>(),
    additionalContextRefs: text({ mode: 'json' }).$type<string[]>(),
    body: text(),
    tags: text({ mode: 'json' }).$type<string[]>(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('agent_profile_tenant_scope_slug_unique').on(t.tenantId, t.scopeId, t.slug),
    index('agent_profile_idx_tenant').on(t.tenantId),
    index('agent_profile_idx_scope_role').on(t.tenantId, t.scopeId, t.role),
    index('agent_profile_idx_scope_updated').on(t.tenantId, t.scopeId, t.updatedAt),
  ],
)

export type IdbAgentProfileDrizzleSqlite = InferSelectModel<typeof agentProfileTableSqlite>
export type AgentProfileColumnsDrizzleSqlite = keyof IdbAgentProfileDrizzleSqlite
