/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'

import type { IExperienceItemServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortExperienceItem } from '../ports/repository-ports/index.js'
import { ExperienceItemService, type ExperienceItemServiceOptions } from '../services/index.js'
import { ExperienceItemServiceError } from '../errors/ExperienceItemServiceError.js'
import { RepositoryFactoryExperienceItem } from './RepositoryFactoryExperienceItem.js'

export interface ExperienceItemServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
}

export interface ExperienceItemServiceFactoryOverrides {
  experienceItemRepository?: IRepositoryPortExperienceItem
}

export class ServiceBuilderExperienceItem {
  private config?: ExperienceItemServiceFactoryConfig
  private overrides: ExperienceItemServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderExperienceItem {
    return new ServiceBuilderExperienceItem()
  }

  withConfig(config: ExperienceItemServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortExperienceItem): this {
    this.overrides.experienceItemRepository = repository
    return this
  }

  withLogger(logger?: XfLogger): this {
    if (this.config) this.config.logger = logger
    return this
  }

  withLogLevel(logLevel?: string): this {
    this.logLevel = logLevel
    return this
  }

  withOverrides(overrides: ExperienceItemServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IExperienceItemServicePort, ExperienceItemServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.experienceItemRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderExperienceItem::build',
            }),
          ),
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderExperienceItem', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let experienceItemRepository: IRepositoryPortExperienceItem
      if (self.overrides.experienceItemRepository) {
        experienceItemRepository = self.overrides.experienceItemRepository
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderExperienceItem::build',
              }),
            ),
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        experienceItemRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryExperienceItem.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryExperienceItem.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderExperienceItem::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: ExperienceItemServiceOptions = {
        experienceItemRepository,
        logger,
      }

      const service = new ExperienceItemService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IExperienceItemServicePort
    })
  }
}
