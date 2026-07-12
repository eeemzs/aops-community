/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IArtifactLinkServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortArtifactLink } from '../ports/repository-ports/index.js'
import { ArtifactLinkService, type ArtifactLinkServiceOptions } from '../services/index.js'
import { ArtifactLinkServiceError } from '../errors/ArtifactLinkServiceError.js'
import { RepositoryFactoryArtifactLink } from './RepositoryFactoryArtifactLink.js'

export interface ArtifactLinkServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface ArtifactLinkServiceFactoryOverrides {
  artifactLinkRepository?: IRepositoryPortArtifactLink
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderArtifactLink {
  private config?: ArtifactLinkServiceFactoryConfig
  private overrides: ArtifactLinkServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderArtifactLink {
    return new ServiceBuilderArtifactLink()
  }

  withConfig(config: ArtifactLinkServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortArtifactLink): this {
    this.overrides.artifactLinkRepository = repository
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

  withOverrides(overrides: ArtifactLinkServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IArtifactLinkServicePort, ArtifactLinkServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.artifactLinkRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderArtifactLink::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderArtifactLink', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let artifactLinkRepository: IRepositoryPortArtifactLink;
      if (self.overrides.artifactLinkRepository) {
        artifactLinkRepository = self.overrides.artifactLinkRepository as IRepositoryPortArtifactLink
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderArtifactLink::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        artifactLinkRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryArtifactLink.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryArtifactLink.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderArtifactLink::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: ArtifactLinkServiceOptions = {
        artifactLinkRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new ArtifactLinkService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IArtifactLinkServicePort
    })
  }
}
