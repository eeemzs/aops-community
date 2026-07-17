/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { ISectionPageLinkServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortSectionPageLink } from '../ports/repository-ports/index.js'
import { SectionPageLinkService, type SectionPageLinkServiceOptions } from '../services/index.js'
import { SectionPageLinkServiceError } from '../errors/SectionPageLinkServiceError.js'
import { RepositoryFactorySectionPageLink } from './RepositoryFactorySectionPageLink.js'

export interface SectionPageLinkServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface SectionPageLinkServiceFactoryOverrides {
  sectionPageLinkRepository?: IRepositoryPortSectionPageLink
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderSectionPageLink {
  private config?: SectionPageLinkServiceFactoryConfig
  private overrides: SectionPageLinkServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderSectionPageLink {
    return new ServiceBuilderSectionPageLink()
  }

  withConfig(config: SectionPageLinkServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortSectionPageLink): this {
    this.overrides.sectionPageLinkRepository = repository
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

  withOverrides(overrides: SectionPageLinkServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ISectionPageLinkServicePort, SectionPageLinkServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.sectionPageLinkRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderSectionPageLink::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderSectionPageLink', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let sectionPageLinkRepository: IRepositoryPortSectionPageLink;
      if (self.overrides.sectionPageLinkRepository) {
        sectionPageLinkRepository = self.overrides.sectionPageLinkRepository as IRepositoryPortSectionPageLink
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderSectionPageLink::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        sectionPageLinkRepository = yield* _(
          Effect.mapError(
            RepositoryFactorySectionPageLink.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactorySectionPageLink.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderSectionPageLink::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: SectionPageLinkServiceOptions = {
        sectionPageLinkRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new SectionPageLinkService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ISectionPageLinkServicePort
    })
  }
}
