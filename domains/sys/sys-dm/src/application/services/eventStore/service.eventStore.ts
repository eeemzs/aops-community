import { getParent, XfLogger } from '@aopslab/xf-logger';
import { effectErrorInfo } from '@aopslab/xf-core'
import { Effect } from 'effect'
import { z } from 'zod'

// Application layer imports
import { IEventStoreServicePort, EventStoreHandler } from '../../ports/inbound/IEventStoreServicePort.js';
import { IPortEventStore } from '../../ports/outbound/IPortEventStore.js';
import { IbmEventStore } from '../../../domain/models/index.js';
import {
  EventStoreDomainError,
  EventStoreErrorFactory,
  EventStoreErrorCode,
  type EventStoreServiceError
} from '../../errors/EventStoreServiceError.js';
import { validateBmInputWithSchema } from '../service.zod-validation.js'

const eventStorePublishSchema = z.object({
  eventId: z.string().trim().min(1),
  eventType: z.string().trim().min(1),
  aggregateId: z.string().trim().min(1),
  eventData: z.string().trim().min(1),
  occurredAt: z.date(),
  version: z.number().int(),
})

const aggregateLookupSchema = z.object({
  aggregateId: z.string().trim().min(1),
})

const eventTypeLookupSchema = z.object({
  eventType: z.string().trim().min(1),
  limit: z.number().int().positive().optional(),
})

const allEventsLookupSchema = z.object({
  limit: z.number().int().positive().optional(),
})

export interface EventStoreServiceOptions {
  eventStorePort: IPortEventStore; // Adapter (not direct repository)
  logger?: XfLogger;
}

/**
 * Event Store Service
 *
 * =================================================================
 *                        ANALİZ RAPORU
 * =================================================================
 *
 * 1. **MİMARİ YAPI (Hexagonal Architecture):**
 *    - Bu servis, "Hexagonal Architecture" (Ports and Adapters) tasarım desenini uygular.
 *    - Temel iş mantığını (use-case orchestration) teknoloji detaylarından (veritabanı gibi) ayırır.
 *    - Dış dünya ile `IPortEventStore` (outbound port) üzerinden iletişim kurar. Bu, veritabanı
 *      teknolojisinin (MongoDB, Redis, vb.) servis kodunu değiştirmeden kolayca değiştirilebilmesini sağlar.
 *
 * 2. **TEMEL SORUMLULUKLAR:**
 *    - **Olay Depolama (Delegasyon):** Olayları kalıcı hale getirme ve sorgulama işlemlerini `eventStorePort`
 *      adaptörüne delege eder.
 *    - **Bellek-içi Pub/Sub (In-Memory Pub/Sub):** Olay yayınlandığında, ilgili olay türüne abone olan
 *      "handler" fonksiyonlarını bellek içinde anında tetikler.
 *
 * 3. **FONKSİYONEL ÖZELLİKLER:**
 *    - `publishEvent`: İki adımlı bir işlem yürütür: Önce olayı adaptör aracılığıyla depolar,
 *      başarılı olursa aboneleri bilgilendirir. Bir abonenin (handler) hata vermesi, genel işlemi
 *      durdurmaz, sadece loglanır. Bu, sistemin dayanıklılığını artırır.
 *    - `subscribeToEvent` / `unsubscribeFromEvent`: Bellek-içi abonelik mekanizmasını yönetir.
 *      `unsubscribeFromEvent`, özellikle test izolasyonu ve bellek sızıntılarını (memory leaks)
 *      önlemek için kritik öneme sahiptir.
 *
 * 4. **TEST EDİLEBİLİRLİK:**
 *    - Bağımlılıkların dışarıdan enjekte edilmesi (Dependency Injection) sayesinde yüksek oranda
 *      test edilebilir bir yapıya sahiptir. Testlerde, gerçek veritabanı adaptörleri yerine
 *      sahte (mock) nesneler kolayca kullanılabilir.
 *
 * 5. **ÖNEMLİ NOT (DAĞITIK SİSTEMLER):**
 *    - Mevcut pub/sub mekanizması **bellek-içidir (in-memory)**. Bu, servisin tek bir süreç (single process)
 *      içinde çalıştığı durumlar için idealdir.
 *    - Eğer sistem birden fazla sunucuya veya mikroservise yayılacak olursa (distributed system),
 *      bu mekanizmanın Redis Pub/Sub, RabbitMQ veya Kafka gibi harici bir mesajlaşma sistemiyle
 *      değiştirilmesi gerekir. Mevcut mimari, bu tür bir değişikliği kolaylaştıracak şekilde tasarlanmıştır.
 *
 * =================================================================
 *
 * Hexagonal Architecture: Use-case orchestrator
 * - Service orchestrates use-cases
 * - Uses adapters (not direct repository)
 * - Provides pub/sub capabilities
 * - Minimal implementation
 */
export class EventStoreService implements IEventStoreServicePort {
  private readonly logger?: XfLogger;
  private readonly eventStorePort: IPortEventStore;
  private readonly handlers = new Map<string, EventStoreHandler[]>();

  constructor(options: EventStoreServiceOptions) {
    this.eventStorePort = options.eventStorePort;
    this.logger = options.logger?.child({
      module: this.constructor.name,
      parent: getParent(options.logger)
    });
    this.logger?.debug('EventStoreService initialized');
  }

  private mapEventStorePortError(params: {
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
        message: `Event store operation failed: ${params.operation}`,
        eventType: params.eventType,
        aggregateId: params.aggregateId,
        cause,
      });
    };
  }

  /**
   * Publish event - Store + Notify handlers
   * Use case orchestration: Storage + In-memory notification
   */
  publishEvent(event: IbmEventStore): Effect.Effect<void, EventStoreServiceError> {
    this.logger?.debug(
      {
        eventType: event.eventType,
        aggregateId: event.aggregateId
      },
      'publishEvent'
    );
    const self = this
    const notifyEffect = (validatedEvent: IbmEventStore) => Effect.gen(function* (_) {
      const handlers = self.handlers.get(validatedEvent.eventType) || []
      self.logger?.debug({ eventType: validatedEvent.eventType, handlerCount: handlers.length }, 'notifying handlers')
      // Run all handlers; ignore individual handler errors
      yield* _(Effect.forEach(
        handlers,
        (h) => Effect.tryPromise(() => Promise.resolve(h(validatedEvent))).pipe(Effect.catchAll(() => Effect.succeed(undefined))),
        { concurrency: 'unbounded', discard: true }
      ))
      return undefined
    })

    const stage = `${self.constructor.name}::publishEvent`
    return Effect.gen(function* (_) {
      const validatedEvent = yield* _(
        validateBmInputWithSchema({
          input: event,
          schema: eventStorePublishSchema,
          stage,
          operation: 'publishEvent',
          field: 'event',
        })
      )
      yield* _(
        self.eventStorePort.storeEvent(validatedEvent).pipe(
          Effect.mapError(
            self.mapEventStorePortError({
              stage,
              operation: 'eventStorePort.storeEvent',
              code: EventStoreErrorCode.PublishFailed,
              eventType: validatedEvent.eventType,
              aggregateId: validatedEvent.aggregateId,
            })
          )
        )
      )
      yield* _(notifyEffect(validatedEvent))
    }).pipe(
      Effect.catchAll((error) =>
        Effect.fail(
          EventStoreErrorFactory.eventStoreDomainError({
            code: EventStoreErrorCode.PublishFailed,
            message: 'Error publishing event',
            stage,
            eventType: event.eventType,
            aggregateId: event.aggregateId,
            cause: error,
          })
        )
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          self.logger?.error({ error: info.unwrapped, cause: info.pretty, stage }, 'publishEvent failed')
        })
      )
    )
  }

  /**
   * Subscribe to event type - Register handler
   */
  subscribeToEvent(eventType: string, handler: EventStoreHandler): void {
    this.logger?.debug({ eventType }, 'subscribeToEvent');

    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);

    this.logger?.debug(
      {
        eventType,
        totalHandlers: handlers.length
      },
      'handler registered'
    );
  }

  /**
   * Unsubscribe from event type - Remove specific handler
   * CRITICAL: Prevents memory leaks and enables test isolation
   */
  unsubscribeFromEvent(eventType: string, handler: EventStoreHandler): boolean {
    this.logger?.debug({ eventType }, 'unsubscribeFromEvent');

    const handlers = this.handlers.get(eventType);
    if (!handlers) {
      this.logger?.debug({ eventType }, 'no handlers found for event type');
      return false;
    }

    const initialLength = handlers.length;
    const handlerIndex = handlers.indexOf(handler);

    if (handlerIndex === -1) {
      this.logger?.debug({ eventType, handlerCount: handlers.length }, 'handler not found');
      return false;
    }

    handlers.splice(handlerIndex, 1);

    // Remove event type if no handlers left
    if (handlers.length === 0) {
      this.handlers.delete(eventType);
      this.logger?.debug({ eventType }, 'event type removed - no handlers remaining');
    } else {
      this.handlers.set(eventType, handlers);
    }

    this.logger?.debug(
      {
        eventType,
        removedHandler: true,
        remainingHandlers: handlers.length,
        totalRemoved: initialLength - handlers.length
      },
      'handler unsubscribed'
    );

    return true;
  }

  /**
   * Get events by aggregate - Delegate to adapter
   */
  getEventsByAggregate(aggregateId: string): Effect.Effect<IbmEventStore[], EventStoreServiceError> {
    this.logger?.debug({ aggregateId }, 'getEventsByAggregate');
    const stage = `${this.constructor.name}::getEventsByAggregate`
    return Effect.gen(this, function* (_) {
      const validated = yield* _(
        validateBmInputWithSchema({
          input: { aggregateId },
          schema: aggregateLookupSchema,
          stage,
          operation: 'getEventsByAggregate',
          field: 'aggregateId',
        })
      )
      return yield* _(
        this.eventStorePort.getEventsByAggregate(validated.aggregateId).pipe(
          Effect.mapError(
            this.mapEventStorePortError({
              stage,
              operation: 'eventStorePort.getEventsByAggregate',
              code: EventStoreErrorCode.ReadFailed,
              aggregateId: validated.aggregateId,
            })
          )
        )
      )
    }).pipe(
      Effect.mapError(
        this.mapEventStorePortError({
          stage,
          operation: 'eventStorePort.getEventsByAggregate',
          code: EventStoreErrorCode.ReadFailed,
          aggregateId,
        })
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, cause: info.pretty, stage }, 'getEventsByAggregate failed')
        })
      )
    )
  }

  /**
   * Get events by type - Delegate to adapter
   */
  getEventsByType(eventType: string, limit?: number): Effect.Effect<IbmEventStore[], EventStoreServiceError> {
    this.logger?.debug({ eventType, limit }, 'getEventsByType');
    const stage = `${this.constructor.name}::getEventsByType`
    return Effect.gen(this, function* (_) {
      const validated = yield* _(
        validateBmInputWithSchema({
          input: { eventType, limit },
          schema: eventTypeLookupSchema,
          stage,
          operation: 'getEventsByType',
          field: 'eventType',
        })
      )
      return yield* _(
        this.eventStorePort.getEventsByType(validated.eventType, validated.limit).pipe(
          Effect.mapError(
            this.mapEventStorePortError({
              stage,
              operation: 'eventStorePort.getEventsByType',
              code: EventStoreErrorCode.ReadFailed,
              eventType: validated.eventType,
            })
          )
        )
      )
    }).pipe(
      Effect.mapError(
        this.mapEventStorePortError({
          stage,
          operation: 'eventStorePort.getEventsByType',
          code: EventStoreErrorCode.ReadFailed,
          eventType,
        })
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, cause: info.pretty, stage }, 'getEventsByType failed')
        })
      )
    )
  }

  /**
   * Get all events - Delegate to adapter
   */
  getAllEvents(limit?: number): Effect.Effect<IbmEventStore[], EventStoreServiceError> {
    this.logger?.debug({ limit }, 'getAllEvents');
    const stage = `${this.constructor.name}::getAllEvents`
    return Effect.gen(this, function* (_) {
      const validated = yield* _(
        validateBmInputWithSchema({
          input: { limit },
          schema: allEventsLookupSchema,
          stage,
          operation: 'getAllEvents',
          field: 'limit',
        })
      )
      return yield* _(
        this.eventStorePort.getAllEvents(validated.limit).pipe(
          Effect.mapError(
            this.mapEventStorePortError({
              stage,
              operation: 'eventStorePort.getAllEvents',
              code: EventStoreErrorCode.ReadFailed,
            })
          )
        )
      )
    }).pipe(
      Effect.mapError(
        this.mapEventStorePortError({
          stage,
          operation: 'eventStorePort.getAllEvents',
          code: EventStoreErrorCode.ReadFailed,
        })
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, cause: info.pretty, stage }, 'getAllEvents failed')
        })
      )
    )
  }

  /**
   * Get subscriber count - In-memory handler count
   */
  getSubscriberCount(eventType: string): number {
    const handlers = this.handlers.get(eventType);
    const count = handlers ? handlers.length : 0;
    this.logger?.debug({ eventType, count }, 'getSubscriberCount');
    return count;
  }

  /**
   * Clear all subscribers - Reset pub/sub state
   */
  clearAllSubscribers(): void {
    const totalEventTypes = this.handlers.size;
    const totalHandlers = Array.from(this.handlers.values()).reduce((sum, handlers) => sum + handlers.length, 0);

    this.handlers.clear();

    this.logger?.debug(
      {
        clearedEventTypes: totalEventTypes,
        clearedHandlers: totalHandlers
      },
      'clearAllSubscribers'
    );
  }

  /**
   * Cleanup - Delegate to adapter + clear handlers
   */
  cleanupAll(): Effect.Effect<number, EventStoreServiceError> {
    this.logger?.debug('cleanupAll');
    const stage = `${this.constructor.name}::cleanupAll`
    // Clear in-memory handlers
    this.handlers.clear();
    return this.eventStorePort.cleanupAll().pipe(
      Effect.mapError(
        this.mapEventStorePortError({
          stage,
          operation: 'eventStorePort.cleanupAll',
          code: EventStoreErrorCode.CleanupFailed,
        })
      ),
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          this.logger?.error({ error: info.unwrapped, cause: info.pretty, stage }, 'cleanupAll failed')
        })
      )
    )
  }
}
