/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IAssetServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortAsset } from '../ports/repository-ports/index.js'
import { AssetService, type AssetServiceOptions } from '../services/index.js'
import { AssetServiceError } from '../errors/AssetServiceError.js'
import { RepositoryFactoryAsset } from './RepositoryFactoryAsset.js'

export interface AssetServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
}

export interface AssetServiceFactoryOverrides {
  assetRepository?: IRepositoryPortAsset
}

export class ServiceBuilderAsset {
  private config?: AssetServiceFactoryConfig
  private overrides: AssetServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderAsset {
    return new ServiceBuilderAsset()
  }

  withConfig(config: AssetServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortAsset): this {
    this.overrides.assetRepository = repository
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

  withOverrides(overrides: AssetServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IAssetServicePort, AssetServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.assetRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderAsset::build',
            }),
          ),
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderAsset', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let assetRepository: IRepositoryPortAsset
      if (self.overrides.assetRepository) {
        assetRepository = self.overrides.assetRepository as IRepositoryPortAsset
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderAsset::build',
              }),
            ),
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        assetRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryAsset.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryAsset.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderAsset::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: AssetServiceOptions = {
        assetRepository,
        logger,
      }

      const service = new AssetService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IAssetServicePort
    })
  }
}
