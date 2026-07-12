/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IAgentRunServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortAgentRun } from '../ports/repository-ports/index.js'
import { AgentRunService, type AgentRunServiceOptions } from '../services/index.js'
import { AgentRunServiceError } from '../errors/AgentRunServiceError.js'
import { RepositoryFactoryAgentRun } from './RepositoryFactoryAgentRun.js'

export interface AgentRunServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface AgentRunServiceFactoryOverrides {
  agentRunRepository?: IRepositoryPortAgentRun
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderAgentRun {
  private config?: AgentRunServiceFactoryConfig
  private overrides: AgentRunServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderAgentRun {
    return new ServiceBuilderAgentRun()
  }

  withConfig(config: AgentRunServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortAgentRun): this {
    this.overrides.agentRunRepository = repository
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

  withOverrides(overrides: AgentRunServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IAgentRunServicePort, AgentRunServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.agentRunRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderAgentRun::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderAgentRun', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let agentRunRepository: IRepositoryPortAgentRun;
      if (self.overrides.agentRunRepository) {
        agentRunRepository = self.overrides.agentRunRepository as IRepositoryPortAgentRun
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderAgentRun::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        agentRunRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryAgentRun.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryAgentRun.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderAgentRun::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: AgentRunServiceOptions = {
        agentRunRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new AgentRunService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IAgentRunServicePort
    })
  }
}
