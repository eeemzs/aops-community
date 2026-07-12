import { domainTableName } from '../../domain-naming.js'
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'

export const microTaskItemTable = pgTable(
  domainTableName('projectman-sprint-microtasks'),
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    phaseId: uuid().notNull(),
    title: text().notNull(),
    status: text().notNull(),
    position: integer().notNull(),
    notes: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow().$onUpdateFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('projectman_sprint_microtask_position_unique').on(t.tenantId, t.phaseId, t.position),
    index('projectman_sprint_microtask_idx_tenant').on(t.tenantId),
    index('projectman_sprint_microtask_idx_phase').on(t.tenantId, t.phaseId),
  ]
)

export type IdbMicroTaskItemDrizzle = InferSelectModel<typeof microTaskItemTable>;
export type MicroTaskItemColumnsDrizzle = keyof IdbMicroTaskItemDrizzle;
