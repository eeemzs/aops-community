import { domainTableName } from '../../domain-naming.js'
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const kanbanTaskTable = pgTable(
  domainTableName('kanban-tasks'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    boardId: uuid().notNull(),
    boardColumnId: uuid().notNull(),
    sprintId: uuid(),
    title: text().notNull(),
    taskCode: text(),
    slug: text(),
    description: text(),
    progress: integer().notNull().default(0),
    position: integer().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('kanban_task_position_unique').on(t.tenantId, t.boardColumnId, t.position),
    index('kanban_task_idx_tenant').on(t.tenantId),
    index('kanban_task_idx_scope').on(t.tenantId, t.scopeId),
    index('kanban_task_idx_board').on(t.tenantId, t.boardId),
    index('kanban_task_idx_board_column').on(t.tenantId, t.boardColumnId),
    index('kanban_task_idx_sprint').on(t.tenantId, t.sprintId),
    uniqueIndex('kanban_task_scope_code_unique').on(t.tenantId, t.scopeId, t.taskCode),
    uniqueIndex('kanban_task_scope_slug_unique').on(t.tenantId, t.scopeId, t.slug),
  ]
)

export type IdbKanbanTaskDrizzle = InferSelectModel<typeof kanbanTaskTable>;
export type KanbanTaskColumnsDrizzle = keyof IdbKanbanTaskDrizzle;
