import { domainTableName } from '../../domain-naming.js'
import { pgTable, text, timestamp, uuid, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { InferSelectModel } from 'drizzle-orm';

// See drizzle.config.ts
// cd libs/domains/sys
// npx drizzle-kit generate
// npx drizzle-kit migrate
// npx drizzle-kit push

export type IdbEventStoreDrizzlePg = InferSelectModel<typeof pgEventStore>;

export type EventStoreColumns = keyof IdbEventStoreDrizzlePg;

export const pgEventStore = pgTable(
  domainTableName('event_stores'),
  {
    id: uuid().primaryKey().defaultRandom(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
    tenantId: uuid().notNull(),
    eventId: uuid().notNull().defaultRandom(),

    // Event Store specific fields
    eventType: text().notNull(), // Event türü (örn: 'UserCreated', 'OrderPlaced')
    aggregateId: text().notNull(), // Hangi entity ile ilgili (örn: userId, orderId)
    eventData: text().notNull(), // JSON string olarak event verisi
    version: integer().notNull().default(1), // Event versiyonu (sıralama için)
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow() // Event ne zaman oldu
  },
  (table) => [
    // Create indexes for efficient querying
    uniqueIndex('idxEventIdUnique').on(table.eventId),
    index('idxTenantEventType').on(table.tenantId, table.eventType),
    index('idxTenantAggregate').on(table.tenantId, table.aggregateId),
    index('idxTenantOccurredAt').on(table.tenantId, table.occurredAt),
    index('idxEventTypeOccurredAt').on(table.eventType, table.occurredAt),
    index('idxAggregateVersion').on(table.aggregateId, table.version)
  ]
);
