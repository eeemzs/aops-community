import { IbmEventStore } from '../../../domain/models/index.js';
import { Effect } from 'effect'
import type { RepositoryError } from '@aopslab/xf-db'

/**
 * Minimal Event Store Repository Port
 * Database-based event store için basit ve yeterli contract
 */
export interface IRepositoryPortEventStore {
  /**
   * Event kaydet - En temel işlem
   */
  storeEvent(event: IbmEventStore): Effect.Effect<IbmEventStore, RepositoryError | Error>;

  /**
   * Aggregate'a göre eventleri getir - Event Sourcing için gerekli
   */
  getEventsByAggregate(aggregateId: string): Effect.Effect<IbmEventStore[], RepositoryError | Error>;

  /**
   * Event type'a göre eventleri getir - Event type filtering
   */
  getEventsByType(eventType: string, limit?: number): Effect.Effect<IbmEventStore[], RepositoryError | Error>;

  /**
   * Tüm eventleri getir - Basit listeleme
   */
  getAllEvents(limit?: number): Effect.Effect<IbmEventStore[], RepositoryError | Error>;

  /**
   * Test amaçlı temizleme
   */
  cleanupAll?(): Effect.Effect<number, RepositoryError | Error>;
}
