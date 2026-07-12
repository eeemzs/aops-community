import { Effect } from 'effect'
import { IbmEventStore } from '../../../domain/models/index.js';
import type { EventStoreServiceError } from '../../errors/EventStoreServiceError.js'

/**
 * Event Store Service API Port - Inbound Port
 *
 * Hexagonal Architecture: Service API contract (what the service provides)
 * Minimal approach: Basic event operations + pub/sub capabilities
 */
export interface IEventStoreServicePort {
  /**
   * Publish event - Store + Notify handlers (if any)
   * Primary use case: Event publishing
   */
  publishEvent(event: IbmEventStore): Effect.Effect<void, EventStoreServiceError>;

  /**
   * Subscribe to event type - Register handler for specific event type
   * Use case: Event handler registration
   */
  subscribeToEvent(eventType: string, handler: EventStoreHandler): void;

  /**
   * Unsubscribe from event type - Remove specific handler
   * Use case: Memory leak prevention, dynamic handler management
   * CRITICAL: Prevents memory leaks and enables test isolation
   */
  unsubscribeFromEvent(eventType: string, handler: EventStoreHandler): boolean;

  /**
   * Get events by aggregate - Event sourcing support
   * Use case: Aggregate reconstruction
   */
  getEventsByAggregate(aggregateId: string): Effect.Effect<IbmEventStore[], EventStoreServiceError>;

  /**
   * Get events by type - Event type filtering
   * Use case: Event type specific analysis, debugging
   */
  getEventsByType(eventType: string, limit?: number): Effect.Effect<IbmEventStore[], EventStoreServiceError>;

  /**
   * Get all events - Simple listing
   * Use case: Event monitoring, debugging
   */
  getAllEvents(limit?: number): Effect.Effect<IbmEventStore[], EventStoreServiceError>;

  /**
   * Get subscriber count - How many handlers for event type
   * Use case: Testing, debugging, monitoring
   */
  getSubscriberCount(eventType: string): number;

  /**
   * Clear all subscribers - Reset pub/sub state
   * Use case: Testing cleanup, system reset
   */
  clearAllSubscribers(): void;

  /**
   * Cleanup - Test support
   */
  cleanupAll(): Effect.Effect<number, EventStoreServiceError>;
}

/**
 * Event Store Handler Type
 */
export type EventStoreHandler = (event: IbmEventStore) => Promise<void> | void;
