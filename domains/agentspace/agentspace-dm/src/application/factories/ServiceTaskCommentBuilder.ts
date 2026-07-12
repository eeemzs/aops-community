/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { ITaskCommentServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortTaskComment } from '../ports/repository-ports/index.js'
import { TaskCommentService, type TaskCommentServiceOptions } from '../services/index.js'
import { TaskCommentServiceError } from '../errors/TaskCommentServiceError.js'
import { RepositoryFactoryTaskComment } from './RepositoryFactoryTaskComment.js'

export interface TaskCommentServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface TaskCommentServiceFactoryOverrides {
  taskCommentRepository?: IRepositoryPortTaskComment
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderTaskComment {
  private config?: TaskCommentServiceFactoryConfig
  private overrides: TaskCommentServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderTaskComment {
    return new ServiceBuilderTaskComment()
  }

  withConfig(config: TaskCommentServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortTaskComment): this {
    this.overrides.taskCommentRepository = repository
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

  withOverrides(overrides: TaskCommentServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ITaskCommentServicePort, TaskCommentServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.taskCommentRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderTaskComment::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderTaskComment', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let taskCommentRepository: IRepositoryPortTaskComment;
      if (self.overrides.taskCommentRepository) {
        taskCommentRepository = self.overrides.taskCommentRepository as IRepositoryPortTaskComment
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderTaskComment::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        taskCommentRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryTaskComment.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryTaskComment.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderTaskComment::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: TaskCommentServiceOptions = {
        taskCommentRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new TaskCommentService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ITaskCommentServicePort
    })
  }
}
