/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { ITagServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortTag } from '../ports/repository-ports/index.js'
import { TagService, type TagServiceOptions } from '../services/index.js'
import { TagServiceError } from '../errors/TagServiceError.js'
import { RepositoryFactoryTag } from './RepositoryFactoryTag.js'

export interface TagServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface TagServiceFactoryOverrides {
  tagRepository?: IRepositoryPortTag
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderTag {
  private config?: TagServiceFactoryConfig
  private overrides: TagServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderTag {
    return new ServiceBuilderTag()
  }

  withConfig(config: TagServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortTag): this {
    this.overrides.tagRepository = repository
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

  withOverrides(overrides: TagServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ITagServicePort, TagServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.tagRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderTag::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderTag', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let tagRepository: IRepositoryPortTag;
      if (self.overrides.tagRepository) {
        tagRepository = self.overrides.tagRepository as IRepositoryPortTag
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderTag::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        tagRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryTag.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryTag.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderTag::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: TagServiceOptions = {
        tagRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new TagService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ITagServicePort
    })
  }
}
