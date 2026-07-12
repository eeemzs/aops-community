import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
export const sprintGroupTableSqlite = sqliteTable(
  domainTableName('projectman-sprint-phases'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    sprintId: text().notNull(),
    name: text().notNull(),
    description: text(),
    position: integer().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('projectman_sprint_phase_position_unique').on(t.tenantId, t.sprintId, t.position),
    index('projectman_sprint_phase_idx_tenant').on(t.tenantId),
    index('projectman_sprint_phase_idx_sprint').on(t.tenantId, t.sprintId),
  ]
)

export type IdbSprintGroupDrizzleSqlite = InferSelectModel<typeof sprintGroupTableSqlite>
export type SprintGroupColumnsDrizzleSqlite = keyof IdbSprintGroupDrizzleSqlite
