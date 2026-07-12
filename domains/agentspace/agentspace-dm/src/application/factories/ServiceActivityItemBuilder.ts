/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IActivityItemServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortActivityItem } from '../ports/repository-ports/index.js'
import { ActivityItemService, type ActivityItemServiceOptions } from '../services/index.js'
import { ActivityItemServiceError } from '../errors/ActivityItemServiceError.js'
import { RepositoryFactoryActivityItem } from './RepositoryFactoryActivityItem.js'

export interface ActivityItemServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
}

export interface ActivityItemServiceFactoryOverrides {
  activityItemRepository?: IRepositoryPortActivityItem
  scopeRepository?: any
}

export class ServiceBuilderActivityItem {
  private config?: ActivityItemServiceFactoryConfig
  private overrides: ActivityItemServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderActivityItem {
    return new ServiceBuilderActivityItem()
  }

  withConfig(config: ActivityItemServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortActivityItem): this {
    this.overrides.activityItemRepository = repository
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

  withOverrides(overrides: ActivityItemServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IActivityItemServicePort, ActivityItemServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.activityItemRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderActivityItem::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderActivityItem', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let activityItemRepository: IRepositoryPortActivityItem
      if (self.overrides.activityItemRepository) {
        activityItemRepository = self.overrides.activityItemRepository as IRepositoryPortActivityItem
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderActivityItem::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        activityItemRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryActivityItem.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryActivityItem.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderActivityItem::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: ActivityItemServiceOptions = {
        activityItemRepository,
        scopeRepository: self.overrides.scopeRepository,
        logger,
      }

      const service = new ActivityItemService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IActivityItemServicePort
    })
  }
}
