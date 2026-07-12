/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { ISkillVersionServicePort, ISkillServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortSkillVersion } from '../ports/repository-ports/index.js'
import { SkillVersionService, type SkillVersionServiceOptions } from '../services/index.js'
import { SkillVersionServiceError } from '../errors/SkillVersionServiceError.js'
import { RepositoryFactorySkillVersion } from './RepositoryFactorySkillVersion.js'

export interface SkillVersionServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface SkillVersionServiceFactoryOverrides {
  skillVersionRepository?: IRepositoryPortSkillVersion
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export interface SkillVersionServiceFactoryDependencies {
  skillService?: ISkillServicePort
}

export class ServiceBuilderSkillVersion {
  private serviceDependencies: Partial<SkillVersionServiceFactoryDependencies> = {}
  private config?: SkillVersionServiceFactoryConfig
  private overrides: SkillVersionServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderSkillVersion {
    return new ServiceBuilderSkillVersion()
  }

  withConfig(config: SkillVersionServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortSkillVersion): this {
    this.overrides.skillVersionRepository = repository
    return this
  }

  withServiceDependencies(dependencies: Partial<SkillVersionServiceFactoryDependencies>): this {
    this.serviceDependencies = { ...this.serviceDependencies, ...dependencies }
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

  withOverrides(overrides: SkillVersionServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ISkillVersionServicePort, SkillVersionServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.skillVersionRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderSkillVersion::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderSkillVersion', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let skillVersionRepository: IRepositoryPortSkillVersion;
      if (self.overrides.skillVersionRepository) {
        skillVersionRepository = self.overrides.skillVersionRepository as IRepositoryPortSkillVersion
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderSkillVersion::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        skillVersionRepository = yield* _(
          Effect.mapError(
            RepositoryFactorySkillVersion.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactorySkillVersion.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderSkillVersion::build',
                cause: error,
              }),
          ),
        )
      }

      if (!self.serviceDependencies.skillService) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'SkillService dependency olarak saglanmali.',
              stage: 'ServiceBuilderSkillVersion::build',
            })
          )
        )
      }

      const serviceOptions: SkillVersionServiceOptions = {
        skillVersionRepository,
        skillService: self.serviceDependencies.skillService as ISkillServicePort,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new SkillVersionService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ISkillVersionServicePort
    })
  }
}
