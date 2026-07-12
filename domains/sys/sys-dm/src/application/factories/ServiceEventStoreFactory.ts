import { Effect } from 'effect'
import { IEventStoreServicePort } from '../ports/inbound/IEventStoreServicePort.js';
import {
  ServiceBuilderEventStore,
  EventStoreServiceFactoryConfig,
  EventStoreServiceFactoryOverrides
} from './ServiceEventStoreBuilder.js';
import { EventStoreRepositoryFactory } from './RepositoryFactoryEventStore.js';
import { EventStoreAdapter } from '../../infrastructure/adapters/EventStoreAdapter.js';
import { IRepositoryPortEventStore } from '../ports/repository-ports/IRepositoryPortEventStore.js';
import { IPortEventStore } from '../ports/outbound/IPortEventStore.js';
import { RepositoryConfig } from '@aopslab/xf-db';
import { RedisConfig } from '@aopslab/xf-db-redis';
import { getParent } from '@aopslab/xf-logger';
import { XfConfigurationError } from '@aopslab/xf-core'

// --- Factory Implementation ---
export const ServiceFactoryEventStore = {
  /**
   * Factory method to create EventStoreService via builder truth-of-origin.
   * @param config Core configuration for builder
   * @param overrides Optional overrides (repository, eventStorePort)
   */
  create(
    config: EventStoreServiceFactoryConfig,
    overrides: Partial<EventStoreServiceFactoryOverrides> = {}
  ): Effect.Effect<IEventStoreServicePort, Error> {
    // const logger: XfLogger | undefined = config.logger;
    const logger = config.logger?.child(
      { module: this.constructor.name, parent: getParent(config.logger) },
      { level: config.logLevel ? config.logLevel : 'info' }
    );

    // === Repository ===
    return Effect.gen(function* (_) {
      const eventStoreRepository: IRepositoryPortEventStore =
        overrides.repository ?? (yield* _(EventStoreRepositoryFactory.create({
          repositoryConfig: config.eventStoreRepositoryConfig as RepositoryConfig,
          redisConfig: config.redisConfig as RedisConfig,
          logger
        })));

    // === Port ===
      const eventStorePort: IPortEventStore =
        overrides.eventStorePort ??
        new EventStoreAdapter({
          eventStoreRepository,
          logger
        });

    // === Delegate to Builder ===
      const builder = ServiceBuilderEventStore.create()
        .withConfig(config)
        .withRepository(eventStoreRepository)
        .withEventStorePort(eventStorePort)
        .withLogLevel(config.logLevel);

    // Build via builder (truth-of-origin)
      return yield* _(builder.build());
    }).pipe(
      Effect.mapError((e) => new XfConfigurationError({ message: (e as any)?.message ?? 'EventStore factory failed', stage: 'ServiceFactoryEventStore::create', cause: e }))
    )
  },

  /**
   * Builder entry point for advanced usage.
   */
  builder(): ServiceBuilderEventStore {
    return ServiceBuilderEventStore.create();
  }
};
