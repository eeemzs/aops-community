/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { ISectionServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortSection } from '../ports/repository-ports/index.js'
import { SectionService, type SectionServiceOptions } from '../services/index.js'
import { SectionServiceError } from '../errors/SectionServiceError.js'
import { RepositoryFactorySection } from './RepositoryFactorySection.js'

export interface SectionServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface SectionServiceFactoryOverrides {
  sectionRepository?: IRepositoryPortSection
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderSection {
  private config?: SectionServiceFactoryConfig
  private overrides: SectionServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderSection {
    return new ServiceBuilderSection()
  }

  withConfig(config: SectionServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortSection): this {
    this.overrides.sectionRepository = repository
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

  withOverrides(overrides: SectionServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ISectionServicePort, SectionServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.sectionRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderSection::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderSection', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let sectionRepository: IRepositoryPortSection;
      if (self.overrides.sectionRepository) {
        sectionRepository = self.overrides.sectionRepository as IRepositoryPortSection
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderSection::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        sectionRepository = yield* _(
          Effect.mapError(
            RepositoryFactorySection.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactorySection.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderSection::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: SectionServiceOptions = {
        sectionRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new SectionService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ISectionServicePort
    })
  }
}

