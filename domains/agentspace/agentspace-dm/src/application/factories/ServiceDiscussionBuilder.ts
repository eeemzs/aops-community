/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { IUnitOfWork, RepositoryConfig } from '@aopslab/xf-db'
import type { IDiscussionServicePort } from '../ports/inbound/index.js'
import type {
  IRepositoryPortDiscussionOutput,
  IRepositoryPortDiscussionTopic,
  IRepositoryPortDiscussionTurn,
  IRepositoryPortScope,
} from '../ports/repository-ports/index.js'
import { DiscussionService, type DiscussionServiceOptions } from '../services/index.js'
import { DiscussionServiceError } from '../errors/DiscussionServiceError.js'
import { RepositoryFactoryDiscussionTopic } from './RepositoryFactoryDiscussionTopic.js'
import { RepositoryFactoryDiscussionTurn } from './RepositoryFactoryDiscussionTurn.js'
import { RepositoryFactoryDiscussionOutput } from './RepositoryFactoryDiscussionOutput.js'
import { createAgentspaceDrizzleUnitOfWork } from './drizzleDialect.js'

export interface DiscussionServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
}

export interface DiscussionServiceFactoryOverrides {
  discussionTopicRepository?: IRepositoryPortDiscussionTopic
  discussionTurnRepository?: IRepositoryPortDiscussionTurn
  discussionOutputRepository?: IRepositoryPortDiscussionOutput
  scopeRepository?: IRepositoryPortScope
}

export class ServiceBuilderDiscussion {
  private config?: DiscussionServiceFactoryConfig
  private overrides: DiscussionServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderDiscussion {
    return new ServiceBuilderDiscussion()
  }

  withConfig(config: DiscussionServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepositories(overrides: DiscussionServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
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

  withOverrides(overrides: DiscussionServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IDiscussionServicePort, DiscussionServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      const hasAllRepositoryOverrides = Boolean(
        self.overrides.discussionTopicRepository &&
          self.overrides.discussionTurnRepository &&
          self.overrides.discussionOutputRepository
      )

      if (!self.config && !hasAllRepositoryOverrides) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository overrides or repositoryConfig are required',
              operation: 'build',
              stage: 'ServiceBuilderDiscussion::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderDiscussion', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      if (!hasAllRepositoryOverrides && !config.repositoryConfig) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'Repository config is required when discussion repositories are not all overridden.',
              stage: 'ServiceBuilderDiscussion::build',
            })
          )
        )
      }

      const repositoryParams: RepositoryCreateParams | undefined = config.repositoryConfig
        ? {
            repositoryConfig: config.repositoryConfig,
            redisConfig: config.redisConfig,
            logger,
          }
        : undefined

      const discussionTopicRepository =
        self.overrides.discussionTopicRepository ??
        (yield* _(
          Effect.mapError(
            RepositoryFactoryDiscussionTopic.create(repositoryParams!),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryDiscussionTopic.create failed: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderDiscussion::build',
                cause: error,
              }),
          ),
        ))

      const discussionTurnRepository =
        self.overrides.discussionTurnRepository ??
        (yield* _(
          Effect.mapError(
            RepositoryFactoryDiscussionTurn.create(repositoryParams!),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryDiscussionTurn.create failed: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderDiscussion::build',
                cause: error,
              }),
          ),
        ))

      const discussionOutputRepository =
        self.overrides.discussionOutputRepository ??
        (yield* _(
          Effect.mapError(
            RepositoryFactoryDiscussionOutput.create(repositoryParams!),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryDiscussionOutput.create failed: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderDiscussion::build',
                cause: error,
              }),
          ),
        ))

      let unitOfWork: IUnitOfWork | undefined
      if (config.repositoryConfig) {
        unitOfWork = createAgentspaceDrizzleUnitOfWork(config.repositoryConfig)
      }

      const serviceOptions: DiscussionServiceOptions = {
        discussionTopicRepository,
        discussionTurnRepository,
        discussionOutputRepository,
        scopeRepository: self.overrides.scopeRepository,
        unitOfWork,
        logger,
      }

      const service = new DiscussionService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IDiscussionServicePort
    })
  }
}
