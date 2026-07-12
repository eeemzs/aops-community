/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IResourceServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortResource, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import { ResourceService, type ResourceServiceOptions } from '../services/index.js'
import { ResourceServiceError } from '../errors/ResourceServiceError.js'
import { RepositoryFactoryResource } from './RepositoryFactoryResource.js'
import { RepositoryFactoryScope } from './RepositoryFactoryScope.js'

export interface ResourceServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface ResourceServiceFactoryOverrides {
  resourceRepository?: IRepositoryPortResource
  scopeRepository?: IRepositoryPortScope
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderResource {
  private config?: ResourceServiceFactoryConfig
  private overrides: ResourceServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderResource {
    return new ServiceBuilderResource()
  }

  withConfig(config: ResourceServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortResource): this {
    this.overrides.resourceRepository = repository
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

  withOverrides(overrides: ResourceServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IResourceServicePort, ResourceServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.resourceRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderResource::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderResource', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let resourceRepository: IRepositoryPortResource
      let scopeRepository: IRepositoryPortScope | undefined = self.overrides.scopeRepository
      if (self.overrides.resourceRepository) {
        resourceRepository = self.overrides.resourceRepository as IRepositoryPortResource
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderResource::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        resourceRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryResource.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryResource.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderResource::build',
                cause: error,
              }),
          ),
        )
      }

      if (!scopeRepository && config.repositoryConfig) {
        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        scopeRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryScope.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryScope.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderResource::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: ResourceServiceOptions = {
        resourceRepository,
        scopeRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new ResourceService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IResourceServicePort
    })
  }
}
