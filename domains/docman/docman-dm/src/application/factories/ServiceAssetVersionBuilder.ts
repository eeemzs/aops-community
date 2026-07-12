/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IAssetVersionServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortAssetVersion } from '../ports/repository-ports/index.js'
import { AssetVersionService, type AssetVersionServiceOptions } from '../services/index.js'
import { AssetVersionServiceError } from '../errors/AssetVersionServiceError.js'
import { RepositoryFactoryAssetVersion } from './RepositoryFactoryAssetVersion.js'

export interface AssetVersionServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
}

export interface AssetVersionServiceFactoryOverrides {
  assetVersionRepository?: IRepositoryPortAssetVersion
}

export class ServiceBuilderAssetVersion {
  private config?: AssetVersionServiceFactoryConfig
  private overrides: AssetVersionServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderAssetVersion {
    return new ServiceBuilderAssetVersion()
  }

  withConfig(config: AssetVersionServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortAssetVersion): this {
    this.overrides.assetVersionRepository = repository
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

  withOverrides(overrides: AssetVersionServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IAssetVersionServicePort, AssetVersionServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.assetVersionRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderAssetVersion::build',
            }),
          ),
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderAssetVersion', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let assetVersionRepository: IRepositoryPortAssetVersion
      if (self.overrides.assetVersionRepository) {
        assetVersionRepository = self.overrides.assetVersionRepository as IRepositoryPortAssetVersion
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderAssetVersion::build',
              }),
            ),
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        assetVersionRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryAssetVersion.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryAssetVersion.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderAssetVersion::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: AssetVersionServiceOptions = {
        assetVersionRepository,
        logger,
      }

      const service = new AssetVersionService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IAssetVersionServicePort
    })
  }
}
