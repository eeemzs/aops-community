/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { ICodexChatSettingServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortCodexChatSetting } from '../ports/repository-ports/index.js'
import { CodexChatSettingService, type CodexChatSettingServiceOptions } from '../services/index.js'
import { CodexChatSettingServiceError } from '../errors/CodexChatSettingServiceError.js'
import { RepositoryFactoryCodexChatSetting } from './RepositoryFactoryCodexChatSetting.js'

export interface CodexChatSettingServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface CodexChatSettingServiceFactoryOverrides {
  codexChatSettingRepository?: IRepositoryPortCodexChatSetting
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderCodexChatSetting {
  private config?: CodexChatSettingServiceFactoryConfig
  private overrides: CodexChatSettingServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderCodexChatSetting {
    return new ServiceBuilderCodexChatSetting()
  }

  withConfig(config: CodexChatSettingServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortCodexChatSetting): this {
    this.overrides.codexChatSettingRepository = repository
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

  withOverrides(overrides: CodexChatSettingServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ICodexChatSettingServicePort, CodexChatSettingServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.codexChatSettingRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderCodexChatSetting::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderCodexChatSetting', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let codexChatSettingRepository: IRepositoryPortCodexChatSetting
      if (self.overrides.codexChatSettingRepository) {
        codexChatSettingRepository = self.overrides.codexChatSettingRepository as IRepositoryPortCodexChatSetting
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderCodexChatSetting::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        codexChatSettingRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryCodexChatSetting.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryCodexChatSetting.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderCodexChatSetting::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: CodexChatSettingServiceOptions = {
        codexChatSettingRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      }

      const service = new CodexChatSettingService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ICodexChatSettingServicePort
    })
  }
}
