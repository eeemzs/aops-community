/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { ITaskServicePort, ITaskCommentServicePort } from '../ports/inbound/index.js'
import type {
  IRepositoryPortTask,
  IRepositoryPortTaskChecklistItem,
  IRepositoryPortTaskLabel,
  IRepositoryPortTaskLabelLink,
  IRepositoryPortTaskRelation,
} from '../ports/repository-ports/index.js'
import { TaskService, type TaskServiceOptions } from '../services/index.js'
import { TaskServiceError } from '../errors/TaskServiceError.js'
import { RepositoryFactoryTask } from './RepositoryFactoryTask.js'
import { RepositoryFactoryTaskChecklistItem } from './RepositoryFactoryTaskChecklistItem.js'
import { RepositoryFactoryTaskLabel } from './RepositoryFactoryTaskLabel.js'
import { RepositoryFactoryTaskLabelLink } from './RepositoryFactoryTaskLabelLink.js'
import { RepositoryFactoryTaskRelation } from './RepositoryFactoryTaskRelation.js'

export interface TaskServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface TaskServiceFactoryOverrides {
  taskRepository?: IRepositoryPortTask
  taskLabelRepository?: IRepositoryPortTaskLabel
  taskLabelLinkRepository?: IRepositoryPortTaskLabelLink
  taskChecklistItemRepository?: IRepositoryPortTaskChecklistItem
  taskRelationRepository?: IRepositoryPortTaskRelation
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export interface TaskServiceFactoryDependencies {
  taskCommentService?: ITaskCommentServicePort
}

export class ServiceBuilderTask {
  private serviceDependencies: Partial<TaskServiceFactoryDependencies> = {}
  private config?: TaskServiceFactoryConfig
  private overrides: TaskServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderTask {
    return new ServiceBuilderTask()
  }

  withConfig(config: TaskServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortTask): this {
    this.overrides.taskRepository = repository
    return this
  }

  withServiceDependencies(dependencies: Partial<TaskServiceFactoryDependencies>): this {
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

  withOverrides(overrides: TaskServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ITaskServicePort, TaskServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.taskRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderTask::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderTask', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let taskRepository: IRepositoryPortTask;
      let taskLabelRepository: IRepositoryPortTaskLabel;
      let taskLabelLinkRepository: IRepositoryPortTaskLabelLink;
      let taskChecklistItemRepository: IRepositoryPortTaskChecklistItem;
      let taskRelationRepository: IRepositoryPortTaskRelation;
      if (self.overrides.taskRepository) {
        taskRepository = self.overrides.taskRepository as IRepositoryPortTask
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderTask::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        taskRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryTask.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryTask.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderTask::build',
                cause: error,
              }),
          ),
        )
      }

      if (self.overrides.taskLabelRepository) {
        taskLabelRepository = self.overrides.taskLabelRepository as IRepositoryPortTaskLabel
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderTask::build',
              })
            )
          )
        }
        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };
        taskLabelRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryTaskLabel.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryTaskLabel.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderTask::build',
                cause: error,
              }),
          ),
        )
      }

      if (self.overrides.taskLabelLinkRepository) {
        taskLabelLinkRepository = self.overrides.taskLabelLinkRepository as IRepositoryPortTaskLabelLink
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderTask::build',
              })
            )
          )
        }
        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };
        taskLabelLinkRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryTaskLabelLink.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryTaskLabelLink.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderTask::build',
                cause: error,
              }),
          ),
        )
      }

      if (self.overrides.taskChecklistItemRepository) {
        taskChecklistItemRepository = self.overrides.taskChecklistItemRepository as IRepositoryPortTaskChecklistItem
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderTask::build',
              })
            )
          )
        }
        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };
        taskChecklistItemRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryTaskChecklistItem.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryTaskChecklistItem.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderTask::build',
                cause: error,
              }),
          ),
        )
      }

      if (self.overrides.taskRelationRepository) {
        taskRelationRepository = self.overrides.taskRelationRepository as IRepositoryPortTaskRelation
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderTask::build',
              })
            )
          )
        }
        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };
        taskRelationRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryTaskRelation.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryTaskRelation.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderTask::build',
                cause: error,
              }),
          ),
        )
      }

      if (!self.serviceDependencies.taskCommentService) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'TaskCommentService dependency olarak saglanmali.',
              stage: 'ServiceBuilderTask::build',
            })
          )
        )
      }

      const serviceOptions: TaskServiceOptions = {
        taskRepository,
        taskCommentService: self.serviceDependencies.taskCommentService as ITaskCommentServicePort,
        taskLabelRepository,
        taskLabelLinkRepository,
        taskChecklistItemRepository,
        taskRelationRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new TaskService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ITaskServicePort
    })
  }
}
