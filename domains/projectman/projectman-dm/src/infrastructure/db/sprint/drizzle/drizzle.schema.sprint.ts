import { domainTableName } from '../../domain-naming.js'
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const sprintTable = pgTable(
  domainTableName('projectman-sprints'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    kanbanTaskId: uuid().notNull(),
    name: text().notNull(),
    goal: text().notNull(),
    references: jsonb().$type<string[]>(),
    scope: jsonb().$type<string[]>(),
    validationPlan: jsonb().$type<string[]>(),
    notes: text(),
    archivedAt: timestamp({ withTimezone: true }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    index('projectman_sprint_idx_tenant').on(t.tenantId),
    index('projectman_sprint_idx_scope').on(t.tenantId, t.scopeId),
    index('projectman_sprint_idx_kanban_task').on(t.tenantId, t.kanbanTaskId),
  ]
)

export type IdbSprintDrizzle = InferSelectModel<typeof sprintTable>;
export type SprintColumnsDrizzle = keyof IdbSprintDrizzle;
