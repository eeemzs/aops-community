/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IPromptServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortPrompt } from '../ports/repository-ports/index.js'
import { PromptService, type PromptServiceOptions } from '../services/index.js'
import { PromptServiceError } from '../errors/PromptServiceError.js'
import { RepositoryFactoryPrompt } from './RepositoryFactoryPrompt.js'

export interface PromptServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface PromptServiceFactoryOverrides {
  promptRepository?: IRepositoryPortPrompt
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderPrompt {
  private config?: PromptServiceFactoryConfig
  private overrides: PromptServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderPrompt {
    return new ServiceBuilderPrompt()
  }

  withConfig(config: PromptServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortPrompt): this {
    this.overrides.promptRepository = repository
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

  withOverrides(overrides: PromptServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IPromptServicePort, PromptServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.promptRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderPrompt::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderPrompt', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let promptRepository: IRepositoryPortPrompt;
      if (self.overrides.promptRepository) {
        promptRepository = self.overrides.promptRepository as IRepositoryPortPrompt
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderPrompt::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        promptRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryPrompt.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryPrompt.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderPrompt::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: PromptServiceOptions = {
        promptRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new PromptService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IPromptServicePort
    })
  }
}
