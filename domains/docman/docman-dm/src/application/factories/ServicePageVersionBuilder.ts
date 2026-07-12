/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IPageVersionServicePort } from '../ports/inbound/index.js'
import type {
  IRepositoryPortDocumentSectionLink,
  IRepositoryPortPageVersion,
  IRepositoryPortSectionPageLink,
} from '../ports/repository-ports/index.js'
import { PageVersionService, type PageVersionServiceOptions } from '../services/index.js'
import { PageVersionServiceError } from '../errors/PageVersionServiceError.js'
import { RepositoryFactoryDocumentSectionLink } from './RepositoryFactoryDocumentSectionLink.js'
import { RepositoryFactoryPageVersion } from './RepositoryFactoryPageVersion.js'
import { RepositoryFactorySectionPageLink } from './RepositoryFactorySectionPageLink.js'

export interface PageVersionServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  documentSectionLinkRepositoryConfig?: RepositoryConfig
  sectionPageLinkRepositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface PageVersionServiceFactoryOverrides {
  pageVersionRepository?: IRepositoryPortPageVersion
  documentSectionLinkRepository?: IRepositoryPortDocumentSectionLink
  sectionPageLinkRepository?: IRepositoryPortSectionPageLink
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderPageVersion {
  private config?: PageVersionServiceFactoryConfig
  private overrides: PageVersionServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderPageVersion {
    return new ServiceBuilderPageVersion()
  }

  withConfig(config: PageVersionServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortPageVersion): this {
    this.overrides.pageVersionRepository = repository
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

  withOverrides(overrides: PageVersionServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IPageVersionServicePort, PageVersionServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.pageVersionRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderPageVersion::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderPageVersion', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let pageVersionRepository: IRepositoryPortPageVersion;
      if (self.overrides.pageVersionRepository) {
        pageVersionRepository = self.overrides.pageVersionRepository as IRepositoryPortPageVersion
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderPageVersion::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        pageVersionRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryPageVersion.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryPageVersion.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderPageVersion::build',
                cause: error,
              }),
          ),
        )
      }

      let documentSectionLinkRepository: IRepositoryPortDocumentSectionLink | undefined
      if (self.overrides.documentSectionLinkRepository) {
        documentSectionLinkRepository = self.overrides.documentSectionLinkRepository as IRepositoryPortDocumentSectionLink
      } else if (config.documentSectionLinkRepositoryConfig) {
        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.documentSectionLinkRepositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        documentSectionLinkRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryDocumentSectionLink.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryDocumentSectionLink.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderPageVersion::build',
                cause: error,
              }),
          ),
        )
      }

      let sectionPageLinkRepository: IRepositoryPortSectionPageLink | undefined
      if (self.overrides.sectionPageLinkRepository) {
        sectionPageLinkRepository = self.overrides.sectionPageLinkRepository as IRepositoryPortSectionPageLink
      } else if (config.sectionPageLinkRepositoryConfig) {
        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.sectionPageLinkRepositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        sectionPageLinkRepository = yield* _(
          Effect.mapError(
            RepositoryFactorySectionPageLink.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactorySectionPageLink.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderPageVersion::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: PageVersionServiceOptions = {
        pageVersionRepository,
        logger,
        serviceDependencies: {
          documentSectionLinkRepository,
          sectionPageLinkRepository,
        },
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new PageVersionService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IPageVersionServicePort
    })
  }
}
