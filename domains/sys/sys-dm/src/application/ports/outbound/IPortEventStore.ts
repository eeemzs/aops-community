import { Effect } from 'effect'
import { IbmEventStore } from '../../../domain/models/index.js';
import type { EventStoreServiceError } from '../../errors/EventStoreServiceError.js'

/**
 * Event Store Port - Outbound Port Interface
 *
 * Basit ve minimal event store işlemleri için port interface
 * Repository pattern'i üzerinden event store storage işlemlerini soyutlar
 */
export interface IPortEventStore {
  /**
   * Event kaydet - En temel işlem
   */
  storeEvent(event: IbmEventStore): Effect.Effect<IbmEventStore, EventStoreServiceError>;

  /**
   * Aggregate'a göre eventleri getir - Event Sourcing için gerekli
   */
  getEventsByAggregate(aggregateId: string): Effect.Effect<IbmEventStore[], EventStoreServiceError>;

  /**
   * Event type'a göre eventleri getir - Event type filtering
   */
  getEventsByType(eventType: string, limit?: number): Effect.Effect<IbmEventStore[], EventStoreServiceError>;

  /**
   * Tüm eventleri getir - Basit listeleme
   */
  getAllEvents(limit?: number): Effect.Effect<IbmEventStore[], EventStoreServiceError>;

  /**
   * Test amaçlı temizleme
   */
  cleanupAll(): Effect.Effect<number, EventStoreServiceError>;
}
