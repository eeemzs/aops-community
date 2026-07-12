/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { ISprintKanbanTaskLinkServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortSprintKanbanTaskLink, IRepositoryPortProjectmanEvent } from '../ports/repository-ports/index.js'
import { SprintKanbanTaskLinkService, type SprintKanbanTaskLinkServiceOptions } from '../services/index.js'
import { SprintKanbanTaskLinkServiceError } from '../errors/SprintKanbanTaskLinkServiceError.js'
import { RepositoryFactorySprintKanbanTaskLink } from './RepositoryFactorySprintKanbanTaskLink.js'

export interface SprintKanbanTaskLinkServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface SprintKanbanTaskLinkServiceFactoryOverrides {
  sprintKanbanTaskLinkRepository?: IRepositoryPortSprintKanbanTaskLink
  eventRepository?: IRepositoryPortProjectmanEvent
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderSprintKanbanTaskLink {
  private config?: SprintKanbanTaskLinkServiceFactoryConfig
  private overrides: SprintKanbanTaskLinkServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderSprintKanbanTaskLink {
    return new ServiceBuilderSprintKanbanTaskLink()
  }

  withConfig(config: SprintKanbanTaskLinkServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortSprintKanbanTaskLink): this {
    this.overrides.sprintKanbanTaskLinkRepository = repository
    return this
  }

  withEventRepository(repository: IRepositoryPortProjectmanEvent): this {
    this.overrides.eventRepository = repository
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

  withOverrides(overrides: SprintKanbanTaskLinkServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ISprintKanbanTaskLinkServicePort, SprintKanbanTaskLinkServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.sprintKanbanTaskLinkRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderSprintKanbanTaskLink::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderSprintKanbanTaskLink', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let sprintKanbanTaskLinkRepository: IRepositoryPortSprintKanbanTaskLink;
      if (self.overrides.sprintKanbanTaskLinkRepository) {
        sprintKanbanTaskLinkRepository = self.overrides.sprintKanbanTaskLinkRepository as IRepositoryPortSprintKanbanTaskLink
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderSprintKanbanTaskLink::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        sprintKanbanTaskLinkRepository = yield* _(
          Effect.mapError(
            RepositoryFactorySprintKanbanTaskLink.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactorySprintKanbanTaskLink.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderSprintKanbanTaskLink::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: SprintKanbanTaskLinkServiceOptions = {
        sprintKanbanTaskLinkRepository,
        logger,
        eventRepository: self.overrides.eventRepository,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new SprintKanbanTaskLinkService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ISprintKanbanTaskLinkServicePort
    })
  }
}
