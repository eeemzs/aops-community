/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IEmbedServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortEmbed } from '../ports/repository-ports/index.js'
import { EmbedService, type EmbedServiceOptions } from '../services/index.js'
import { EmbedServiceError } from '../errors/EmbedServiceError.js'
import { RepositoryFactoryEmbed } from './RepositoryFactoryEmbed.js'

export interface EmbedServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface EmbedServiceFactoryOverrides {
  embedRepository?: IRepositoryPortEmbed
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderEmbed {
  private config?: EmbedServiceFactoryConfig
  private overrides: EmbedServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderEmbed {
    return new ServiceBuilderEmbed()
  }

  withConfig(config: EmbedServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortEmbed): this {
    this.overrides.embedRepository = repository
    return this
  }

  withLogger(logger?: XfLogger): this {
    if (this.config) {
      this.config.logger = logger
    }
    return this
  }

  withLogLevel(logLevel?: string): this {
    this.logLevel = logLevel
    return this
  }

  withOverrides(overrides: EmbedServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IEmbedServicePort, EmbedServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.embedRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderEmbed::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderEmbed', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let embedRepository: IRepositoryPortEmbed;
      if (self.overrides.embedRepository) {
        embedRepository = self.overrides.embedRepository as IRepositoryPortEmbed
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderEmbed::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        embedRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryEmbed.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryEmbed.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderEmbed::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: EmbedServiceOptions = {
        embedRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new EmbedService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IEmbedServicePort
    })
  }
}
