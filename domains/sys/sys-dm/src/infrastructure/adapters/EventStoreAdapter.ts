import { getParent, XfLogger } from '@aopslab/xf-logger';
import { Effect } from 'effect'

// Application layer imports
import { IPortEventStore } from '../../application/ports/outbound/IPortEventStore.js';
import { IRepositoryPortEventStore } from '../../application/ports/repository-ports/IRepositoryPortEventStore.js';
import { IbmEventStore } from '../../domain/models/index.js';
import {
  EventStoreDomainError,
  EventStoreErrorCode,
  EventStoreErrorFactory,
  type EventStoreServiceError,
} from '../../application/errors/EventStoreServiceError.js'

export interface EventStoreAdapterParams {
  eventStoreRepository: IRepositoryPortEventStore;
  logger?: XfLogger;
}

/**
 * Event Store Adapter
 *
 * AuthSessionAdapter pattern'ini takip ederek oluşturulmuş
 * Basit ve minimal event store işlemleri için adapter
 */
export class EventStoreAdapter implements IPortEventStore {
  private readonly logger?: XfLogger;
  private readonly eventStoreRepository: IRepositoryPortEventStore;

  private mapEventStoreRepositoryError(params: {
    stage: string;
    operation: string;
    code: EventStoreErrorCode;
    eventType?: string;
    aggregateId?: string;
  }): (cause: unknown) => EventStoreServiceError {
    return (cause) => {
      if (cause instanceof EventStoreDomainError) {
        return cause;
      }

      return EventStoreErrorFactory.eventStoreDomainError({
        code: params.code,
        stage: params.stage,
        operation: params.operation,
        message: `Event store repository operation failed: ${params.operation}`,
        eventType: params.eventType,
        aggregateId: params.aggregateId,
        cause,
      });
    };
  }

  constructor({ eventStoreRepository, logger }: EventStoreAdapterParams) {
    this.eventStoreRepository = eventStoreRepository;
    this.logger = logger?.child({ module: this.constructor.name, parent: getParent(logger) });
    this.logger?.debug('EventStoreAdapter initialized');
  }

  /**
   * Event kaydet - En temel işlem
   */
  storeEvent(event: IbmEventStore): Effect.Effect<IbmEventStore, EventStoreServiceError> {
    const stage = `${this.constructor.name}::storeEvent`;
    this.logger?.debug(
      {
        eventType: event.eventType,
        aggregateId: event.aggregateId,
        version: event.version
      },
      'storeEvent'
    );
    return this.eventStoreRepository.storeEvent(event).pipe(
      Effect.mapError(
        this.mapEventStoreRepositoryError({
          stage,
          operation: 'eventStoreRepository.storeEvent',
          code: EventStoreErrorCode.PublishFailed,
          eventType: event.eventType,
          aggregateId: event.aggregateId,
        })
      )
    )
  }

  /**
   * Aggregate'a göre eventleri getir - Event Sourcing için gerekli
   */
  getEventsByAggregate(aggregateId: string): Effect.Effect<IbmEventStore[], EventStoreServiceError> {
    const stage = `${this.constructor.name}::getEventsByAggregate`;
    this.logger?.debug({ aggregateId }, 'getEventsByAggregate');
    return this.eventStoreRepository.getEventsByAggregate(aggregateId).pipe(
      Effect.mapError(
        this.mapEventStoreRepositoryError({
          stage,
          operation: 'eventStoreRepository.getEventsByAggregate',
          code: EventStoreErrorCode.ReadFailed,
          aggregateId,
        })
      )
    )
  }

  /**
   * Event type'a göre eventleri getir - Event type filtering
   */
  getEventsByType(eventType: string, limit?: number): Effect.Effect<IbmEventStore[], EventStoreServiceError> {
    const stage = `${this.constructor.name}::getEventsByType`;
    this.logger?.debug({ eventType, limit }, 'getEventsByType');
    return this.eventStoreRepository.getEventsByType(eventType, limit).pipe(
      Effect.mapError(
        this.mapEventStoreRepositoryError({
          stage,
          operation: 'eventStoreRepository.getEventsByType',
          code: EventStoreErrorCode.ReadFailed,
          eventType,
        })
      )
    )
  }

  /**
   * Tüm eventleri getir - Basit listeleme
   */
  getAllEvents(limit?: number): Effect.Effect<IbmEventStore[], EventStoreServiceError> {
    const stage = `${this.constructor.name}::getAllEvents`;
    this.logger?.debug({ limit }, 'getAllEvents');
    return this.eventStoreRepository.getAllEvents(limit).pipe(
      Effect.mapError(
        this.mapEventStoreRepositoryError({
          stage,
          operation: 'eventStoreRepository.getAllEvents',
          code: EventStoreErrorCode.ReadFailed,
        })
      )
    )
  }

  /**
   * Test amaçlı temizleme
   */
  cleanupAll(): Effect.Effect<number, EventStoreServiceError> {
    this.logger?.debug('cleanupAll called');
    const anyRepo = this.eventStoreRepository as Partial<IRepositoryPortEventStore>;
    if (typeof anyRepo.cleanupAll === 'function') {
      const stage = `${this.constructor.name}::cleanupAll`;
      return anyRepo.cleanupAll().pipe(
        Effect.mapError(
          this.mapEventStoreRepositoryError({
            stage,
            operation: 'eventStoreRepository.cleanupAll',
            code: EventStoreErrorCode.CleanupFailed,
          })
        )
      )
    }
    return Effect.succeed(0)
  }
}
