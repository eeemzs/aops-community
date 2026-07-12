/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { ISnippetServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortSnippet } from '../ports/repository-ports/index.js'
import { SnippetService, type SnippetServiceOptions } from '../services/index.js'
import { SnippetServiceError } from '../errors/SnippetServiceError.js'
import { RepositoryFactorySnippet } from './RepositoryFactorySnippet.js'

export interface SnippetServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface SnippetServiceFactoryOverrides {
  snippetRepository?: IRepositoryPortSnippet
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderSnippet {
  private config?: SnippetServiceFactoryConfig
  private overrides: SnippetServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderSnippet {
    return new ServiceBuilderSnippet()
  }

  withConfig(config: SnippetServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortSnippet): this {
    this.overrides.snippetRepository = repository
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

  withOverrides(overrides: SnippetServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ISnippetServicePort, SnippetServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.snippetRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderSnippet::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderSnippet', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let snippetRepository: IRepositoryPortSnippet;
      if (self.overrides.snippetRepository) {
        snippetRepository = self.overrides.snippetRepository as IRepositoryPortSnippet
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderSnippet::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        snippetRepository = yield* _(
          Effect.mapError(
            RepositoryFactorySnippet.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactorySnippet.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderSnippet::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: SnippetServiceOptions = {
        snippetRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new SnippetService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ISnippetServicePort
    })
  }
}

