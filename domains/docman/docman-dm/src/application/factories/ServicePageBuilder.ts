/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IPageServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortPage } from '../ports/repository-ports/index.js'
import { PageService, type PageServiceOptions } from '../services/index.js'
import { PageServiceError } from '../errors/PageServiceError.js'
import { RepositoryFactoryPage } from './RepositoryFactoryPage.js'

export interface PageServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface PageServiceFactoryOverrides {
  pageRepository?: IRepositoryPortPage
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderPage {
  private config?: PageServiceFactoryConfig
  private overrides: PageServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderPage {
    return new ServiceBuilderPage()
  }

  withConfig(config: PageServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortPage): this {
    this.overrides.pageRepository = repository
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

  withOverrides(overrides: PageServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IPageServicePort, PageServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.pageRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderPage::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderPage', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let pageRepository: IRepositoryPortPage;
      if (self.overrides.pageRepository) {
        pageRepository = self.overrides.pageRepository as IRepositoryPortPage
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderPage::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        pageRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryPage.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryPage.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderPage::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: PageServiceOptions = {
        pageRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new PageService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IPageServicePort
    })
  }
}

