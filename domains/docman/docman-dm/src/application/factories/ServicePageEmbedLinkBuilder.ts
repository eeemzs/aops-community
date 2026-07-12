/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IPageEmbedLinkServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortPageEmbedLink } from '../ports/repository-ports/index.js'
import { PageEmbedLinkService, type PageEmbedLinkServiceOptions } from '../services/index.js'
import { PageEmbedLinkServiceError } from '../errors/PageEmbedLinkServiceError.js'
import { RepositoryFactoryPageEmbedLink } from './RepositoryFactoryPageEmbedLink.js'

export interface PageEmbedLinkServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface PageEmbedLinkServiceFactoryOverrides {
  pageEmbedLinkRepository?: IRepositoryPortPageEmbedLink
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderPageEmbedLink {
  private config?: PageEmbedLinkServiceFactoryConfig
  private overrides: PageEmbedLinkServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderPageEmbedLink {
    return new ServiceBuilderPageEmbedLink()
  }

  withConfig(config: PageEmbedLinkServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortPageEmbedLink): this {
    this.overrides.pageEmbedLinkRepository = repository
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

  withOverrides(overrides: PageEmbedLinkServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IPageEmbedLinkServicePort, PageEmbedLinkServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.pageEmbedLinkRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderPageEmbedLink::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderPageEmbedLink', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let pageEmbedLinkRepository: IRepositoryPortPageEmbedLink;
      if (self.overrides.pageEmbedLinkRepository) {
        pageEmbedLinkRepository = self.overrides.pageEmbedLinkRepository as IRepositoryPortPageEmbedLink
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderPageEmbedLink::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        pageEmbedLinkRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryPageEmbedLink.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryPageEmbedLink.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderPageEmbedLink::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: PageEmbedLinkServiceOptions = {
        pageEmbedLinkRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new PageEmbedLinkService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IPageEmbedLinkServicePort
    })
  }
}
