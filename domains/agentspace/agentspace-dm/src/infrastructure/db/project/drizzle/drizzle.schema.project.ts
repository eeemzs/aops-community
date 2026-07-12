import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { scopeTable } from '../../scope/drizzle/drizzle.schema.scope.js'

export const projectTable = pgTable(
  'projects',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid()
      .notNull()
      .references(() => scopeTable.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    description: text(),
    tags: jsonb().$type<string[]>(),
    slug: text(),
    status: text(),
    visibility: text(),
    projectType: text(),
    ownerId: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('project_scope_unique').on(t.scopeId),
    uniqueIndex('project_slug_tenant_unique').on(t.tenantId, t.slug),
    index('project_idx_tenant').on(t.tenantId),
  ]
)

export type IdbProjectDrizzle = InferSelectModel<typeof projectTable>;
export type ProjectColumnsDrizzle = keyof IdbProjectDrizzle;
