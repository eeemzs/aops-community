/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { ICodexChatMessageServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortCodexChatMessage } from '../ports/repository-ports/index.js'
import { CodexChatMessageService, type CodexChatMessageServiceOptions } from '../services/index.js'
import { CodexChatMessageServiceError } from '../errors/CodexChatMessageServiceError.js'
import { RepositoryFactoryCodexChatMessage } from './RepositoryFactoryCodexChatMessage.js'

export interface CodexChatMessageServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface CodexChatMessageServiceFactoryOverrides {
  codexChatMessageRepository?: IRepositoryPortCodexChatMessage
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderCodexChatMessage {
  private config?: CodexChatMessageServiceFactoryConfig
  private overrides: CodexChatMessageServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderCodexChatMessage {
    return new ServiceBuilderCodexChatMessage()
  }

  withConfig(config: CodexChatMessageServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortCodexChatMessage): this {
    this.overrides.codexChatMessageRepository = repository
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

  withOverrides(overrides: CodexChatMessageServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ICodexChatMessageServicePort, CodexChatMessageServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.codexChatMessageRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderCodexChatMessage::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderCodexChatMessage', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let codexChatMessageRepository: IRepositoryPortCodexChatMessage
      if (self.overrides.codexChatMessageRepository) {
        codexChatMessageRepository = self.overrides.codexChatMessageRepository as IRepositoryPortCodexChatMessage
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderCodexChatMessage::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        codexChatMessageRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryCodexChatMessage.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryCodexChatMessage.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderCodexChatMessage::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: CodexChatMessageServiceOptions = {
        codexChatMessageRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      }

      const service = new CodexChatMessageService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ICodexChatMessageServicePort
    })
  }
}
