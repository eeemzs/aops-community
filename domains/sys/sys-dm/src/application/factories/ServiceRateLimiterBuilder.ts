import { getParent, XfLogger } from '@aopslab/xf-logger';
import { Effect } from 'effect'
import { RateLimiterService } from '../services/rateLimiter/service.rateLimiter.js';
import { IRateLimiterServicePort } from '../ports/inbound/IRateLimiterServicePort.js';
import { IRepositoryPortRateLimiter } from '../ports/repository-ports/index.js';
import { IPortRateLimiter } from '../ports/outbound/IPortRateLimiter.js';
import { RateLimiterAdapter } from '../../infrastructure/adapters/RateLimiterAdapter.js';
import { LocaleOptions } from '@aopslab/xf-dm';
import { RateLimitRule } from '../ports/types.js';
import { RepositoryConfig } from '@aopslab/xf-db';
import { RateLimiterRepositoryFactory } from './RepositoryFactoryRateLimiter.js';
import { RedisConfig } from '@aopslab/xf-db-redis';

// ===== CONFIGURATION TYPES =====
export interface RateLimiterServiceFactoryConfig {
  rateLimiterRepositoryConfig?: RepositoryConfig;
  defaultRules?: Record<string, RateLimitRule>; // key: scope, value: RateLimitRule
  redisConfig?: RedisConfig;
  options?: LocaleOptions; // Can be extended with more options in the future
  logger?: XfLogger;
  logLevel?: string;
}

export interface RateLimiterServiceFactoryOverrides {
  repository?: IRepositoryPortRateLimiter;
  rateLimiterPort?: IPortRateLimiter;
  defaultRules?: Record<string, RateLimitRule>; // key: scope, value: RateLimitRule
}

// ===== BUILDER CLASS =====

export class ServiceBuilderRateLimiter {
  private config?: RateLimiterServiceFactoryConfig;
  private overrides: RateLimiterServiceFactoryOverrides = {};
  private logLevel?: string;
  private logger?: XfLogger;

  constructor() {
    // Builder başlangıç state'i
  }

  static create(): ServiceBuilderRateLimiter {
    return new ServiceBuilderRateLimiter();
  }

  /**
   * Set the main configuration object
   */
  withConfig(config: RateLimiterServiceFactoryConfig): ServiceBuilderRateLimiter {
    this.config = config;
    return this;
  }

  /**
   * Override repository (useful for testing)
   */
  withRepository(repository: IRepositoryPortRateLimiter): ServiceBuilderRateLimiter {
    this.overrides.repository = repository;
    return this;
  }

  /**
   * Override rate limiter port directly (advanced usage)
   */
  withRateLimiterPort(port: IPortRateLimiter): ServiceBuilderRateLimiter {
    this.overrides.rateLimiterPort = port;
    return this;
  }

  /**
   * Set default rules for rate limiting
   */
  withDefaultRules(rules: Record<string, RateLimitRule>): ServiceBuilderRateLimiter {
    if (!this.config) {
      // Create a default config
      this.config = {
        defaultRules: rules
      };
    } else {
      this.config.defaultRules = rules;
    }
    return this;
  }

  /**
   * Enable debug mode for detailed logging
   */
  withLogLevel(logLevel?: string): ServiceBuilderRateLimiter {
    this.logLevel = logLevel;
    return this;
  }

  /**
   * Validate builder configuration and overrides.
   * Consolidates all checks so they can be reused or invoked separately.
   */
  validate(): ServiceBuilderRateLimiter {
    if (!this.config) {
      throw new Error('RateLimiterServiceBuilder: config is required before validation');
    }

    // Ensure repository information is provided either via overrides or config
    if (this.config.rateLimiterRepositoryConfig && this.overrides.repository) {
      throw new Error('RateLimiterServiceBuilder: rateLimiterRepositoryConfig and repository cannot be provided together');
    }

    if (!this.config.rateLimiterRepositoryConfig && !this.overrides.repository) {
      throw new Error('RateLimiterServiceBuilder: rateLimiterRepositoryConfig or repository must be provided');
    }

    if (this.config.rateLimiterRepositoryConfig?.repositoryType === 'redis' && !this.config.redisConfig) {
      throw new Error(
        'RateLimiterServiceBuilder: redisConfig must be provided when rateLimiterRepositoryConfig.repositoryType is redis'
      );
    }

    // future validations can be added here

    return this;
  }

  /**
   * Build the final service instance
   */
  build(): Effect.Effect<IRateLimiterServicePort, Error> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config) {
        return yield* _(Effect.fail(new Error('RateLimiterServiceBuilder: config is required')))
      }

      self.logLevel = self.logLevel ? self.logLevel : self.config.logLevel ? self.config.logLevel : 'info'
      self.logger = self.config.logger?.child(
        { module: 'RateLimiterServiceBuilder', parent: getParent(self.config.logger) },
        { level: self.logLevel }
      )

      // Validate configuration before building
      self.validate()

      // Resolve repository (override takes precedence)
      const rateLimiterRepository: IRepositoryPortRateLimiter = self.overrides.repository
        ? self.overrides.repository
        : (yield* _(Effect.tryPromise(() => self.createRateLimiterRepository())))

      // Resolve port (override takes precedence)
      const rateLimiterPort: IPortRateLimiter = self.overrides.rateLimiterPort
        ? self.overrides.rateLimiterPort
        : (yield* _(Effect.tryPromise(() => self.createRateLimiterPort(rateLimiterRepository))))

      const rateLimiterService = new RateLimiterService(
        rateLimiterPort,
        {
          locale: self.config.options?.locale,
          fallbackLocale: self.config.options?.fallbackLocale,
        },
        self.logger
      )
      yield* _(Effect.sync(() => self.logger?.info('RateLimiterService created successfully with builder pattern')))
      return rateLimiterService as IRateLimiterServicePort
    })
  }

  private async createRateLimiterRepository(): Promise<IRepositoryPortRateLimiter> {
    if (!this.config?.rateLimiterRepositoryConfig) {
      throw new Error('RateLimiterServiceBuilder: rateLimiterRepositoryConfig is required when repository is not provided');
    }

    const { Effect } = await import('effect')
    return Effect.runPromise(
      RateLimiterRepositoryFactory.create({
        repositoryConfig: this.config.rateLimiterRepositoryConfig as RepositoryConfig,
        redisConfig: this.config.redisConfig,
        logger: this.logger
      })
    );
  }

  private async createRateLimiterPort(rateLimiterRepository: IRepositoryPortRateLimiter): Promise<IPortRateLimiter> {
    return new RateLimiterAdapter({
      rateLimiterRepository,
      defaultRules: this.config?.defaultRules,
      logger: this.logger
    }) as IPortRateLimiter;
  }
}
