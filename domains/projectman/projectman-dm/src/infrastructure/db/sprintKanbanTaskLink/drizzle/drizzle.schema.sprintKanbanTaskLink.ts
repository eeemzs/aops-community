import { domainTableName } from '../../domain-naming.js'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const sprintKanbanTaskLinkTable = pgTable(
  domainTableName('projectman-sprint-kanban-tasks'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    projectId: uuid().notNull(),
    sprintId: uuid().notNull(),
    kanbanTaskId: uuid().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('projectman_sprint_kanban_task_unique').on(t.tenantId, t.sprintId, t.kanbanTaskId),
    index('projectman_sprint_kanban_task_idx_tenant').on(t.tenantId),
    index('projectman_sprint_kanban_task_idx_scope').on(t.tenantId, t.scopeId),
    index('projectman_sprint_kanban_task_idx_project').on(t.tenantId, t.projectId),
    index('projectman_sprint_kanban_task_idx_sprint').on(t.tenantId, t.sprintId),
    index('projectman_sprint_kanban_task_idx_task').on(t.tenantId, t.kanbanTaskId),
  ]
)

export type IdbSprintKanbanTaskLinkDrizzle = InferSelectModel<typeof sprintKanbanTaskLinkTable>;
export type SprintKanbanTaskLinkColumnsDrizzle = keyof IdbSprintKanbanTaskLinkDrizzle;
