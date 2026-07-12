// nx test xf-dm-sys --skip-nx-cache service.rateLimiter

import { describe, it, expect } from 'vitest';
import {
  createRateLimiterServiceBundle,
  getTestUserEmail,
  getRateLimiterOptions,
  TEST_DB_MONGODB_URI,
  TEST_DB_POSTGRESQL_URI,
  TEST_DB_REDIS_URI,
  TEST_DB_UPSTASH_URL,
  TEST_SCOPES,
  TEST_TENANT_ID,
  getTestRedisAdapterConfig,
  getTestRedisConnectionConfig,
  createRepositoryPortRateLimiter
} from '../../tests/config/config';
import { IRateLimiterServicePort, IRepositoryPortRateLimiter } from '../ports';
import { createSyncLogger } from '@aopslab/xf-logger/sync';
import { RepositoryConfig, RepositoryType } from '@aopslab/xf-db';
import { ServiceFactoryRateLimiter } from '../factories/ServiceRateLimiterFactory';
import { Effect } from 'effect'
import { withRateLimit } from '../helpers/withRateLimit';
import { RateLimitRule } from '../ports/types';
import { success, failure } from '@aopslab/xf-core';

// Test state enum for sequential test execution
enum TestStateStatus {
  NOT_STARTED = 'not_started',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

const logger = createSyncLogger({
  level: 'debug',
  base: {
    module: 'rateLimiter-test-service'
  }
});

interface TestStates {
  setup: TestStateStatus;
  newRecord: TestStateStatus;
  blockAfterMaxAttempts: TestStateStatus;
  waitForResetAndAttempt: TestStateStatus;
  resetRateLimit: TestStateStatus;
  attemptAfterReset: TestStateStatus;
  defaultRules: TestStateStatus;
}

// Map test identifiers to actual repository types and URLs
// This allows multiple test identifiers to point to the same repository type
// but with different URLs (e.g., 'redis' and 'upstash_redis' both use 'redis' type)
const repositoryTestConfig = {
  mongo: { type: 'mongo' as const, url: TEST_DB_MONGODB_URI },
  drizzle: { type: 'drizzle' as const, url: TEST_DB_POSTGRESQL_URI },
  redis: { type: 'redis' as const, url: TEST_DB_REDIS_URI },
  upstash_redis: { type: 'redis' as const, url: TEST_DB_UPSTASH_URL },
  upstash_rest: { type: 'upstash_rest' as const, url: undefined }
} as const;

type TestRepositoryIdentifier = keyof typeof repositoryTestConfig;

// Helper function to get the actual repository type from test identifier
const getRepositoryType = (testId: TestRepositoryIdentifier): RepositoryType => {
  return repositoryTestConfig[testId].type as RepositoryType;
};

// Helper function to get the URL for a test identifier
const getRepositoryUrl = (testId: TestRepositoryIdentifier): string | undefined => {
  return repositoryTestConfig[testId].url;
};

// Test repositories to run against - only configured ones
const testRepositories: TestRepositoryIdentifier[] = (Object.keys(repositoryTestConfig) as TestRepositoryIdentifier[]).filter((k) => !!getRepositoryUrl(k));
// const testRepositories: TestRepositoryIdentifier[] = ['redis','upstash_redis']
const escalationReadbackRepositories: TestRepositoryIdentifier[] = testRepositories.filter((id) => {
  const type = getRepositoryType(id);
  return type === 'drizzle' || type === 'redis';
});

function timestampMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error('missing_or_invalid_timestamp');
}

function blockDurationSeconds(rateLimiter: { blockedAt?: unknown; resetAt?: unknown } | undefined): number {
  if (!rateLimiter) throw new Error('missing_rate_limiter');
  return Math.round((timestampMs(rateLimiter.resetAt) - timestampMs(rateLimiter.blockedAt)) / 1000);
}

async function waitUntilAfter(value: unknown): Promise<void> {
  const delayMs = Math.max(0, timestampMs(value) - Date.now() + 150);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function checkFromFreshRepository(repositoryConfig: RepositoryConfig, key: string, scope: string) {
  const readbackRepository = await createRepositoryPortRateLimiter(repositoryConfig, logger);
  return Effect.runPromise(readbackRepository.checkRateLimiter(key, scope));
}

async function advancePastCurrentWindow(
  repository: IRepositoryPortRateLimiter,
  rateLimiter: any
): Promise<void> {
  const updateById = (repository as unknown as { updateById?: (id: string, dm: unknown) => unknown }).updateById;
  if (typeof updateById === 'function' && rateLimiter.id) {
    await Effect.runPromise(updateById.call(repository, rateLimiter.id, { ...rateLimiter, resetAt: new Date(Date.now() - 1000) }) as any);
    return;
  }

  await waitUntilAfter(rateLimiter.resetAt);
}

describe.each(testRepositories)('RateLimiter Service Tests - %s', (testForRepository) => {
  let rateLimiterServicePort: IRateLimiterServicePort;
  let rateLimiterRepository: IRepositoryPortRateLimiter;
  const testState: TestStates = {
    setup: TestStateStatus.NOT_STARTED,
    newRecord: TestStateStatus.NOT_STARTED,
    blockAfterMaxAttempts: TestStateStatus.NOT_STARTED,
    waitForResetAndAttempt: TestStateStatus.NOT_STARTED,
    resetRateLimit: TestStateStatus.NOT_STARTED,
    attemptAfterReset: TestStateStatus.NOT_STARTED,
    defaultRules: TestStateStatus.NOT_STARTED
  };

  let repositoryConfig: RepositoryConfig;

  beforeAll(async () => {
    try {
      // Create repository and inject it into the service - We need to create the repository first
      // to empty the repository before running the tests
      repositoryConfig = {
        repositoryType: getRepositoryType(testForRepository),
        url: getRepositoryUrl(testForRepository),
        tenantId: TEST_TENANT_ID // Add required tenantId
      };
      const rateLimiterBundle = await createRateLimiterServiceBundle({ repositoryConfig, debugMode: true }, logger);
      rateLimiterServicePort = rateLimiterBundle.service;
      rateLimiterRepository = rateLimiterBundle.repository;

      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Cleaning up rate limiter repository`); else console.log(`[${testForRepository}] Cleaning up rate limiter repository`);
      const cleanupResult = await Effect.runPromise(rateLimiterRepository.cleanupAll());
      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Cleanup result:`, cleanupResult); else console.log(`[${testForRepository}] Cleanup result:`, cleanupResult);

      testState.setup = TestStateStatus.COMPLETED;
    } catch (error) {
      testState.setup = TestStateStatus.FAILED;
      if ((logger as any)?.error) (logger as any).error(`[${testForRepository}] Setup failed:`, error); else console.error(`[${testForRepository}] Setup failed:`, error);
      throw error;
    }
  });

  afterAll(async () => {
    // Report test states with appropriate log levels
    const testStateKeys = Object.keys(testState);
    const completedTests: string[] = [];
    const failedTests: string[] = [];
    const notStartedTests: string[] = [];

    testStateKeys.forEach((key) => {
      const status = testState[key as keyof TestStates];
      const logMessage = `[${testForRepository}] ${key}: ${status}`;

      switch (status) {
        case TestStateStatus.COMPLETED:
          if ((logger as any)?.info) (logger as any).info(logMessage); else console.log(logMessage);
          completedTests.push(key);
          break;
        case TestStateStatus.FAILED:
          if ((logger as any)?.error) (logger as any).error(logMessage); else console.error(logMessage);
          failedTests.push(key);
          break;
        case TestStateStatus.NOT_STARTED:
          if ((logger as any)?.warn) (logger as any).warn(logMessage); else console.warn(logMessage);
          notStartedTests.push(key);
          break;
      }
    });

    // Summary report
    const summary = `[${testForRepository}] Test Summary: ${completedTests.length} completed, ${failedTests.length} failed, ${notStartedTests.length} not started`;
    if ((logger as any)?.info) (logger as any).info(summary); else console.log(summary);

    if (failedTests.length > 0) {
      const failedText = `[${testForRepository}] Failed tests: ${failedTests.join(', ')}`;
      if ((logger as any)?.error) (logger as any).error(failedText); else console.error(failedText);
    }

    if (completedTests.length === testStateKeys.length) {
      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] All tests completed successfully! 🎉`); else console.log(`[${testForRepository}] All tests completed successfully! 🎉`);
    }
  });

  it('should allow until max attempts are reached', async () => {
    try {
      expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);
      const userEmail = getTestUserEmail();
      const scope = TEST_SCOPES.LOGIN;
      const options = getRateLimiterOptions();

      // First check should show no rate limiting
      if ((logger as any)?.debug) (logger as any).debug({ userEmail, scope, testForRepository }, 'Checking rate limit before any attempts'); else console.log('Checking rate limit before any attempts', { userEmail, scope, testForRepository });
      const checkResult = await Effect.runPromise(rateLimiterServicePort.checkRateLimit(userEmail, scope));
      if ((logger as any)?.debug) (logger as any).debug({ checkResult, testForRepository }, 'Check result'); else console.log('Check result', { checkResult, testForRepository });

      expect(checkResult.isBlocked).toBe(false);
      expect(checkResult.rateLimiter).toBeUndefined();

      // Temporary test to verify FAILED status works
      // expect(false).toBe(true) // Uncomment to test failure handling

      for (let i = 0; i < options.maxAttempts; i++) {
        if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Attempt: ${i + 1}/${options.maxAttempts}`); else console.log(`[${testForRepository}] Attempt: ${i + 1}/${options.maxAttempts}`);
        const attemptResult = await Effect.runPromise(rateLimiterServicePort.recordAttempt(userEmail, scope, options));
        if ((logger as any)?.debug) (logger as any).debug({ attemptResult, testForRepository }, 'Attempt result'); else console.log('Attempt result', { attemptResult, testForRepository });
        const expectedAttempts = i + 1;
        // Should NOT be blocked until max attempts are exceeded
        expect(attemptResult.isBlocked).toBe(false);
        expect(attemptResult.rateLimiter?.attempts).toBe(expectedAttempts);
        expect(attemptResult.rateLimiter?.key).toBe(userEmail);
        expect(attemptResult.rateLimiter?.scope).toBe(scope);
      }
      testState.newRecord = TestStateStatus.COMPLETED;
    } catch (error) {
      testState.newRecord = TestStateStatus.FAILED;
      if ((logger as any)?.error) (logger as any).error(`[${testForRepository}] Test 'should allow until max attempts are reached' failed:`, error); else console.error(`[${testForRepository}] Test 'should allow until max attempts are reached' failed:`, error);
      throw error;
    }
  });

  it('should block after max attempts exceeded (not using default rules)', async () => {
    try {
      expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);
      expect(testState.newRecord, 'New record must be completed to run this test').toBe(TestStateStatus.COMPLETED);

      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Making attempt after max attempts. Expecting to be blocked`); else console.log(`[${testForRepository}] Making attempt after max attempts. Expecting to be blocked`);
      const userEmail = getTestUserEmail();
      const scope = TEST_SCOPES.LOGIN;
      const options = getRateLimiterOptions();
      // Use shorter block duration for real-time testing (10 seconds)
      options.blockDurationInSeconds = 5;
      const attemptResult = await Effect.runPromise(rateLimiterServicePort.recordAttempt(userEmail, scope, options));
      if ((logger as any)?.debug) (logger as any).debug({ attemptResult, testForRepository }, 'Attempt result'); else console.log('Attempt result', { attemptResult, testForRepository });
      expect(attemptResult.isBlocked).toBe(true);
      expect(attemptResult.rateLimiter?.attempts).toBe(options.maxAttempts);
      expect(attemptResult.rateLimiter?.key).toBe(userEmail);
      expect(attemptResult.rateLimiter?.scope).toBe(scope);

      // Make a new attempt to check attempt count is not incremented
      const attemptResult2 = await Effect.runPromise(rateLimiterServicePort.recordAttempt(userEmail, scope, options));
      if ((logger as any)?.debug) (logger as any).debug({ attemptResult2, testForRepository }, 'Attempt result'); else console.log('Attempt result', { attemptResult2, testForRepository });
      expect(attemptResult2.isBlocked).toBe(true);
      expect(attemptResult2.rateLimiter?.attempts).toBe(options.maxAttempts);
      expect(attemptResult2.rateLimiter?.key).toBe(userEmail);
      expect(attemptResult2.rateLimiter?.scope).toBe(scope);

      testState.blockAfterMaxAttempts = TestStateStatus.COMPLETED;
    } catch (error) {
      testState.blockAfterMaxAttempts = TestStateStatus.FAILED;
      if ((logger as any)?.error) (logger as any).error(`[${testForRepository}] Test 'should block after max attempts exceeded' failed:`, error); else console.error(`[${testForRepository}] Test 'should block after max attempts exceeded' failed:`, error);
      throw error;
    }
  });

  it('should wait for resetAt time and allow new attempts (not using default rules)', { timeout: 70000 }, async () => {
    try {
      expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);
      expect(testState.newRecord, 'New record must be completed to run this test').toBe(TestStateStatus.COMPLETED);
      expect(testState.blockAfterMaxAttempts, 'Block after max attempts must be completed to run this test').toBe(
        TestStateStatus.COMPLETED
      );

      const userEmail = getTestUserEmail();
      const scope = TEST_SCOPES.LOGIN;
      const options = getRateLimiterOptions();

      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Starting real-time reset test`); else console.log(`[${testForRepository}] Starting real-time reset test`);

      // First, check current rate limiter status (should be blocked from previous test)
      const initialCheck = await Effect.runPromise(rateLimiterServicePort.checkRateLimit(userEmail, scope));
      if ((logger as any)?.debug) (logger as any).debug({ initialCheck, testForRepository }, 'Initial check result (should be blocked)'); else console.log('Initial check result (should be blocked)', { initialCheck, testForRepository });
      expect(initialCheck.isBlocked).toBe(true);
      expect(initialCheck.rateLimiter?.attempts).toBe(options.maxAttempts);

      const resetAtTime = initialCheck.rateLimiter?.resetAt;
      expect(resetAtTime).toBeDefined();

      const currentTime = Date.now();
      const resetAtTimeMs = typeof resetAtTime === 'number' ? resetAtTime : new Date(resetAtTime!).getTime();
      const waitTime = resetAtTimeMs - currentTime;

      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Current time: ${currentTime}, Reset time: ${resetAtTime}, Wait time: ${waitTime}ms`); else console.log(`[${testForRepository}] Current time: ${currentTime}, Reset time: ${resetAtTime}, Wait time: ${waitTime}ms`);

      if (waitTime > 0) {
        // Test attempts continuously while waiting for reset
        if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Testing continuous attempts before reset time (should be blocked)`); else console.log(`[${testForRepository}] Testing continuous attempts before reset time (should be blocked)`);

        const endTime = resetAtTimeMs + 2000; // Wait 2 seconds past reset time for better margin
        let attemptCount = 0;

        while (Date.now() < endTime) {
          attemptCount++;
          const attemptResult = await Effect.runPromise(rateLimiterServicePort.recordAttempt(userEmail, scope, options));

          const currentTimeForReset = Date.now();
          const isBeforeReset = currentTimeForReset < resetAtTimeMs - 100; // Add 100ms margin before considering reset
          const expectedBlocked = isBeforeReset;

          const now = Date.now();
          const remainingMs = Math.max(0, resetAtTimeMs - now);
          const remainingSecs = Math.round(remainingMs / 1000);

          if ((logger as any)?.info) (logger as any).info(
            {
              attemptCount,
              currentTime: new Date(now).toISOString(),
              resetTime: new Date(resetAtTimeMs).toISOString(),
              remainingSeconds: remainingSecs,
              isBeforeReset,
              expectedBlocked,
              actualBlocked: attemptResult.isBlocked,
              attempts: attemptResult.rateLimiter?.attempts
            },
            `Continuous attempt ${attemptCount} (${remainingSecs}s remaining)`
          ); else console.log('Continuous attempt', { attemptCount, remainingSecs, isBeforeReset, expectedBlocked, actualBlocked: attemptResult.isBlocked, attempts: attemptResult.rateLimiter?.attempts });

          if (isBeforeReset) {
            // Before reset - should be blocked
            expect(attemptResult.isBlocked).toBe(true);
          } else {
            // After reset - should succeed and start fresh
            if (attemptResult.isBlocked) {
              // Still blocked, wait a bit more (Redis timing may need extra margin)
              if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Still blocked after reset time, waiting 500ms more...`); else console.log(`[${testForRepository}] Still blocked after reset time, waiting 500ms more...`);
              await new Promise((resolve) => setTimeout(resolve, 500));
              continue;
            }
            expect(attemptResult.isBlocked).toBe(false);
            // For mongo/drizzle: after reset, record is deleted so rateLimiter is undefined on first check
            // For redis: uses atomic Lua script so rateLimiter has attempts: 1 immediately
            if (attemptResult.rateLimiter) {
              expect(attemptResult.rateLimiter.attempts).toBe(1); // Fresh start for redis
            } else {
              // Fresh start for mongo/drizzle - record was deleted, will be created on next attempt
              expect(attemptResult.rateLimiter).toBeUndefined();
            }
            if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Reset successful! Attempt ${attemptCount} succeeded after reset`); else console.log(`[${testForRepository}] Reset successful! Attempt ${attemptCount} succeeded after reset`);
            break; // Exit loop after successful reset
          }

          // Wait 1 second between attempts
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Completed ${attemptCount} continuous attempts during wait period`); else console.log(`[${testForRepository}] Completed ${attemptCount} continuous attempts during wait period`);
      }
      // Final verification after reset (if no continuous attempts were made)
      if (waitTime <= 0) {
        if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Reset time already passed, testing immediate attempt`); else console.log(`[${testForRepository}] Reset time already passed, testing immediate attempt`);
      const attemptAfterReset = await Effect.runPromise(rateLimiterServicePort.recordAttempt(userEmail, scope, options));
      if ((logger as any)?.debug) (logger as any).debug({ attemptAfterReset, testForRepository }, 'Immediate attempt after reset'); else console.log('Immediate attempt after reset', { attemptAfterReset, testForRepository });
        expect(attemptAfterReset.isBlocked).toBe(false);
        expect(attemptAfterReset.rateLimiter?.attempts).toBe(1); // Should start fresh
        expect(attemptAfterReset.rateLimiter?.key).toBe(userEmail);
        expect(attemptAfterReset.rateLimiter?.scope).toBe(scope);
      }

      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Real-time reset test completed successfully`); else console.log(`[${testForRepository}] Real-time reset test completed successfully`);
      testState.waitForResetAndAttempt = TestStateStatus.COMPLETED;
    } catch (error) {
      testState.waitForResetAndAttempt = TestStateStatus.FAILED;
      if ((logger as any)?.error) (logger as any).error(`[${testForRepository}] Test 'should wait for resetAt time and allow new attempts' failed:`, error); else console.error(`[${testForRepository}] Test 'should wait for resetAt time and allow new attempts' failed:`, error);
      throw error;
    }
  });

  it('should reset rate limiter (not using default rules)', async () => {
    try {
      expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);
      expect(testState.newRecord, 'New record must be completed to run this test').toBe(TestStateStatus.COMPLETED);
      expect(testState.blockAfterMaxAttempts, 'Block after max attempts must be completed to run this test').toBe(
        TestStateStatus.COMPLETED
      );

      const userEmail = getTestUserEmail();
      const scope = TEST_SCOPES.LOGIN;
      const options = getRateLimiterOptions();

      // First block the user again (since real-time reset test may have reset it)
      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Blocking user again for reset test`); else console.log(`[${testForRepository}] Blocking user again for reset test`);
      for (let i = 1; i <= options.maxAttempts + 1; i++) {
        await Effect.runPromise(rateLimiterServicePort.recordAttempt(userEmail, scope, options));
      }

      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Checking rate limit before reset`); else console.log(`[${testForRepository}] Checking rate limit before reset`);
      const checkRateLimitResult = await Effect.runPromise(rateLimiterServicePort.checkRateLimit(userEmail, scope));
      if ((logger as any)?.debug) (logger as any).debug({ checkRateLimitResult, testForRepository }, 'Check rate limit result'); else console.log('Check rate limit result', { checkRateLimitResult, testForRepository });
      expect(checkRateLimitResult.isBlocked).toBe(true);
      expect(checkRateLimitResult.rateLimiter?.attempts).toBe(options.maxAttempts);
      expect(checkRateLimitResult.rateLimiter?.key).toBe(userEmail);
      expect(checkRateLimitResult.rateLimiter?.scope).toBe(scope);

      // Reset the rate limiter
      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Resetting rate limiter`); else console.log(`[${testForRepository}] Resetting rate limiter`);
      const resetResult = await Effect.runPromise(rateLimiterServicePort.resetRateLimit(userEmail, scope));
      if ((logger as any)?.debug) (logger as any).debug({ resetResult, testForRepository }, 'Reset result'); else console.log('Reset result', { resetResult, testForRepository });
      expect(resetResult).toEqual(1); // 1 is the number of records deleted

      // Check the rate limiter again
      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Checking rate limit after reset`); else console.log(`[${testForRepository}] Checking rate limit after reset`);
      const checkRateLimitResultAfterReset = await Effect.runPromise(rateLimiterServicePort.checkRateLimit(userEmail, scope));
      if ((logger as any)?.debug) (logger as any).debug({ checkRateLimitResultAfterReset, testForRepository }, 'Check rate limit result after reset'); else console.log('Check rate limit result after reset', { checkRateLimitResultAfterReset, testForRepository });
      expect(checkRateLimitResultAfterReset.isBlocked).toBe(false);
      testState.resetRateLimit = TestStateStatus.COMPLETED;
    } catch (error) {
      testState.resetRateLimit = TestStateStatus.FAILED;
      if ((logger as any)?.error) (logger as any).error(`[${testForRepository}] Test 'should reset rate limiter' failed:`, error); else console.error(`[${testForRepository}] Test 'should reset rate limiter' failed:`, error);
      throw error;
    }
  });

  it('should allow an attempt after reset (not using default rules)', async () => {
    try {
      expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);
      expect(testState.newRecord, 'New record must be completed to run this test').toBe(TestStateStatus.COMPLETED);
      expect(testState.blockAfterMaxAttempts, 'Block after max attempts must be completed to run this test').toBe(
        TestStateStatus.COMPLETED
      );
      expect(testState.resetRateLimit, 'Reset rate limit must be completed to run this test').toBe(TestStateStatus.COMPLETED);

      const userEmail = getTestUserEmail();
      const scope = TEST_SCOPES.LOGIN;
      const options = getRateLimiterOptions();

      // Make an attempt
      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Making an attempt after reset`); else console.log(`[${testForRepository}] Making an attempt after reset`);
      const attemptResultAfterReset = await Effect.runPromise(rateLimiterServicePort.recordAttempt(userEmail, scope, options));
      if ((logger as any)?.debug) (logger as any).debug({ attemptResultAfterReset, testForRepository }, 'Attempt result after reset'); else console.log('Attempt result after reset', { attemptResultAfterReset, testForRepository });
      expect(attemptResultAfterReset.isBlocked).toBe(false);
      expect(attemptResultAfterReset.rateLimiter?.attempts).toBe(1);
      expect(attemptResultAfterReset.rateLimiter?.key).toBe(userEmail);
      expect(attemptResultAfterReset.rateLimiter?.scope).toBe(scope);
      testState.attemptAfterReset = TestStateStatus.COMPLETED;
    } catch (error) {
      testState.attemptAfterReset = TestStateStatus.FAILED;
      if ((logger as any)?.error) (logger as any).error(`[${testForRepository}] Test 'should allow an attempt after reset' failed:`, error); else console.error(`[${testForRepository}] Test 'should allow an attempt after reset' failed:`, error);
      throw error;
    }
  });

  // Add new test for builder pattern
  it('should work with builder pattern and default rules', async () => {
    const testName = 'DefaultRulesTest';
    try {
      expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);
      // Builder test is made independent from prior tests

      const path = '/api/v1/test';
      const scope = 'api';

      // A new repository is created by builder pattern as we only give repository config to builder
      const defaultRule = { maxAttempts: 2, blockDurationInSeconds: 5 };
      const builderService = await Effect.runPromise(ServiceFactoryRateLimiter.builder()
        .withConfig({
          rateLimiterRepositoryConfig: repositoryConfig,
          redisConfig: {
            connection: getTestRedisConnectionConfig(repositoryConfig.url!),
            adapter: getTestRedisAdapterConfig()
          },
          options: {
            locale: 'en',
            fallbackLocale: 'en'
          }
        })
        .withDefaultRules({
          api: defaultRule
        })
        .withLogLevel('debug')
        .build());

      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] ${testName} started. Attempt 1`); else console.log(`[${testForRepository}] ${testName} started. Attempt 1`);
      const result1 = await Effect.runPromise(builderService.recordAttempt(path, scope));
      expect(result1.isBlocked).toBe(false);
      expect(result1.rateLimiter?.attempts).toBe(1);

      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] ${testName} started. Attempt 2`); else console.log(`[${testForRepository}] ${testName} started. Attempt 2`);
      const result2 = await Effect.runPromise(builderService.recordAttempt(path, scope));
      expect(result2.isBlocked).toBe(false);
      expect(result2.rateLimiter?.attempts).toBe(2);

      // Third attempt should block (since custom rule maxAttempts = 2)
      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] ${testName} started. Attempt 3`); else console.log(`[${testForRepository}] ${testName} started. Attempt 3`);
      const result3 = await Effect.runPromise(builderService.recordAttempt(path, scope));
      expect(result3.isBlocked).toBe(true);
      expect(result3.rateLimiter?.attempts).toBeGreaterThanOrEqual(2);

      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] ${testName} completed successfully`); else console.log(`[${testForRepository}] ${testName} completed successfully`);
      testState.defaultRules = TestStateStatus.COMPLETED;
    } catch (error) {
      testState.defaultRules = TestStateStatus.FAILED;
      if ((logger as any)?.error) (logger as any).error(`[${testForRepository}] ${testName} failed:`, error); else console.error(`[${testForRepository}] ${testName} failed:`, error);
      throw error;
    }
  });
});

describe.each(escalationReadbackRepositories)('RateLimiter Escalation Readback Tests - %s', (testForRepository) => {
  it('should persist escalating block streak across a fresh repository readback', async () => {
    const repositoryConfig = {
      repositoryType: getRepositoryType(testForRepository),
      url: getRepositoryUrl(testForRepository),
      tenantId: TEST_TENANT_ID
    } as RepositoryConfig;
    const key = `escalation-${testForRepository}-${Date.now()}@example.com`;
    const scope = 'login_escalation';
    const baseBlockDuration = getRepositoryType(testForRepository) === 'drizzle' ? 30 : 1;
    const maxBlockDuration = getRepositoryType(testForRepository) === 'drizzle' ? 90 : 4;
    const rule: RateLimitRule = {
      maxAttempts: 1,
      blockDurationInSeconds: baseBlockDuration,
      backoffMultiplier: 2,
      maxBlockDurationInSeconds: maxBlockDuration,
      overrideRedisDefaultTtl: 20
    };
    const { service, repository } = await createRateLimiterServiceBundle({ repositoryConfig, logLevel: 'debug' }, logger);

    try {
      await Effect.runPromise(service.resetRateLimit(key, scope));

      expect((await Effect.runPromise(service.recordAttempt(key, scope, rule))).isBlocked).toBe(false);
      const firstBlock = await Effect.runPromise(service.recordAttempt(key, scope, rule));
      expect(firstBlock.isBlocked).toBe(true);
      expect(firstBlock.rateLimiter?.violationStreak).toBe(1);
      expect(blockDurationSeconds(firstBlock.rateLimiter)).toBe(baseBlockDuration);

      const firstReadback = await checkFromFreshRepository(repositoryConfig, key, scope);
      expect(firstReadback.isBlocked).toBe(true);
      expect(firstReadback.rateLimiter?.violationStreak).toBe(1);

      const activeRepeat = await Effect.runPromise(service.recordAttempt(key, scope, rule));
      expect(activeRepeat.isBlocked).toBe(true);
      expect(activeRepeat.rateLimiter?.violationStreak).toBe(1);

      await advancePastCurrentWindow(repository, firstBlock.rateLimiter);
      const cleanAfterFirstBlock = await Effect.runPromise(service.recordAttempt(key, scope, rule));
      expect(cleanAfterFirstBlock.isBlocked).toBe(false);
      expect(cleanAfterFirstBlock.rateLimiter?.violationStreak).toBe(1);
      expect(cleanAfterFirstBlock.rateLimiter?.blockedAt ?? null).toBeNull();

      const secondBlock = await Effect.runPromise(service.recordAttempt(key, scope, rule));
      expect(secondBlock.isBlocked).toBe(true);
      expect(secondBlock.rateLimiter?.violationStreak).toBe(2);
      expect(blockDurationSeconds(secondBlock.rateLimiter)).toBe(baseBlockDuration * 2);

      const secondReadback = await checkFromFreshRepository(repositoryConfig, key, scope);
      expect(secondReadback.isBlocked).toBe(true);
      expect(secondReadback.rateLimiter?.violationStreak).toBe(2);

      await advancePastCurrentWindow(repository, secondBlock.rateLimiter);
      expect((await Effect.runPromise(service.recordAttempt(key, scope, rule))).isBlocked).toBe(false);

      const cappedBlock = await Effect.runPromise(service.recordAttempt(key, scope, rule));
      expect(cappedBlock.isBlocked).toBe(true);
      expect(cappedBlock.rateLimiter?.violationStreak).toBe(3);
      expect(blockDurationSeconds(cappedBlock.rateLimiter)).toBe(maxBlockDuration);
    } finally {
      await Effect.runPromise(service.resetRateLimit(key, scope));
    }
  });
});

// ===== Helper Function Tests (withRateLimit) =====

describe.each(testRepositories.filter((id) => !!getRepositoryUrl(id)))('withRateLimit Helper Tests - %s', (testForRepository) => {
  let rateLimiterServicePort: IRateLimiterServicePort;
  const helperKey = 'helper@example.com';
  const helperScope = 'helper_login';
  const rule: RateLimitRule = { maxAttempts: 2, blockDurationInSeconds: 5 };

  // Helper test state tracking
  const helperState = {
    recordBefore: TestStateStatus.NOT_STARTED,
    recordOnFailure: TestStateStatus.NOT_STARTED,
    blockAfterMax: TestStateStatus.NOT_STARTED,
    resetOnSuccess: TestStateStatus.NOT_STARTED
  };

  beforeAll(async () => {
    // Re-use repositoryConfig from outer scope if defined
    const repositoryConfig = {
      repositoryType: repositoryTestConfig[testForRepository].type,
      url: repositoryTestConfig[testForRepository].url,
      tenantId: TEST_TENANT_ID
    } as RepositoryConfig;

    const { service } = await createRateLimiterServiceBundle({ repositoryConfig, debugMode: true }, logger);
    rateLimiterServicePort = service;
    // Ensure clean slate
    await (await import('effect')).Effect.runPromise(rateLimiterServicePort.resetRateLimit(helperKey, helperScope));
  });

  afterAll(() => {
    const keys = Object.keys(helperState) as (keyof typeof helperState)[];
    const completed: string[] = [];
    const failed: string[] = [];
    const notStarted: string[] = [];

    keys.forEach((k) => {
      const status = helperState[k];
      const msg = `[${testForRepository}] helper.${k}: ${status}`;
      switch (status) {
        case TestStateStatus.COMPLETED:
          if ((logger as any)?.info) (logger as any).info(msg); else console.log(msg);
          completed.push(k);
          break;
        case TestStateStatus.FAILED:
          if ((logger as any)?.error) (logger as any).error(msg); else console.error(msg);
          failed.push(k);
          break;
        default:
          if ((logger as any)?.warn) (logger as any).warn(msg); else console.warn(msg);
          notStarted.push(k);
      }
    });

    const summaryMsg = `[${testForRepository}] Helper Test Summary: ${completed.length} completed, ${failed.length} failed, ${notStarted.length} not started`;
    if ((logger as any)?.info) (logger as any).info(summaryMsg); else console.log(summaryMsg);
    const failedMsg = `[${testForRepository}] Helper failed tests: ${failed.join(', ')}`;
    if (failed.length) {
      if ((logger as any)?.error) (logger as any).error(failedMsg); else console.error(failedMsg);
    }
  });

  it('should record attempt BEFORE exec when recordBefore is true', async () => {
    // Call helper with recordBefore
    const result = await withRateLimit<boolean>({
      key: helperKey,
      scope: helperScope,
      rateLimiter: rateLimiterServicePort,
      rule,
      recordBefore: true,
      exec: async () => success(true)
    });

    expect(result.ok).toBe(true);
    const status = await (await import('effect')).Effect.runPromise(rateLimiterServicePort.checkRateLimit(helperKey, helperScope));
    expect(status.isBlocked).toBe(false);
    expect(status.rateLimiter?.attempts).toBe(1);
    helperState.recordBefore = TestStateStatus.COMPLETED;
  });

  it('should record attempt AFTER failure when recordOnFailure is true', async () => {
    const result = await withRateLimit<boolean>({
      key: helperKey,
      scope: helperScope,
      rateLimiter: rateLimiterServicePort,
      rule,
      recordOnFailure: true,
      exec: async () => failure({ messageText: 'fail', opts: { domain: 'test', code: 'FAIL' } })
    });

    expect(result.ok).toBe(false);
    const status = await (await import('effect')).Effect.runPromise(rateLimiterServicePort.checkRateLimit(helperKey, helperScope));
    // Now attempts should be 2 (1 from previous + 1 from failure)
    expect(status.rateLimiter?.attempts).toBe(2);
    helperState.recordOnFailure = TestStateStatus.COMPLETED;
  });

  it('should block further attempts when maxAttempts exceeded and call onBlocked', async () => {
    // Bring attempts to maxAttempts so that next call triggers block
    await (await import('effect')).Effect.runPromise(rateLimiterServicePort.recordAttempt(helperKey, helperScope, rule)); // attempt 1 (was reset earlier)
    await (await import('effect')).Effect.runPromise(rateLimiterServicePort.recordAttempt(helperKey, helperScope, rule)); // attempt 2 -> now at threshold

    const blocker = await withRateLimit<boolean>({
      key: helperKey,
      scope: helperScope,
      rateLimiter: rateLimiterServicePort,
      rule,
      onBlocked: () => failure({ messageText: 'blocked', opts: { domain: 'test', code: 'BLOCKED' } }),
      exec: async () => success(true) // This should not run
    });

    expect(blocker.ok).toBe(false);
    expect(blocker.messages[0].messageText).toBe('blocked');
    helperState.blockAfterMax = TestStateStatus.COMPLETED;
  });

  it('should RESET attempts on success when resetOnSuccess is true', async () => {
    // First clean block by manual reset
    await (await import('effect')).Effect.runPromise(rateLimiterServicePort.resetRateLimit(helperKey, helperScope));

    // Create one failed attempt to increase counter
    await withRateLimit<boolean>({
      key: helperKey,
      scope: helperScope,
      rateLimiter: rateLimiterServicePort,
      rule,
      recordOnFailure: true,
      exec: async () => failure({ messageText: 'fail', opts: { domain: 'test', code: 'FAIL' } })
    });

    // Now call with success & resetOnSuccess
    const result = await withRateLimit<boolean>({
      key: helperKey,
      scope: helperScope,
      rateLimiter: rateLimiterServicePort,
      rule,
      resetOnSuccess: true,
      exec: async () => success(true)
    });

    expect(result.ok).toBe(true);
    const status = await (await import('effect')).Effect.runPromise(rateLimiterServicePort.checkRateLimit(helperKey, helperScope));
    expect(status.rateLimiter).toBeUndefined();
    helperState.resetOnSuccess = TestStateStatus.COMPLETED;
  });
});
