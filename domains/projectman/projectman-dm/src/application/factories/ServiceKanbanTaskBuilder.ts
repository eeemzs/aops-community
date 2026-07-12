/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IKanbanTaskServicePort } from '../ports/inbound/index.js'
import type {
  IRepositoryPortKanbanBoardColumn,
  IRepositoryPortKanbanBoard,
  IRepositoryPortFeedbackItem,
  IRepositoryPortIssueItem,
  IRepositoryPortKanbanTask,
  IRepositoryPortMicroTaskItem,
  IRepositoryPortProjectmanEvent,
  IRepositoryPortSprint,
  IRepositoryPortSprintKanbanTaskLink,
} from '../ports/repository-ports/index.js'
import type { IPlanningLineageServicePort } from '../ports/inbound/index.js'
import { KanbanTaskService, type KanbanTaskServiceOptions } from '../services/index.js'
import { KanbanTaskServiceError } from '../errors/KanbanTaskServiceError.js'
import { RepositoryFactoryKanbanTask } from './RepositoryFactoryKanbanTask.js'

export interface KanbanTaskServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface KanbanTaskServiceFactoryOverrides {
  kanbanBoardColumnRepository?: IRepositoryPortKanbanBoardColumn
  kanbanBoardRepository?: IRepositoryPortKanbanBoard
  microTaskItemRepository?: IRepositoryPortMicroTaskItem
  issueItemRepository?: IRepositoryPortIssueItem
  feedbackItemRepository?: IRepositoryPortFeedbackItem
  kanbanTaskRepository?: IRepositoryPortKanbanTask
  eventRepository?: IRepositoryPortProjectmanEvent
  sprintRepository?: IRepositoryPortSprint
  sprintKanbanTaskLinkRepository?: IRepositoryPortSprintKanbanTaskLink
  planningLineageService?: IPlanningLineageServicePort
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderKanbanTask {
  private config?: KanbanTaskServiceFactoryConfig
  private overrides: KanbanTaskServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderKanbanTask {
    return new ServiceBuilderKanbanTask()
  }

  withConfig(config: KanbanTaskServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortKanbanTask): this {
    this.overrides.kanbanTaskRepository = repository
    return this
  }

  withEventRepository(repository: IRepositoryPortProjectmanEvent): this {
    this.overrides.eventRepository = repository
    return this
  }

  withSprintKanbanTaskLinkRepository(repository: IRepositoryPortSprintKanbanTaskLink): this {
    this.overrides.sprintKanbanTaskLinkRepository = repository
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

  withOverrides(overrides: KanbanTaskServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IKanbanTaskServicePort, KanbanTaskServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.kanbanTaskRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderKanbanTask::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderKanbanTask', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let kanbanTaskRepository: IRepositoryPortKanbanTask;
      if (self.overrides.kanbanTaskRepository) {
        kanbanTaskRepository = self.overrides.kanbanTaskRepository as IRepositoryPortKanbanTask
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderKanbanTask::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        kanbanTaskRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryKanbanTask.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryKanbanTask.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderKanbanTask::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: KanbanTaskServiceOptions = {
        kanbanBoardColumnRepository: self.overrides.kanbanBoardColumnRepository,
        kanbanBoardRepository: self.overrides.kanbanBoardRepository,
        kanbanTaskRepository,
        logger,
        eventRepository: self.overrides.eventRepository,
        sprintRepository: self.overrides.sprintRepository,
      };

      const service = new KanbanTaskService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IKanbanTaskServicePort
    })
  }
}
