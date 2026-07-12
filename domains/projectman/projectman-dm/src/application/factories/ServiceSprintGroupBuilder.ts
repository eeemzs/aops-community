/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IMicroTaskItemServicePort, IPlanningLineageServicePort, ISprintGroupServicePort, ISprintServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortProjectmanEvent, IRepositoryPortSprintGroup } from '../ports/repository-ports/index.js'
import { SprintGroupService, type SprintGroupServiceOptions } from '../services/index.js'
import { SprintGroupServiceError } from '../errors/SprintGroupServiceError.js'
import { RepositoryFactorySprintGroup } from './RepositoryFactorySprintGroup.js'

export interface SprintGroupServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface SprintGroupServiceFactoryOverrides {
  sprintGroupRepository?: IRepositoryPortSprintGroup
  eventRepository?: IRepositoryPortProjectmanEvent
  microTaskItemService?: IMicroTaskItemServicePort
  planningLineageService?: IPlanningLineageServicePort
  sprintService?: ISprintServicePort
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderSprintGroup {
  private config?: SprintGroupServiceFactoryConfig
  private overrides: SprintGroupServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderSprintGroup {
    return new ServiceBuilderSprintGroup()
  }

  withConfig(config: SprintGroupServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortSprintGroup): this {
    this.overrides.sprintGroupRepository = repository
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

  withOverrides(overrides: SprintGroupServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ISprintGroupServicePort, SprintGroupServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.sprintGroupRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderSprintGroup::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderSprintGroup', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let sprintGroupRepository: IRepositoryPortSprintGroup;
      if (self.overrides.sprintGroupRepository) {
        sprintGroupRepository = self.overrides.sprintGroupRepository as IRepositoryPortSprintGroup
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderSprintGroup::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        sprintGroupRepository = yield* _(
          Effect.mapError(
            RepositoryFactorySprintGroup.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactorySprintGroup.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderSprintGroup::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: SprintGroupServiceOptions = {
        sprintGroupRepository,
        eventRepository: self.overrides.eventRepository,
        serviceDependencies: {
          microTaskItemService: self.overrides.microTaskItemService,
          sprintService: self.overrides.sprintService,
        },
        logger,
      };

      const service = new SprintGroupService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ISprintGroupServicePort
    })
  }
}
