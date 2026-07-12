/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IUnitOfWork } from '@aopslab/xf-db'
import type { IPromptVersionServicePort, IPromptServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortPrompt, IRepositoryPortPromptVersion } from '../ports/repository-ports/index.js'
import { PromptVersionService, type PromptVersionServiceOptions } from '../services/index.js'
import { PromptVersionServiceError } from '../errors/PromptVersionServiceError.js'
import { RepositoryFactoryPromptVersion } from './RepositoryFactoryPromptVersion.js'
import { createAgentspaceDrizzleUnitOfWork } from './drizzleDialect.js'

export interface PromptVersionServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface PromptVersionServiceFactoryOverrides {
  promptVersionRepository?: IRepositoryPortPromptVersion
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export interface PromptVersionServiceFactoryDependencies {
  promptService?: IPromptServicePort
  promptRepository?: IRepositoryPortPrompt
}

export class ServiceBuilderPromptVersion {
  private serviceDependencies: Partial<PromptVersionServiceFactoryDependencies> = {}
  private config?: PromptVersionServiceFactoryConfig
  private overrides: PromptVersionServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderPromptVersion {
    return new ServiceBuilderPromptVersion()
  }

  withConfig(config: PromptVersionServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortPromptVersion): this {
    this.overrides.promptVersionRepository = repository
    return this
  }

  withServiceDependencies(dependencies: Partial<PromptVersionServiceFactoryDependencies>): this {
    this.serviceDependencies = { ...this.serviceDependencies, ...dependencies }
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

  withOverrides(overrides: PromptVersionServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IPromptVersionServicePort, PromptVersionServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.promptVersionRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderPromptVersion::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderPromptVersion', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let promptVersionRepository: IRepositoryPortPromptVersion;
      if (self.overrides.promptVersionRepository) {
        promptVersionRepository = self.overrides.promptVersionRepository as IRepositoryPortPromptVersion
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderPromptVersion::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        promptVersionRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryPromptVersion.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryPromptVersion.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderPromptVersion::build',
                cause: error,
              }),
          ),
        )
      }

      if (!self.serviceDependencies.promptService) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'PromptService dependency olarak saglanmali.',
              stage: 'ServiceBuilderPromptVersion::build',
            })
          )
        )
      }

      let unitOfWork: IUnitOfWork | undefined
      if (config.repositoryConfig) {
        unitOfWork = createAgentspaceDrizzleUnitOfWork(config.repositoryConfig)
      }

      const serviceOptions: PromptVersionServiceOptions = {
        promptVersionRepository,
        promptService: self.serviceDependencies.promptService as IPromptServicePort,
        promptRepository: self.serviceDependencies.promptRepository,
        unitOfWork,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new PromptVersionService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IPromptVersionServicePort
    })
  }
}
