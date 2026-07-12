/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IMemoryItemServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortMemoryItem } from '../ports/repository-ports/index.js'
import { MemoryItemService, type MemoryItemServiceOptions } from '../services/index.js'
import { MemoryItemServiceError } from '../errors/MemoryItemServiceError.js'
import { RepositoryFactoryMemoryItem } from './RepositoryFactoryMemoryItem.js'

export interface MemoryItemServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface MemoryItemServiceFactoryOverrides {
  memoryItemRepository?: IRepositoryPortMemoryItem
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderMemoryItem {
  private config?: MemoryItemServiceFactoryConfig
  private overrides: MemoryItemServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderMemoryItem {
    return new ServiceBuilderMemoryItem()
  }

  withConfig(config: MemoryItemServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortMemoryItem): this {
    this.overrides.memoryItemRepository = repository
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

  withOverrides(overrides: MemoryItemServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IMemoryItemServicePort, MemoryItemServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.memoryItemRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderMemoryItem::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderMemoryItem', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let memoryItemRepository: IRepositoryPortMemoryItem;
      if (self.overrides.memoryItemRepository) {
        memoryItemRepository = self.overrides.memoryItemRepository as IRepositoryPortMemoryItem
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderMemoryItem::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        memoryItemRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryMemoryItem.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryMemoryItem.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderMemoryItem::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: MemoryItemServiceOptions = {
        memoryItemRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new MemoryItemService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IMemoryItemServicePort
    })
  }
}
