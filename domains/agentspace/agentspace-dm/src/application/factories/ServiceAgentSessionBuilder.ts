/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IAgentSessionServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortAgentSession } from '../ports/repository-ports/index.js'
import { AgentSessionService, type AgentSessionServiceOptions } from '../services/index.js'
import { AgentSessionServiceError } from '../errors/AgentSessionServiceError.js'
import { RepositoryFactoryAgentSession } from './RepositoryFactoryAgentSession.js'

export interface AgentSessionServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface AgentSessionServiceFactoryOverrides {
  agentSessionRepository?: IRepositoryPortAgentSession
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderAgentSession {
  private config?: AgentSessionServiceFactoryConfig
  private overrides: AgentSessionServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderAgentSession {
    return new ServiceBuilderAgentSession()
  }

  withConfig(config: AgentSessionServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortAgentSession): this {
    this.overrides.agentSessionRepository = repository
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

  withOverrides(overrides: AgentSessionServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IAgentSessionServicePort, AgentSessionServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.agentSessionRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderAgentSession::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderAgentSession', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let agentSessionRepository: IRepositoryPortAgentSession;
      if (self.overrides.agentSessionRepository) {
        agentSessionRepository = self.overrides.agentSessionRepository as IRepositoryPortAgentSession
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderAgentSession::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        agentSessionRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryAgentSession.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryAgentSession.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderAgentSession::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: AgentSessionServiceOptions = {
        agentSessionRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new AgentSessionService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IAgentSessionServicePort
    })
  }
}
