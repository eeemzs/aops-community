import { domainTableName } from '../../domain-naming.js'
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const sprintGroupTable = pgTable(
  domainTableName('projectman-sprint-phases'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    sprintId: uuid().notNull(),
    name: text().notNull(),
    description: text(),
    position: integer().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('projectman_sprint_phase_position_unique').on(t.tenantId, t.sprintId, t.position),
    index('projectman_sprint_phase_idx_tenant').on(t.tenantId),
    index('projectman_sprint_phase_idx_sprint').on(t.tenantId, t.sprintId),
  ]
)

export type IdbSprintGroupDrizzle = InferSelectModel<typeof sprintGroupTable>;
export type SprintGroupColumnsDrizzle = keyof IdbSprintGroupDrizzle;
