import { domainTableName } from '../../domain-naming.js'
import { InferSelectModel } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export type IdbCounterDrizzlePg = InferSelectModel<typeof pgCounter>

export type CounterColumns = keyof IdbCounterDrizzlePg

export const pgCounter = pgTable(
  domainTableName('counters'),
  {
    id: uuid().primaryKey().defaultRandom(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
    tenantId: uuid().notNull(),
    scopeId: text().notNull().default('default'),
    counterKey: text().notNull(),
    prefix: text(),
    width: integer().notNull().default(5),
    nextValue: integer().notNull().default(1),
    step: integer().notNull().default(1),
    lastValue: integer(),
    lastFormattedValue: text(),
    metadataJson: jsonb(),
  },
  (table) => [
    uniqueIndex('sys_counter_tenant_scope_key_uidx').on(table.tenantId, table.scopeId, table.counterKey),
    index('sys_counter_tenant_scope_idx').on(table.tenantId, table.scopeId),
  ],
)
