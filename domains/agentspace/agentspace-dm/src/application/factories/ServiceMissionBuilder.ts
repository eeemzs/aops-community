/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IMissionServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortMemoryItem, IRepositoryPortMission, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import { MissionService, type MissionServiceOptions } from '../services/index.js'
import { MissionServiceError } from '../errors/MissionServiceError.js'
import { RepositoryFactoryMission } from './RepositoryFactoryMission.js'
import { RepositoryFactoryScope } from './RepositoryFactoryScope.js'

export interface MissionServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
}

export interface MissionServiceFactoryOverrides {
  missionRepository?: IRepositoryPortMission
  memoryItemRepository?: IRepositoryPortMemoryItem
  scopeRepository?: IRepositoryPortScope
}

export class ServiceBuilderMission {
  private config?: MissionServiceFactoryConfig
  private overrides: MissionServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderMission {
    return new ServiceBuilderMission()
  }

  withConfig(config: MissionServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortMission): this {
    this.overrides.missionRepository = repository
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

  withOverrides(overrides: MissionServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IMissionServicePort, MissionServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.missionRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderMission::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderMission', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let missionRepository: IRepositoryPortMission
      let scopeRepository: IRepositoryPortScope | undefined = self.overrides.scopeRepository
      if (self.overrides.missionRepository) {
        missionRepository = self.overrides.missionRepository as IRepositoryPortMission
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderMission::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        missionRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryMission.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryMission.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderMission::build',
                cause: error,
              }),
          ),
        )
      }

      if (!scopeRepository && config.repositoryConfig) {
        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        scopeRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryScope.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryScope.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderMission::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: MissionServiceOptions = {
        missionRepository,
        memoryItemRepository: self.overrides.memoryItemRepository,
        scopeRepository,
        logger,
      };

      const service = new MissionService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IMissionServicePort
    })
  }
}
