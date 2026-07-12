/**
 * EventStoreServiceBuilder - Builder for EventStoreService
 *
 * Responsibilities:
 * 1. Builds EventStoreService with dependency injection
 * 2. Supports testing overrides and complex configurations
 * 3. Creates adapter layer between service and repository
 * 4. Follows established builder pattern from RateLimiterServiceBuilder
 *
 * Location: application/factories/
 * Hexagonal Architecture: Factory Layer
 * Pattern: Follows RateLimiterServiceBuilder structure
 */

import { getParent, XfLogger } from '@aopslab/xf-logger';
import { Effect } from 'effect'
import { EventStoreService } from '../services/eventStore/service.eventStore.js';
import { IEventStoreServicePort } from '../ports/inbound/IEventStoreServicePort.js';
import { IRepositoryPortEventStore } from '../ports/repository-ports/IRepositoryPortEventStore.js';
import { IPortEventStore } from '../ports/outbound/IPortEventStore.js';
import { EventStoreAdapter } from '../../infrastructure/adapters/EventStoreAdapter.js';
import { LocaleOptions } from '@aopslab/xf-dm';
import { EventStoreRepositoryFactory } from './RepositoryFactoryEventStore.js';
import { RepositoryConfig } from '@aopslab/xf-db';
import { RedisConfig } from '@aopslab/xf-db-redis';

// ===== CONFIGURATION TYPES =====
export interface EventStoreServiceFactoryConfig {
  eventStoreRepositoryConfig?: RepositoryConfig;
  redisConfig?: RedisConfig; // ✅ Add Redis config support
  options?: LocaleOptions;
  logger?: XfLogger;
  logLevel?: string;
}

export interface EventStoreServiceFactoryOverrides {
  repository?: IRepositoryPortEventStore;
  eventStorePort?: IPortEventStore;
}

// ===== BUILDER CLASS =====

export class ServiceBuilderEventStore {
  private config?: EventStoreServiceFactoryConfig;
  private overrides: EventStoreServiceFactoryOverrides = {};
  private logLevel?: string;
  private logger?: XfLogger;

  constructor() {
    // Builder başlangıç state'i
  }

  static create(): ServiceBuilderEventStore {
    return new ServiceBuilderEventStore();
  }

  /**
   * Set the main configuration object
   */
  withConfig(config: EventStoreServiceFactoryConfig): ServiceBuilderEventStore {
    this.config = config;
    return this;
  }

  /**
   * Override repository (useful for testing)
   */
  withRepository(repository: IRepositoryPortEventStore): ServiceBuilderEventStore {
    this.overrides.repository = repository;
    return this;
  }

  /**
   * Override event store port directly (advanced usage)
   */
  withEventStorePort(port: IPortEventStore): ServiceBuilderEventStore {
    this.overrides.eventStorePort = port;
    return this;
  }

  /**
   * Enable debug mode for detailed logging
   */
  withLogLevel(logLevel?: string): ServiceBuilderEventStore {
    this.logLevel = logLevel;
    return this;
  }

  /**
   * Validate builder configuration and overrides.
   */
  validate(): ServiceBuilderEventStore {
    if (!this.config) {
      throw new Error('EventStoreServiceBuilder: config is required before validation');
    }

    // Validate repository configuration vs overrides
    if (this.config.eventStoreRepositoryConfig && this.overrides.repository) {
      throw new Error('EventStoreServiceBuilder: eventStoreRepositoryConfig and repository cannot be provided together');
    }

    if (!this.config.eventStoreRepositoryConfig && !this.overrides.repository) {
      throw new Error('EventStoreServiceBuilder: eventStoreRepositoryConfig or repository must be provided');
    }

    if (this.config.eventStoreRepositoryConfig?.repositoryType === 'redis' && !this.config.redisConfig) {
      throw new Error(
        'EventStoreServiceBuilder: redisConfig must be provided when eventStoreRepositoryConfig.repositoryType is redis'
      );
    }

    if (this.overrides.eventStorePort && this.overrides.repository) {
      throw new Error('EventStoreServiceBuilder: eventStorePort and repository cannot be provided together');
    }

    // Future validations can be added here

    return this;
  }

  /**
   * Build the final service instance
   */
  build(): Effect.Effect<IEventStoreServicePort, Error> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config) {
        return yield* _(Effect.fail(new Error('EventStoreServiceBuilder: config is required')))
      }
      self.logLevel = self.logLevel ? self.logLevel : self.config.logLevel ? self.config.logLevel : 'info'
      self.logger = self.config.logger?.child(
        { module: 'EventStoreServiceBuilder', parent: getParent(self.config.logger) },
        { level: self.logLevel }
      )

      self.validate()

      const eventStoreRepository = self.overrides.repository
        ? self.overrides.repository
        : (yield* _(Effect.tryPromise(() => self.createEventStoreRepository())))
      const eventStorePort = self.overrides.eventStorePort
        ? self.overrides.eventStorePort
        : (yield* _(Effect.tryPromise(() => self.createEventStorePort(eventStoreRepository))))

      const eventStoreService = new EventStoreService({ eventStorePort, logger: self.logger })
      yield* _(Effect.sync(() => self.logger?.info('EventStoreService created successfully with builder pattern')))
      return eventStoreService as IEventStoreServicePort
    })
  }

  /**
   * Create event store repository from config
   */
  private async createEventStoreRepository(): Promise<IRepositoryPortEventStore> {
    if (!this.config?.eventStoreRepositoryConfig) {
      throw new Error('EventStoreServiceBuilder: eventStoreRepositoryConfig is required when repository is not provided');
    }

    return (await import('effect')).Effect.runPromise(
      EventStoreRepositoryFactory.create({
      repositoryConfig: this.config.eventStoreRepositoryConfig as RepositoryConfig,
      redisConfig: this.config.redisConfig,
      logger: this.logger
    })
    );
  }

  /**
   * Create event store adapter (port implementation)
   */
  private async createEventStorePort(eventStoreRepository: IRepositoryPortEventStore): Promise<IPortEventStore> {
    return new EventStoreAdapter({
      eventStoreRepository,
      logger: this.logger
    }) as IPortEventStore;
  }
}
