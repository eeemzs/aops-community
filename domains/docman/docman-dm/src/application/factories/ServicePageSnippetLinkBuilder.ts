/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IPageSnippetLinkServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortPageSnippetLink } from '../ports/repository-ports/index.js'
import { PageSnippetLinkService, type PageSnippetLinkServiceOptions } from '../services/index.js'
import { PageSnippetLinkServiceError } from '../errors/PageSnippetLinkServiceError.js'
import { RepositoryFactoryPageSnippetLink } from './RepositoryFactoryPageSnippetLink.js'

export interface PageSnippetLinkServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface PageSnippetLinkServiceFactoryOverrides {
  pageSnippetLinkRepository?: IRepositoryPortPageSnippetLink
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderPageSnippetLink {
  private config?: PageSnippetLinkServiceFactoryConfig
  private overrides: PageSnippetLinkServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderPageSnippetLink {
    return new ServiceBuilderPageSnippetLink()
  }

  withConfig(config: PageSnippetLinkServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortPageSnippetLink): this {
    this.overrides.pageSnippetLinkRepository = repository
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

  withOverrides(overrides: PageSnippetLinkServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IPageSnippetLinkServicePort, PageSnippetLinkServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.pageSnippetLinkRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderPageSnippetLink::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderPageSnippetLink', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let pageSnippetLinkRepository: IRepositoryPortPageSnippetLink;
      if (self.overrides.pageSnippetLinkRepository) {
        pageSnippetLinkRepository = self.overrides.pageSnippetLinkRepository as IRepositoryPortPageSnippetLink
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderPageSnippetLink::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        pageSnippetLinkRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryPageSnippetLink.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryPageSnippetLink.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderPageSnippetLink::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: PageSnippetLinkServiceOptions = {
        pageSnippetLinkRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new PageSnippetLinkService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IPageSnippetLinkServicePort
    })
  }
}
