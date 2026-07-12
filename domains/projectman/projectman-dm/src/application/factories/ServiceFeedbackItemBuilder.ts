/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IFeedbackItemServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortFeedbackItem } from '../ports/repository-ports/index.js'
import { FeedbackItemService, type FeedbackItemServiceOptions } from '../services/index.js'
import { FeedbackItemServiceError } from '../errors/FeedbackItemServiceError.js'
import { RepositoryFactoryFeedbackItem } from './RepositoryFactoryFeedbackItem.js'

export interface FeedbackItemServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface FeedbackItemServiceFactoryOverrides {
  feedbackItemRepository?: IRepositoryPortFeedbackItem
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderFeedbackItem {
  private config?: FeedbackItemServiceFactoryConfig
  private overrides: FeedbackItemServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderFeedbackItem {
    return new ServiceBuilderFeedbackItem()
  }

  withConfig(config: FeedbackItemServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortFeedbackItem): this {
    this.overrides.feedbackItemRepository = repository
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

  withOverrides(overrides: FeedbackItemServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IFeedbackItemServicePort, FeedbackItemServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.feedbackItemRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderFeedbackItem::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderFeedbackItem', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let feedbackItemRepository: IRepositoryPortFeedbackItem;
      if (self.overrides.feedbackItemRepository) {
        feedbackItemRepository = self.overrides.feedbackItemRepository as IRepositoryPortFeedbackItem
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderFeedbackItem::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        feedbackItemRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryFeedbackItem.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryFeedbackItem.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderFeedbackItem::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: FeedbackItemServiceOptions = {
        feedbackItemRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new FeedbackItemService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IFeedbackItemServicePort
    })
  }
}
