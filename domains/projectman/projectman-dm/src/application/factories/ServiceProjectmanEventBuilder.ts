/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IProjectmanEventServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortProjectmanEvent } from '../ports/repository-ports/index.js'
import { ProjectmanEventService, type ProjectmanEventServiceOptions } from '../services/index.js'
import { ProjectmanEventServiceError } from '../errors/ProjectmanEventServiceError.js'
import { RepositoryFactoryProjectmanEvent } from './RepositoryFactoryProjectmanEvent.js'

export interface ProjectmanEventServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface ProjectmanEventServiceFactoryOverrides {
  projectmanEventRepository?: IRepositoryPortProjectmanEvent
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderProjectmanEvent {
  private config?: ProjectmanEventServiceFactoryConfig
  private overrides: ProjectmanEventServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderProjectmanEvent {
    return new ServiceBuilderProjectmanEvent()
  }

  withConfig(config: ProjectmanEventServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortProjectmanEvent): this {
    this.overrides.projectmanEventRepository = repository
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

  withOverrides(overrides: ProjectmanEventServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IProjectmanEventServicePort, ProjectmanEventServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.projectmanEventRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderProjectmanEvent::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderProjectmanEvent', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let projectmanEventRepository: IRepositoryPortProjectmanEvent;
      if (self.overrides.projectmanEventRepository) {
        projectmanEventRepository = self.overrides.projectmanEventRepository as IRepositoryPortProjectmanEvent
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderProjectmanEvent::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        projectmanEventRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryProjectmanEvent.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryProjectmanEvent.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderProjectmanEvent::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: ProjectmanEventServiceOptions = {
        projectmanEventRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new ProjectmanEventService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IProjectmanEventServicePort
    })
  }
}
