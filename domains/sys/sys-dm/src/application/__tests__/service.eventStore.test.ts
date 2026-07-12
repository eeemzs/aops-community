// nx test xf-dm-sys --skip-nx-cache service.eventStore

import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import {
  createRepositoryPortEventStore,
  createTestEventStore,
  TEST_DB_MONGODB_URI,
  TEST_DB_POSTGRESQL_URI,
  TEST_DB_REDIS_URI,
  TEST_DB_UPSTASH_URL,
  TEST_TENANT_ID
} from '../../tests/config/eventStore.config';
import { ServiceBuilderEventStore } from '../factories/ServiceEventStoreBuilder';
import { IEventStoreServicePort } from '../ports/inbound/IEventStoreServicePort';
import { IRepositoryPortEventStore } from '../ports/repository-ports/IRepositoryPortEventStore';
import { createSyncLogger } from '@aopslab/xf-logger/sync';
import { RepositoryConfig, RepositoryType } from '@aopslab/xf-db';
import { IbmEventStore } from '../../domain';

const logger = createSyncLogger({
  level: 'info',
  base: {
    module: 'eventStore-service-test'
  }
});

// Test state enum for sequential test execution
enum TestStateStatus {
  NOT_STARTED = 'not_started',
  COMPLETED = 'completed',
  FAILED = 'failed'
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

describe.each(testRepositories)(
  'IEventStoreServicePort Tests - Core Methods (DB Records Preserved) - %s',
  (testForRepository: TestRepositoryIdentifier) => {
    let eventStoreService: IEventStoreServicePort;
    let eventStoreRepository: IRepositoryPortEventStore;
    let testEvent: IbmEventStore;
    let storedEventId: string | undefined;

    interface TestStates {
      setup: TestStateStatus;
      publishEvent: TestStateStatus;
      subscribeToEvent: TestStateStatus;
      getEventsByAggregate: TestStateStatus;
      getEventsByType: TestStateStatus;
      getAllEvents: TestStateStatus;
      unsubscribeFromEvent: TestStateStatus;
      subscriberManagement: TestStateStatus;
      pubSubEdgeCases: TestStateStatus;
    }

    const testState: TestStates = {
      setup: TestStateStatus.NOT_STARTED,
      publishEvent: TestStateStatus.NOT_STARTED,
      subscribeToEvent: TestStateStatus.NOT_STARTED,
      getEventsByAggregate: TestStateStatus.NOT_STARTED,
      getEventsByType: TestStateStatus.NOT_STARTED,
      getAllEvents: TestStateStatus.NOT_STARTED,
      unsubscribeFromEvent: TestStateStatus.NOT_STARTED,
      subscriberManagement: TestStateStatus.NOT_STARTED,
      pubSubEdgeCases: TestStateStatus.NOT_STARTED
    };

    beforeAll(async () => {
      try {
        // Create repository and inject it into the service - We need to create the repository first
        // to empty the repository before running the tests
        const repositoryConfig: RepositoryConfig = {
          repositoryType: getRepositoryType(testForRepository),
          url: getRepositoryUrl(testForRepository),
          tenantId: TEST_TENANT_ID // Add required tenantId
        };

        if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Creating event store repository...`); else console.log(`[${testForRepository}] Creating event store repository...`);
        eventStoreRepository = await createRepositoryPortEventStore(repositoryConfig, logger);
        if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Repository created successfully`); else console.log(`[${testForRepository}] Repository created successfully`);

        if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Creating event store service...`); else console.log(`[${testForRepository}] Creating event store service...`);
        eventStoreService = await (await import('effect')).Effect.runPromise(ServiceBuilderEventStore.create()
          .withConfig({})
          .withRepository(eventStoreRepository)
          .build());
        if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Service created successfully`); else console.log(`[${testForRepository}] Service created successfully`);

        const cleanupResult = await (await import('effect')).Effect.runPromise(eventStoreService.cleanupAll());
        if ((logger as any)?.info) (logger as any).info({ cleanupResult }, `[${testForRepository}] Initial cleanup result:`); else console.log(`[${testForRepository}] Initial cleanup result:`, cleanupResult);

        testEvent = createTestEventStore({
          eventType: 'test-user-created',
          aggregateId: 'user-123',
          eventData: JSON.stringify({
            name: 'John Doe',
            email: 'john@example.com'
          })
        });

        testState.setup = TestStateStatus.COMPLETED;
        if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Test setup completed successfully! 🎉`); else console.log(`[${testForRepository}] Test setup completed successfully! 🎉`);
      } catch (error) {
        testState.setup = TestStateStatus.FAILED;
        if ((logger as any)?.error) (logger as any).error(`[${testForRepository}] Setup failed:`, error); else console.error(`[${testForRepository}] Setup failed:`, error);
        throw error;
      }
    }, 30000);

    afterAll(async () => {
      const keys = Object.keys(testState) as Array<keyof TestStates>;
      const completed: string[] = [];
      const failed: string[] = [];
      const notStarted: string[] = [];

      keys.forEach((key) => {
        const status = testState[key];
        const msg = `[${testForRepository}] ${key}: ${status}`;
        if (status === TestStateStatus.COMPLETED) {
          if ((logger as any)?.info) (logger as any).info(msg); else console.log(msg);
          completed.push(key);
        } else if (status === TestStateStatus.FAILED) {
          if ((logger as any)?.error) (logger as any).error(msg); else console.error(msg);
          failed.push(key);
        } else {
          if ((logger as any)?.warn) (logger as any).warn(msg); else console.warn(msg);
          notStarted.push(key);
        }
      });

      const summary = `[${testForRepository}] Test Summary: ${completed.length} completed, ${failed.length} failed, ${notStarted.length} not started`;
      if ((logger as any)?.info) (logger as any).info(summary); else console.log(summary);
      if (failed.length) {
        const failMsg = `[${testForRepository}] Failed tests: ${failed.join(', ')}`;
        if ((logger as any)?.error) (logger as any).error(failMsg); else console.error(failMsg);
      }
      if (completed.length === keys.length) {
        if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] All tests completed successfully! 🎉`); else console.log(`[${testForRepository}] All tests completed successfully! 🎉`);
      }
      if ((logger as any)?.info) (logger as any).info(`[${testForRepository}] Database records preserved for inspection 🔍`); else console.log(`[${testForRepository}] Database records preserved for inspection 🔍`);
    });

    // 🧪 Test 1: publishEvent method
    it('should publish an event (store + notify)', async () => {
      try {
        expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);

        if ((logger as any)?.info) (logger as any).info('🧪 Testing publishEvent method...'); else console.log('🧪 Testing publishEvent method...');

        // Track if handler was called
        let handlerCalled = false;
        let handlerEvent: IbmEventStore | undefined = undefined;

        // Subscribe to event first
        eventStoreService.subscribeToEvent('test-user-created', (event: IbmEventStore) => {
          handlerCalled = true;
          handlerEvent = event;
          if ((logger as any)?.info) (logger as any).info('Handler called with event:', { eventType: event.eventType, aggregateId: event.aggregateId }); else console.log('Handler called with event:', { eventType: event.eventType, aggregateId: event.aggregateId });
        });

        // Publish the event
        await (await import('effect')).Effect.runPromise(eventStoreService.publishEvent(testEvent));
        if ((logger as any)?.info) (logger as any).info('✅ publishEvent: Event published successfully'); else console.log('✅ publishEvent: Event published successfully');

        // Verify handler was called (pub/sub functionality)
        expect(handlerCalled).toBe(true);
        expect(handlerEvent).toBeDefined();
        expect(handlerEvent!.eventType).toBe('test-user-created');
        expect(handlerEvent!.aggregateId).toBe('user-123');
        if ((logger as any)?.info) (logger as any).info('✅ publishEvent: Handler notification worked'); else console.log('✅ publishEvent: Handler notification worked');

        if ((logger as any)?.info) (logger as any).info('🎉 publishEvent test completed!'); else console.log('🎉 publishEvent test completed!');
        testState.publishEvent = TestStateStatus.COMPLETED;
      } catch (error) {
        testState.publishEvent = TestStateStatus.FAILED;
        if ((logger as any)?.error) (logger as any).error('Test publishEvent failed:', error); else console.error('Test publishEvent failed:', error);
        throw error;
      }
    });

    // 🧪 Test 2: subscribeToEvent method
    it('should register event handlers', async () => {
      try {
        expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);

        if ((logger as any)?.info) (logger as any).info('🧪 Testing subscribeToEvent method...'); else console.log('🧪 Testing subscribeToEvent method...');

        // Track handler calls
        let handler1Called = false;
        let handler2Called = false;
        let handler3Called = false;

        // Register multiple handlers for same event type
        const handler1 = (event: IbmEventStore) => {
          handler1Called = true;
          if ((logger as any)?.info) (logger as any).info('Handler 1 called'); else console.log('Handler 1 called');
        };

        const handler2 = (event: IbmEventStore) => {
          handler2Called = true;
          if ((logger as any)?.info) (logger as any).info('Handler 2 called'); else console.log('Handler 2 called');
        };

        const handler3 = (event: IbmEventStore) => {
          handler3Called = true;
          if ((logger as any)?.info) (logger as any).info('Handler 3 called'); else console.log('Handler 3 called');
        };

        // Subscribe handlers
        eventStoreService.subscribeToEvent('test-multi-handler', handler1);
        eventStoreService.subscribeToEvent('test-multi-handler', handler2);
        eventStoreService.subscribeToEvent('test-multi-handler', handler3);

        // Create and publish test event
        const multiHandlerEvent = createTestEventStore({
          eventType: 'test-multi-handler',
          aggregateId: 'multi-123',
          eventData: JSON.stringify({ test: 'multi-handler' })
        });

        await (await import('effect')).Effect.runPromise(eventStoreService.publishEvent(multiHandlerEvent));

        // Verify all handlers were called
        expect(handler1Called).toBe(true);
        expect(handler2Called).toBe(true);
        expect(handler3Called).toBe(true);

        if ((logger as any)?.info) (logger as any).info('✅ subscribeToEvent: All handlers called successfully'); else console.log('✅ subscribeToEvent: All handlers called successfully');
        if ((logger as any)?.info) (logger as any).info('🎉 subscribeToEvent test completed!'); else console.log('🎉 subscribeToEvent test completed!');
        testState.subscribeToEvent = TestStateStatus.COMPLETED;
      } catch (error) {
        testState.subscribeToEvent = TestStateStatus.FAILED;
        if ((logger as any)?.error) (logger as any).error('Test subscribeToEvent failed:', error); else console.error('Test subscribeToEvent failed:', error);
        throw error;
      }
    });

    // 🧪 Test 3: getEventsByAggregate method (Event Sourcing)
    it('should retrieve events by aggregate ID', async () => {
      try {
        expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);

        if ((logger as any)?.info) (logger as any).info('🧪 Testing getEventsByAggregate method...'); else console.log('🧪 Testing getEventsByAggregate method...');

        const aggregateId = 'aggregate-456';

        // Create multiple events for same aggregate
        const event1 = createTestEventStore({
          eventType: 'user-created',
          aggregateId,
          eventData: JSON.stringify({ name: 'Alice' })
        });

        const event2 = createTestEventStore({
          eventType: 'user-updated',
          aggregateId,
          eventData: JSON.stringify({ name: 'Alice Updated' })
        });

        const event3 = createTestEventStore({
          eventType: 'user-deleted',
          aggregateId,
          eventData: JSON.stringify({ deleted: true })
        });

        // Publish events
        await (await import('effect')).Effect.runPromise(eventStoreService.publishEvent(event1));
        await (await import('effect')).Effect.runPromise(eventStoreService.publishEvent(event2));
        await (await import('effect')).Effect.runPromise(eventStoreService.publishEvent(event3));

        // Retrieve events by aggregate
        const result = await (await import('effect')).Effect.runPromise(eventStoreService.getEventsByAggregate(aggregateId));

        expect(result).toBeDefined();
        expect(result.length).toBe(3);

        // Verify we got all 3 events for the aggregate (order doesn't matter)
        const events = result;
        const eventTypes = events.map((e) => e.eventType).sort();
        expect(eventTypes).toEqual(['user-created', 'user-deleted', 'user-updated']);

        // Verify all events belong to the same aggregate
        events.forEach((event) => {
          expect(event.aggregateId).toBe(aggregateId);
        });

        if ((logger as any)?.info) (logger as any).info('✅ getEventsByAggregate: Retrieved events successfully'); else console.log('✅ getEventsByAggregate: Retrieved events successfully');
        if ((logger as any)?.info) (logger as any).info('🎉 getEventsByAggregate test completed!'); else console.log('🎉 getEventsByAggregate test completed!');
        testState.getEventsByAggregate = TestStateStatus.COMPLETED;
      } catch (error) {
        testState.getEventsByAggregate = TestStateStatus.FAILED;
        if ((logger as any)?.error) (logger as any).error('Test getEventsByAggregate failed:', error); else console.error('Test getEventsByAggregate failed:', error);
        throw error;
      }
    });

    // 🧪 Test 4: getEventsByType method
    it('should retrieve events by type', async () => {
      try {
        expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);

        if ((logger as any)?.info) (logger as any).info('🧪 Testing getEventsByType method...'); else console.log('🧪 Testing getEventsByType method...');

        const eventType = 'test-type-filter';

        // Create multiple events of same type
        const event1 = createTestEventStore({
          eventType,
          aggregateId: 'agg-1',
          eventData: JSON.stringify({ index: 1 })
        });

        const event2 = createTestEventStore({
          eventType,
          aggregateId: 'agg-2',
          eventData: JSON.stringify({ index: 2 })
        });

        // Publish events
        await (await import('effect')).Effect.runPromise(eventStoreService.publishEvent(event1));
        await (await import('effect')).Effect.runPromise(eventStoreService.publishEvent(event2));

        // Test without limit
        const resultAll = await (await import('effect')).Effect.runPromise(eventStoreService.getEventsByType(eventType));
        expect(resultAll.length).toBeGreaterThanOrEqual(2);

        // Test with limit
        const resultLimited = await (await import('effect')).Effect.runPromise(eventStoreService.getEventsByType(eventType, 1));
        expect(resultLimited.length).toBe(1);

        if ((logger as any)?.info) (logger as any).info('✅ getEventsByType: Retrieved events successfully'); else console.log('✅ getEventsByType: Retrieved events successfully');
        if ((logger as any)?.info) (logger as any).info('🎉 getEventsByType test completed!'); else console.log('🎉 getEventsByType test completed!');
        testState.getEventsByType = TestStateStatus.COMPLETED;
      } catch (error) {
        testState.getEventsByType = TestStateStatus.FAILED;
        if ((logger as any)?.error) (logger as any).error('Test getEventsByType failed:', error); else console.error('Test getEventsByType failed:', error);
        throw error;
      }
    });

    // 🧪 Test 5: getAllEvents method
    it('should retrieve all events', async () => {
      try {
        expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);

        if ((logger as any)?.info) (logger as any).info('🧪 Testing getAllEvents method...'); else console.log('🧪 Testing getAllEvents method...');

        // Test without limit
        const resultAll = await (await import('effect')).Effect.runPromise(eventStoreService.getAllEvents());
        expect(resultAll).toBeDefined();
        expect(resultAll.length).toBeGreaterThan(0);

        const totalCount = resultAll.length;
        if ((logger as any)?.info) (logger as any).info(`Total events in store: ${totalCount}`); else console.log(`Total events in store: ${totalCount}`);

        // Test with limit
        const limitCount = Math.min(3, totalCount);
        const resultLimited = await (await import('effect')).Effect.runPromise(eventStoreService.getAllEvents(limitCount));
        expect(resultLimited.length).toBe(limitCount);

        if ((logger as any)?.info) (logger as any).info('✅ getAllEvents: Retrieved events successfully'); else console.log('✅ getAllEvents: Retrieved events successfully');
        if ((logger as any)?.info) (logger as any).info('🎉 getAllEvents test completed!'); else console.log('🎉 getAllEvents test completed!');
        testState.getAllEvents = TestStateStatus.COMPLETED;
      } catch (error) {
        testState.getAllEvents = TestStateStatus.FAILED;
        if ((logger as any)?.error) (logger as any).error('Test getAllEvents failed:', error); else console.error('Test getAllEvents failed:', error);
        throw error;
      }
    });

    // 🧪 Test 6: unsubscribeFromEvent method
    it('should unsubscribe event handlers', async () => {
      try {
        expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);

        if ((logger as any)?.info) (logger as any).info('🧪 Testing unsubscribeFromEvent method...'); else console.log('🧪 Testing unsubscribeFromEvent method...');

        // Track handler calls
        let handlerCalled = false;

        const handler = (event: IbmEventStore) => {
          handlerCalled = true;
          if ((logger as any)?.info) (logger as any).info('Handler called (should not happen after unsubscribe)'); else console.log('Handler called (should not happen after unsubscribe)');
        };

        const eventType = 'test-unsubscribe';

        // Subscribe handler
        eventStoreService.subscribeToEvent(eventType, handler);

        // Verify subscription works
        const testEvent1 = createTestEventStore({
          eventType,
          aggregateId: 'unsub-test-1',
          eventData: JSON.stringify({ test: 'before-unsubscribe' })
        });

        await (await import('effect')).Effect.runPromise(eventStoreService.publishEvent(testEvent1));
        expect(handlerCalled).toBe(true);

        // Reset flag and unsubscribe
        handlerCalled = false;
        eventStoreService.unsubscribeFromEvent(eventType, handler);

        // Publish another event - handler should not be called
        const testEvent2 = createTestEventStore({
          eventType,
          aggregateId: 'unsub-test-2',
          eventData: JSON.stringify({ test: 'after-unsubscribe' })
        });

        await (await import('effect')).Effect.runPromise(eventStoreService.publishEvent(testEvent2));
        expect(handlerCalled).toBe(false);

        if ((logger as any)?.info) (logger as any).info('✅ unsubscribeFromEvent: Handler unsubscribed successfully'); else console.log('✅ unsubscribeFromEvent: Handler unsubscribed successfully');
        if ((logger as any)?.info) (logger as any).info('🎉 unsubscribeFromEvent test completed!'); else console.log('🎉 unsubscribeFromEvent test completed!');
        testState.unsubscribeFromEvent = TestStateStatus.COMPLETED;
      } catch (error) {
        testState.unsubscribeFromEvent = TestStateStatus.FAILED;
        if ((logger as any)?.error) (logger as any).error('Test unsubscribeFromEvent failed:', error); else console.error('Test unsubscribeFromEvent failed:', error);
        throw error;
      }
    });

    // 🧪 Test 7: Subscriber Management
    it('should manage subscribers correctly', async () => {
      try {
        expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);

        if ((logger as any)?.info) (logger as any).info('🧪 Testing subscriber management...'); else console.log('🧪 Testing subscriber management...');

        const eventType = 'test-subscriber-management';

        // Create handlers
        const handler1 = (event: IbmEventStore) => {
          if ((logger as any)?.info) (logger as any).info('Management handler 1'); else console.log('Management handler 1');
        };
        const handler2 = (event: IbmEventStore) => {
          if ((logger as any)?.info) (logger as any).info('Management handler 2'); else console.log('Management handler 2');
        };
        const handler3 = (event: IbmEventStore) => {
          if ((logger as any)?.info) (logger as any).info('Management handler 3'); else console.log('Management handler 3');
        };

        // Subscribe handlers
        eventStoreService.subscribeToEvent(eventType, handler1);
        eventStoreService.subscribeToEvent(eventType, handler2);
        eventStoreService.subscribeToEvent(eventType, handler3);

        // Check subscriber count
        const count = eventStoreService.getSubscriberCount(eventType);
        expect(count).toBe(3);

        // Clear all subscribers
        eventStoreService.clearAllSubscribers();

        // Check subscriber count after clearing
        const countAfterClear = eventStoreService.getSubscriberCount(eventType);
        expect(countAfterClear).toBe(0);

        if ((logger as any)?.info) (logger as any).info('✅ subscriberManagement: Subscriber management working correctly'); else console.log('✅ subscriberManagement: Subscriber management working correctly');
        if ((logger as any)?.info) (logger as any).info('🎉 subscriberManagement test completed!'); else console.log('🎉 subscriberManagement test completed!');
        testState.subscriberManagement = TestStateStatus.COMPLETED;
      } catch (error) {
        testState.subscriberManagement = TestStateStatus.FAILED;
        if ((logger as any)?.error) (logger as any).error('Test subscriberManagement failed:', error); else console.error('Test subscriberManagement failed:', error);
        throw error;
      }
    });

    // 🧪 Test 8: Pub/Sub Edge Cases
    it('should handle pub/sub edge cases', async () => {
      try {
        expect(testState.setup, 'Setup must be completed to run this test').toBe(TestStateStatus.COMPLETED);

        if ((logger as any)?.info) (logger as any).info('🧪 Testing pub/sub edge cases...'); else console.log('🧪 Testing pub/sub edge cases...');

        // Test 1: Publishing to non-existent event type (no subscribers)
        const orphanEvent = createTestEventStore({
          eventType: 'non-existent-event',
          aggregateId: 'orphan-123',
          eventData: JSON.stringify({ test: 'orphan' })
        });

        await (await import('effect')).Effect.runPromise(eventStoreService.publishEvent(orphanEvent));

        // Test 2: Unsubscribing non-existent handler
        const dummyHandler = (event: IbmEventStore) => {
          if ((logger as any)?.debug) (logger as any).debug('Dummy handler called'); else console.log('Dummy handler called');
        };
        eventStoreService.unsubscribeFromEvent('non-existent-type', dummyHandler); // Should not throw

        // Test 3: Getting subscriber count for non-existent event type
        const nonExistentCount = eventStoreService.getSubscriberCount('non-existent-type');
        expect(nonExistentCount).toBe(0);

        if ((logger as any)?.info) (logger as any).info('✅ pubSubEdgeCases: Edge cases handled correctly'); else console.log('✅ pubSubEdgeCases: Edge cases handled correctly');
        if ((logger as any)?.info) (logger as any).info('🎉 pubSubEdgeCases test completed!'); else console.log('🎉 pubSubEdgeCases test completed!');
        testState.pubSubEdgeCases = TestStateStatus.COMPLETED;
      } catch (error) {
        testState.pubSubEdgeCases = TestStateStatus.FAILED;
        if ((logger as any)?.error) (logger as any).error('Test pubSubEdgeCases failed:', error); else console.error('Test pubSubEdgeCases failed:', error);
        throw error;
      }
    });
  }
);
