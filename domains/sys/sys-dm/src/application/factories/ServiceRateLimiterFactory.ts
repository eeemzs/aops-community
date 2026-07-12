import { Effect } from 'effect'
import { IRateLimiterServicePort } from '../ports/inbound/IRateLimiterServicePort.js';
import {
  ServiceBuilderRateLimiter,
  RateLimiterServiceFactoryConfig,
  RateLimiterServiceFactoryOverrides
} from './ServiceRateLimiterBuilder.js';
import { RateLimiterRepositoryFactory } from './RepositoryFactoryRateLimiter.js';
import { RateLimiterAdapter } from '../../infrastructure/adapters/RateLimiterAdapter.js';
import { IRepositoryPortRateLimiter } from '../ports/repository-ports/index.js';
import { IPortRateLimiter } from '../ports/outbound/IPortRateLimiter.js';
import { RepositoryConfig } from '@aopslab/xf-db';
import { RedisConfig } from '@aopslab/xf-db-redis';
import { getParent } from '@aopslab/xf-logger';
import { XfConfigurationError } from '@aopslab/xf-core'

// --- Factory Implementation ---
export const ServiceFactoryRateLimiter = {
  /**
   * Simple factory method to create RateLimiterService.
   * @param config Core configuration
   * @param overrides Optional overrides (repository, port, defaultRules)
   */
  create(
    config: RateLimiterServiceFactoryConfig,
    overrides: Partial<RateLimiterServiceFactoryOverrides> = {}
  ): Effect.Effect<IRateLimiterServicePort, Error> {
    // const logger: XfLogger | undefined = config.logger;
    const logger = config.logger?.child(
      { module: this.constructor.name, parent: getParent(config.logger) },
      { level: config.logLevel ? config.logLevel : 'info' }
    );

    // === Repository ===
    return Effect.gen(function* (_) {
      const rateLimiterRepository: IRepositoryPortRateLimiter =
        overrides.repository ?? (yield* _(RateLimiterRepositoryFactory.create({
          repositoryConfig: config.rateLimiterRepositoryConfig as RepositoryConfig,
          redisConfig: config.redisConfig as RedisConfig,
          logger
        })));

      // === Port ===
      const rateLimiterPort: IPortRateLimiter =
        overrides.rateLimiterPort ??
        new RateLimiterAdapter({
          rateLimiterRepository,
          defaultRules: overrides.defaultRules ?? config.defaultRules,
          logger
        });

      // === Delegate to Builder ===
      const builder = ServiceBuilderRateLimiter.create().withConfig(config);

      builder
        .withRepository(rateLimiterRepository)
        .withRateLimiterPort(rateLimiterPort)
        .withLogLevel(config.logLevel);

      if (overrides.defaultRules) {
        builder.withDefaultRules(overrides.defaultRules);
      }

      // Build via builder (Effect)
      return yield* _(builder.build());
    }).pipe(
      Effect.mapError((e) => new XfConfigurationError({ message: (e as any)?.message ?? 'RateLimiter factory failed', stage: 'ServiceFactoryRateLimiter::create', cause: e }))
    )
  },

  /**
   * Builder entry point for advanced usage.
   */
  builder(): ServiceBuilderRateLimiter {
    return ServiceBuilderRateLimiter.create();
  }
};
