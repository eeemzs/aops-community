import { domainTableName } from '../../domain-naming.js'
import { pgTable, text, timestamp, uuid, integer, uniqueIndex } from 'drizzle-orm/pg-core';
import { InferSelectModel } from 'drizzle-orm';

// See drizzle.config.ts
// cd libs/domain/auth
// npx drizzle-kit generate
// npx drizzle-kit migrate
// npx drizzle-kit push

export type IdbRateLimiterDrizzlePg = InferSelectModel<typeof pgRateLimiter>;

export type RateLimiterColumns = keyof IdbRateLimiterDrizzlePg;

export const pgRateLimiter = pgTable(
  domainTableName('rate_limiters'),
  {
    id: uuid().primaryKey().defaultRandom(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
    tenantId: uuid().notNull(),
    key: text().notNull(),
    scope: text().notNull(), // 'login', 'register'
    attempts: integer().notNull().default(0), // Number of attempts in the current window
    windowStart: timestamp({ withTimezone: true }), // nullable
    resetAt: timestamp({ withTimezone: true }), // nullable
    blockedAt: timestamp({ withTimezone: true }), // nullable
    violationStreak: integer().notNull().default(0),
    lastViolationAt: timestamp({ withTimezone: true }) // nullable
  },
  (table) => [
    // Compound index for efficient lookups by tenant, key and type
    uniqueIndex('rate_limiter_tenant_key_type_idx').on(table.tenantId, table.key, table.scope)
  ]
);
