/**
 * Event Store Test Configuration
 *
 * Follows the same pattern as rateLimiter test config for consistency.
 * Supports multiple repository types: mongo, postgres, redis
 * Provides factory helpers for creating test bundles.
 */

import { XfLogger } from '@aopslab/xf-logger';
import { Effect } from 'effect'
import { RepositoryConfig, RedisConnectionConfig } from '@aopslab/xf-db';
import { config as dotenvConfig } from 'dotenv';
import { DEFAULT_TENANT_AS_UUID_STRING } from '@aopslab/xf-core';
import { randomUUID } from 'crypto';
import { RedisAdapterConfig } from '@aopslab/xf-db-redis';

// Application layer imports
import { IRepositoryPortEventStore } from '../../application/ports/repository-ports/IRepositoryPortEventStore.js';
import { IEventStoreServicePort } from '../../application/ports/inbound/IEventStoreServicePort.js';
import { EventStoreRepositoryFactory } from '../../application/factories/RepositoryFactoryEventStore.js';

// Domain imports
import { IbmEventStore } from '../../domain/models/index.js';
import { ServiceBuilderEventStore } from '../../application/factories/ServiceEventStoreBuilder.js';

// Load environment variables
dotenvConfig({ path: '.env' });

export const TEST_DB_MONGODB_URI = process.env.MONGODB_URL_LOCAL;
export const TEST_DB_POSTGRESQL_URI = process.env.POSTGRES_URL_LOCAL_SMWEB_2504;
export const TEST_DB_REDIS_URI = process.env.REDIS_URL; // REDIS_URL_LOCAL
export const TEST_DB_UPSTASH_URL = process.env.UPSTASH_REDIS_URL;

// Test constants
export const TEST_TENANT_ID = DEFAULT_TENANT_AS_UUID_STRING;
export const TEST_USER_ID = 'test-user-123';
export const TEST_USER_EMAIL = 'test@example.com';
export const TEST_AGGREGATE_ID = 'test-aggregate-456';

export const TEST_EVENT_TYPES = {
  USER_REGISTERED: 'user-registered',
  ORDER_PLACED: 'order-placed',
  PAYMENT_PROCESSED: 'payment-processed'
} as const;

// Test constants helpers
export function getTestTenantId(): string {
  return TEST_TENANT_ID;
}

export function getTestUserId(): string {
  return TEST_USER_ID;
}

export function getTestUserEmail(): string {
  return TEST_USER_EMAIL;
}

export function getTestAggregateId(): string {
  return TEST_AGGREGATE_ID;
}

// Bundle interface - Following config.ts pattern
export interface EventStoreBundle {
  service: IEventStoreServicePort;
  repository: IRepositoryPortEventStore;
}

// Main Service Factory Helper - Following config.ts pattern
export async function createEventStoreServiceBundle(
  opt: {
    repositoryConfig: RepositoryConfig;
    logLevel?: string;
  },
  logger?: XfLogger
): Promise<EventStoreBundle> {
  if (!opt.repositoryConfig.url) {
    throw new Error('Repository URL is required');
  }

  // Create repository first
  const eventStoreRepository = await createRepositoryPortEventStore(opt.repositoryConfig, logger);

  // Use new builder pattern with Redis config support
  const eventStoreServicePort = await Effect.runPromise(
    ServiceBuilderEventStore.create()
    .withConfig({
      redisConfig: {
        connection: getTestRedisConnectionConfig(opt.repositoryConfig.url),
        adapter: getTestRedisAdapterConfig()
      },
      options: {
        locale: 'en',
        fallbackLocale: 'en'
      },
      logger
    })
    .withRepository(eventStoreRepository)
    .withLogLevel(opt.logLevel)
    .build()
  );

  return {
    service: eventStoreServicePort,
    repository: eventStoreRepository
  };
}

/**
 * Repository Factory Helper - Creates event store repository (Following config.ts pattern)
 */
export async function createRepositoryPortEventStore(
  repositoryConfig: RepositoryConfig,
  logger?: XfLogger
): Promise<IRepositoryPortEventStore> {
  if (!repositoryConfig.url) {
    throw new Error('Repository URL is required');
  }

  // Add tenantId to repository config
  const configWithTenant = {
    ...repositoryConfig,
    tenantId: TEST_TENANT_ID
  };

  try {
    let redisConfig = undefined;

    // Only create Redis config if it's a Redis repository
    if (repositoryConfig.repositoryType === 'redis') {
      redisConfig = {
        connection: getTestRedisConnectionConfig(repositoryConfig.url),
        adapter: getTestRedisAdapterConfig()
      };
    }

    const repository = await Effect.runPromise(
      EventStoreRepositoryFactory.create({
        repositoryConfig: configWithTenant as RepositoryConfig,
        redisConfig
      })
    );
    return repository;
  } catch (error) {
    // Fail fast if repository creation fails - don't retry in tests
    const errorMessage = error instanceof Error ? error.message : 'Exception in createRepositoryPortEventStore';
    if (logger && typeof (logger as any).error === 'function') {
      (logger as any).error({ errorMessage, repositoryConfig }, 'Event store repository creation failed');
    } else {
      console.error('Event store repository creation failed', { errorMessage, repositoryConfig });
    }

    // Re-throw with clear test context
    throw new Error(`Failed to create event store test repository (${repositoryConfig.repositoryType}): ${errorMessage}`);
  }
}

// Event Store Options Helper - Following config.ts pattern
export function getEventStoreOptions() {
  return {
    enablePubSub: true,
    enableEventSourcing: true,
    maxEventLimit: 1000
  };
}

// Redis Configuration Helpers (Following config.ts pattern)
export function getTestRedisAdapterConfig(): RedisAdapterConfig {
  return {
    commandRetryOptions: {
      maxRetries: 2,
      retryDelayMs: 1000,
      exponentialBackoff: false
    },
    defaultTtl: 60 // 1 minute for tests
  };
}

export function getTestRedisConnectionConfig(url: string): RedisConnectionConfig {
  return {
    url,
    connectTimeout: 1000,
    maxConnectionRetries: 1 // 0-> no retry, 1-> retry once, 2-> retry twice, etc.
  };
}

// Event Store Test Scopes - Following config.ts TEST_SCOPES pattern
export const TEST_EVENT_SCOPES = {
  USER_EVENTS: 'user-events',
  ORDER_EVENTS: 'order-events',
  PAYMENT_EVENTS: 'payment-events',
  SYSTEM_EVENTS: 'system-events'
} as const;

export type TestEventScope = (typeof TEST_EVENT_SCOPES)[keyof typeof TEST_EVENT_SCOPES];

/**
 * Create test UserRegisteredEvent (generic event store with user-registered type)
 */
export function createTestUserRegisteredEvent(overrides?: Partial<IbmEventStore>): IbmEventStore {
  return createTestEventStore({
    eventType: TEST_EVENT_TYPES.USER_REGISTERED,
    aggregateId: TEST_USER_ID,
    eventData: JSON.stringify({
      userId: TEST_USER_ID,
      email: TEST_USER_EMAIL
    }),
    ...overrides
  });
}

/**
 * Create generic test event store
 */
export function createTestEventStore(overrides?: Partial<IbmEventStore>): IbmEventStore {
  const now = new Date();
  return {
    eventId: randomUUID(), // ✅ EventStore specific ID
    eventType: 'test-event',
    aggregateId: TEST_AGGREGATE_ID,
    eventData: JSON.stringify({ testData: 'test-value' }),
    version: 1,
    occurredAt: now,
    tenantId: TEST_TENANT_ID,
    createdAt: now,
    updatedAt: now,
    ...overrides
    // Note: 'id' field will be auto-generated by Redis repo if not provided
  };
}

/**
 * Create test event with specific version for ordering tests
 */
export function createTestEventWithVersion(version: number, overrides?: Partial<IbmEventStore>): IbmEventStore {
  const baseEvent = createTestEventStore(overrides);
  return {
    ...baseEvent,
    version,
    occurredAt: new Date(Date.now() + version * 1000) // Each version 1 second apart
  };
}
