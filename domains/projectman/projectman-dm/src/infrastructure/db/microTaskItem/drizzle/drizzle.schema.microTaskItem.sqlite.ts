import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
export const microTaskItemTableSqlite = sqliteTable(
  domainTableName('projectman-sprint-microtasks'),
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    phaseId: text().notNull(),
    title: text().notNull(),
    status: text().notNull(),
    position: integer().notNull(),
    notes: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('projectman_sprint_microtask_position_unique').on(t.tenantId, t.phaseId, t.position),
    index('projectman_sprint_microtask_idx_tenant').on(t.tenantId),
    index('projectman_sprint_microtask_idx_phase').on(t.tenantId, t.phaseId),
  ]
)

export type IdbMicroTaskItemDrizzleSqlite = InferSelectModel<typeof microTaskItemTableSqlite>
export type MicroTaskItemColumnsDrizzleSqlite = keyof IdbMicroTaskItemDrizzleSqlite
