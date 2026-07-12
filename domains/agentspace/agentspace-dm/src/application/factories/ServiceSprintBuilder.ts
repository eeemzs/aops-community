/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { ISprintServicePort, ISprintItemServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortSprint } from '../ports/repository-ports/index.js'
import { SprintService, type SprintServiceOptions } from '../services/index.js'
import { SprintServiceError } from '../errors/SprintServiceError.js'
import { RepositoryFactorySprint } from './RepositoryFactorySprint.js'

export interface SprintServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface SprintServiceFactoryOverrides {
  sprintRepository?: IRepositoryPortSprint
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export interface SprintServiceFactoryDependencies {
  sprintItemService?: ISprintItemServicePort
}

export class ServiceBuilderSprint {
  private serviceDependencies: Partial<SprintServiceFactoryDependencies> = {}
  private config?: SprintServiceFactoryConfig
  private overrides: SprintServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderSprint {
    return new ServiceBuilderSprint()
  }

  withConfig(config: SprintServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortSprint): this {
    this.overrides.sprintRepository = repository
    return this
  }

  withServiceDependencies(dependencies: Partial<SprintServiceFactoryDependencies>): this {
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

  withOverrides(overrides: SprintServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ISprintServicePort, SprintServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.sprintRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderSprint::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderSprint', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let sprintRepository: IRepositoryPortSprint;
      if (self.overrides.sprintRepository) {
        sprintRepository = self.overrides.sprintRepository as IRepositoryPortSprint
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderSprint::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        sprintRepository = yield* _(
          Effect.mapError(
            RepositoryFactorySprint.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactorySprint.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderSprint::build',
                cause: error,
              }),
          ),
        )
      }

      if (!self.serviceDependencies.sprintItemService) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'SprintItemService dependency olarak saglanmali.',
              stage: 'ServiceBuilderSprint::build',
            })
          )
        )
      }

      const serviceOptions: SprintServiceOptions = {
        sprintRepository,
        sprintItemService: self.serviceDependencies.sprintItemService as ISprintItemServicePort,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new SprintService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ISprintServicePort
    })
  }
}
