/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'

import type { IAgentProfileServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortAgentProfile, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import { AgentProfileService, type AgentProfileServiceOptions } from '../services/index.js'
import { AgentProfileServiceError } from '../errors/AgentProfileServiceError.js'
import { RepositoryFactoryAgentProfile } from './RepositoryFactoryAgentProfile.js'

export interface AgentProfileServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
}

export interface AgentProfileServiceFactoryOverrides {
  agentProfileRepository?: IRepositoryPortAgentProfile
  scopeRepository?: IRepositoryPortScope
}

export class ServiceBuilderAgentProfile {
  private config?: AgentProfileServiceFactoryConfig
  private overrides: AgentProfileServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderAgentProfile {
    return new ServiceBuilderAgentProfile()
  }

  withConfig(config: AgentProfileServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortAgentProfile): this {
    this.overrides.agentProfileRepository = repository
    return this
  }

  withLogger(logger?: XfLogger): this {
    if (this.config) this.config.logger = logger
    return this
  }

  withLogLevel(logLevel?: string): this {
    this.logLevel = logLevel
    return this
  }

  withOverrides(overrides: AgentProfileServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IAgentProfileServicePort, AgentProfileServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.agentProfileRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderAgentProfile::build',
            }),
          ),
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderAgentProfile', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let agentProfileRepository: IRepositoryPortAgentProfile
      if (self.overrides.agentProfileRepository) {
        agentProfileRepository = self.overrides.agentProfileRepository
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderAgentProfile::build',
              }),
            ),
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        agentProfileRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryAgentProfile.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryAgentProfile.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderAgentProfile::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: AgentProfileServiceOptions = {
        agentProfileRepository,
        scopeRepository: self.overrides.scopeRepository,
        logger,
      }

      const service = new AgentProfileService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IAgentProfileServicePort
    })
  }
}
