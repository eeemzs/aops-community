/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IAgentRunEventServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortAgentRunEvent } from '../ports/repository-ports/index.js'
import { AgentRunEventService, type AgentRunEventServiceOptions } from '../services/index.js'
import { AgentRunEventServiceError } from '../errors/AgentRunEventServiceError.js'
import { RepositoryFactoryAgentRunEvent } from './RepositoryFactoryAgentRunEvent.js'

export interface AgentRunEventServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface AgentRunEventServiceFactoryOverrides {
  agentRunEventRepository?: IRepositoryPortAgentRunEvent
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderAgentRunEvent {
  private config?: AgentRunEventServiceFactoryConfig
  private overrides: AgentRunEventServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderAgentRunEvent {
    return new ServiceBuilderAgentRunEvent()
  }

  withConfig(config: AgentRunEventServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortAgentRunEvent): this {
    this.overrides.agentRunEventRepository = repository
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

  withOverrides(overrides: AgentRunEventServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IAgentRunEventServicePort, AgentRunEventServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.agentRunEventRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderAgentRunEvent::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderAgentRunEvent', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let agentRunEventRepository: IRepositoryPortAgentRunEvent
      if (self.overrides.agentRunEventRepository) {
        agentRunEventRepository = self.overrides.agentRunEventRepository as IRepositoryPortAgentRunEvent
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderAgentRunEvent::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        agentRunEventRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryAgentRunEvent.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryAgentRunEvent.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderAgentRunEvent::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: AgentRunEventServiceOptions = {
        agentRunEventRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      }

      const service = new AgentRunEventService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IAgentRunEventServicePort
    })
  }
}
