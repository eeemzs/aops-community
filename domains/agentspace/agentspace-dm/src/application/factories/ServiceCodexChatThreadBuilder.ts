/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { ICodexChatThreadServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortCodexChatThread } from '../ports/repository-ports/index.js'
import { CodexChatThreadService, type CodexChatThreadServiceOptions } from '../services/index.js'
import { CodexChatThreadServiceError } from '../errors/CodexChatThreadServiceError.js'
import { RepositoryFactoryCodexChatThread } from './RepositoryFactoryCodexChatThread.js'

export interface CodexChatThreadServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface CodexChatThreadServiceFactoryOverrides {
  codexChatThreadRepository?: IRepositoryPortCodexChatThread
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderCodexChatThread {
  private config?: CodexChatThreadServiceFactoryConfig
  private overrides: CodexChatThreadServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderCodexChatThread {
    return new ServiceBuilderCodexChatThread()
  }

  withConfig(config: CodexChatThreadServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortCodexChatThread): this {
    this.overrides.codexChatThreadRepository = repository
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

  withOverrides(overrides: CodexChatThreadServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ICodexChatThreadServicePort, CodexChatThreadServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.codexChatThreadRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderCodexChatThread::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderCodexChatThread', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let codexChatThreadRepository: IRepositoryPortCodexChatThread
      if (self.overrides.codexChatThreadRepository) {
        codexChatThreadRepository = self.overrides.codexChatThreadRepository as IRepositoryPortCodexChatThread
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderCodexChatThread::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        codexChatThreadRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryCodexChatThread.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryCodexChatThread.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderCodexChatThread::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: CodexChatThreadServiceOptions = {
        codexChatThreadRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      }

      const service = new CodexChatThreadService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ICodexChatThreadServicePort
    })
  }
}
