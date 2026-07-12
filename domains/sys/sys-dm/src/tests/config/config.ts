import { RedisConnectionConfig, RepositoryConfig, RepositoryType } from '@aopslab/xf-db';
import { Effect } from 'effect'
import { config as dotenvConfig } from 'dotenv';
import { XfLogger } from '@aopslab/xf-logger';
import { RedisProviderType, RedisConfig, RedisAdapterConfig } from '@aopslab/xf-db-redis';
import { IRepositoryPortRateLimiter } from '../../application/ports/repository-ports/IRepositoryPortRateLimiter.js';
import { RateLimitRule } from '../../application/ports/types.js';
import { IRateLimiterServicePort } from '../../application/ports/inbound/IRateLimiterServicePort.js';
import { DEFAULT_TENANT_AS_UUID_STRING } from '@aopslab/xf-core';
import { RateLimiterRepositoryFactory } from '../../application/factories/RepositoryFactoryRateLimiter.js';
import { ServiceFactoryRateLimiter } from '../../application/factories/ServiceRateLimiterFactory.js';

// Load environment variables
dotenvConfig({ path: '.env' });

// Constants
export const TEST_DB_MONGODB_URI = process.env.MONGODB_URL_LOCAL;
export const TEST_DB_POSTGRESQL_URI = process.env.POSTGRES_URL_LOCAL_SMWEB_2504;
export const TEST_DB_REDIS_URI = process.env.REDIS_URL; //REDIS_URL_LOCAL
export const TEST_DB_UPSTASH_URL = process.env.UPSTASH_REDIS_URL;

export const TEST_TENANT_ID = DEFAULT_TENANT_AS_UUID_STRING;
export const TEST_USER_EMAIL = 'user@acme.com';
export const TEST_USER_IP = '192.168.1.100';
export const TEST_API_KEY = 'api_key_test_12345';

export const testRepositoryType: RepositoryType = 'drizzle';
export const testRedisProviderType: RedisProviderType = 'redis';

export interface RateLimiterBundle {
  service: IRateLimiterServicePort;
  repository: IRepositoryPortRateLimiter;
}

// Main Service Factory Helper - Updated for new builder pattern
export async function createRateLimiterServiceBundle(
  opt: {
    repositoryConfig: RepositoryConfig;
    logLevel?: string;
  },
  logger?: XfLogger
): Promise<RateLimiterBundle> {
  if (!opt.repositoryConfig.url) {
    throw new Error('Repository URL is required');
  }

  // Create repository first
  const rateLimiterRepository = await createRepositoryPortRateLimiter(opt.repositoryConfig, logger);

  // Use new builder pattern
  const serviceRateLimiterPort = await Effect.runPromise(
    ServiceFactoryRateLimiter.builder()
    .withConfig({
      redisConfig: {
        connection: getTestRedisConnectionConfig(opt.repositoryConfig.url),
        adapter: getTestRedisAdapterConfig()
      },
      options: {
        locale: 'en',
        fallbackLocale: 'en'
      }
    })
    .withRepository(rateLimiterRepository)
    .withLogLevel(opt.logLevel)
    .build()
  );

  return {
    service: serviceRateLimiterPort,
    repository: rateLimiterRepository
  };
}

// Repository Factory Helper - Updated to use proper parameters
export async function createRepositoryPortRateLimiter(repositoryConfig: RepositoryConfig, logger?: XfLogger) {
  if (!repositoryConfig.url) {
    throw new Error('Repository URL is required');
  }

  // Add tenantId to repository config
  const configWithTenant = {
    ...repositoryConfig,
    tenantId: TEST_TENANT_ID
  };

  try {
    let redisConfig: RedisConfig | undefined;

    // Only create Redis config if it's a Redis repository
    if (repositoryConfig.repositoryType === 'redis') {
      redisConfig = {
        connection: getTestRedisConnectionConfig(repositoryConfig.url),
        adapter: getTestRedisAdapterConfig()
      };
    }

    const repository = await Effect.runPromise(
      RateLimiterRepositoryFactory.create({
        repositoryConfig: configWithTenant,
        redisConfig
      })
    );

    return repository;
  } catch (error) {
    // Fail fast if Redis connection fails - don't retry in tests
    const errorMessage = error instanceof Error ? error.message : 'Exception in createRepositoryPortRateLimiter';
    if (logger && typeof (logger as any).error === 'function') {
      (logger as any).error({ errorMessage, repositoryConfig }, 'Repository creation failed');
    } else {
      console.error('Repository creation failed', { errorMessage, repositoryConfig });
    }

    // Re-throw with clear test context
    throw new Error(`Failed to create test repository (${repositoryConfig.repositoryType}): ${errorMessage}`);
  }
}

// Redis Adapter Config Helper
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

// Redis Connection Config Helper
export function getTestRedisConnectionConfig(url: string): RedisConnectionConfig {
  return {
    url,
    connectTimeout: 1000,
    maxConnectionRetries: 1 // 0-> no retry(connection will fail if it fails), 1-> retry once, 2-> retry twice, etc.
    // keepAlive: 30000,
  };
}

export function getRateLimiterOptions(): RateLimitRule {
  return {
    maxAttempts: 3,
    blockDurationInSeconds: 60 // 60 seconds for tests
  };
}

// Test Data Helpers
export function getTestUserEmail(): string {
  return TEST_USER_EMAIL;
}

export function getTestUserIp(): string {
  return TEST_USER_IP;
}

export function getTestApiKey(): string {
  return TEST_API_KEY;
}

export function getTestTenantId(): string {
  return TEST_TENANT_ID;
}

// Rate Limiter Scopes for Testing
export const TEST_SCOPES = {
  LOGIN: 'login'
  //REGISTER: 'register',
  // API_CALL: 'api_call',
  //PASSWORD_RESET: 'password_reset',
  //EMAIL_VERIFICATION: 'email_verification',
} as const;

export type TestScope = (typeof TEST_SCOPES)[keyof typeof TEST_SCOPES];
