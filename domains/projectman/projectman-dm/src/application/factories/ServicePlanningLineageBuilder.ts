/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IPlanningLineageServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortPlanningLineage } from '../ports/repository-ports/index.js'
import { PlanningLineageService, type PlanningLineageServiceOptions } from '../services/index.js'
import { PlanningLineageServiceError } from '../errors/PlanningLineageServiceError.js'
import { RepositoryFactoryPlanningLineage } from './RepositoryFactoryPlanningLineage.js'

export interface PlanningLineageServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface PlanningLineageServiceFactoryOverrides {
  planningLineageRepository?: IRepositoryPortPlanningLineage
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderPlanningLineage {
  private config?: PlanningLineageServiceFactoryConfig
  private overrides: PlanningLineageServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderPlanningLineage {
    return new ServiceBuilderPlanningLineage()
  }

  withConfig(config: PlanningLineageServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortPlanningLineage): this {
    this.overrides.planningLineageRepository = repository
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

  withOverrides(overrides: PlanningLineageServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IPlanningLineageServicePort, PlanningLineageServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.planningLineageRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderPlanningLineage::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderPlanningLineage', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let planningLineageRepository: IRepositoryPortPlanningLineage
      if (self.overrides.planningLineageRepository) {
        planningLineageRepository = self.overrides.planningLineageRepository as IRepositoryPortPlanningLineage
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderPlanningLineage::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        }

        planningLineageRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryPlanningLineage.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryPlanningLineage.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderPlanningLineage::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: PlanningLineageServiceOptions = {
        planningLineageRepository,
        logger,
      }

      const service = new PlanningLineageService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IPlanningLineageServicePort
    })
  }
}
