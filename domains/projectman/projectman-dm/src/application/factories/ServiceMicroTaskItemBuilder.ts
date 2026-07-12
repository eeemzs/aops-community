/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IMicroTaskItemServicePort } from '../ports/inbound/index.js'
import type {
  IRepositoryPortFeedbackItem,
  IRepositoryPortIssueItem,
  IRepositoryPortKanbanTask,
  IRepositoryPortMicroTaskItem,
  IRepositoryPortProjectmanEvent,
  IRepositoryPortSprint,
  IRepositoryPortSprintGroup,
} from '../ports/repository-ports/index.js'
import type { IPlanningLineageServicePort } from '../ports/inbound/index.js'
import { MicroTaskItemService, type MicroTaskItemServiceOptions } from '../services/index.js'
import { MicroTaskItemServiceError } from '../errors/MicroTaskItemServiceError.js'
import { RepositoryFactoryMicroTaskItem } from './RepositoryFactoryMicroTaskItem.js'

export interface MicroTaskItemServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface MicroTaskItemServiceFactoryOverrides {
  microTaskItemRepository?: IRepositoryPortMicroTaskItem
  kanbanTaskRepository?: IRepositoryPortKanbanTask
  sprintRepository?: IRepositoryPortSprint
  sprintGroupRepository?: IRepositoryPortSprintGroup
  issueItemRepository?: IRepositoryPortIssueItem
  feedbackItemRepository?: IRepositoryPortFeedbackItem
  eventRepository?: IRepositoryPortProjectmanEvent
  planningLineageService?: IPlanningLineageServicePort
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderMicroTaskItem {
  private config?: MicroTaskItemServiceFactoryConfig
  private overrides: MicroTaskItemServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderMicroTaskItem {
    return new ServiceBuilderMicroTaskItem()
  }

  withConfig(config: MicroTaskItemServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortMicroTaskItem): this {
    this.overrides.microTaskItemRepository = repository
    return this
  }

  withKanbanTaskRepository(repository: IRepositoryPortKanbanTask): this {
    this.overrides.kanbanTaskRepository = repository
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

  withOverrides(overrides: MicroTaskItemServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IMicroTaskItemServicePort, MicroTaskItemServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.microTaskItemRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderMicroTaskItem::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderMicroTaskItem', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let microTaskItemRepository: IRepositoryPortMicroTaskItem;
      if (self.overrides.microTaskItemRepository) {
        microTaskItemRepository = self.overrides.microTaskItemRepository as IRepositoryPortMicroTaskItem
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderMicroTaskItem::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        microTaskItemRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryMicroTaskItem.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryMicroTaskItem.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderMicroTaskItem::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: MicroTaskItemServiceOptions = {
        microTaskItemRepository,
        logger,
        kanbanTaskRepository: self.overrides.kanbanTaskRepository,
        sprintRepository: self.overrides.sprintRepository,
        sprintGroupRepository: self.overrides.sprintGroupRepository,
        issueItemRepository: self.overrides.issueItemRepository,
        feedbackItemRepository: self.overrides.feedbackItemRepository,
        eventRepository: self.overrides.eventRepository,
        serviceDependencies: {
          planningLineageService: self.overrides.planningLineageService,
        },
      };

      const service = new MicroTaskItemService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IMicroTaskItemServicePort
    })
  }
}
