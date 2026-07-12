import { XfResultLegacy as XfResult } from '@aopslab/xf-core';
import { IbmEventStore } from '../../../domain/models/index.js';

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
  storeEvent(event: IbmEventStore): Promise<XfResult<IbmEventStore>>;

  /**
   * Aggregate'a göre eventleri getir - Event Sourcing için gerekli
   */
  getEventsByAggregate(aggregateId: string): Promise<XfResult<IbmEventStore[]>>;

  /**
   * Event type'a göre eventleri getir - Event type filtering
   */
  getEventsByType(eventType: string, limit?: number): Promise<XfResult<IbmEventStore[]>>;

  /**
   * Tüm eventleri getir - Basit listeleme
   */
  getAllEvents(limit?: number): Promise<XfResult<IbmEventStore[]>>;

  /**
   * Test amaçlı temizleme
   */
  cleanupAll(): Promise<XfResult<number>>;
}
