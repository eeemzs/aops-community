/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { ISkillServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortSkill } from '../ports/repository-ports/index.js'
import { SkillService, type SkillServiceOptions } from '../services/index.js'
import { SkillServiceError } from '../errors/SkillServiceError.js'
import { RepositoryFactorySkill } from './RepositoryFactorySkill.js'

export interface SkillServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface SkillServiceFactoryOverrides {
  skillRepository?: IRepositoryPortSkill
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderSkill {
  private config?: SkillServiceFactoryConfig
  private overrides: SkillServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderSkill {
    return new ServiceBuilderSkill()
  }

  withConfig(config: SkillServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortSkill): this {
    this.overrides.skillRepository = repository
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

  withOverrides(overrides: SkillServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<ISkillServicePort, SkillServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.skillRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderSkill::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderSkill', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let skillRepository: IRepositoryPortSkill;
      if (self.overrides.skillRepository) {
        skillRepository = self.overrides.skillRepository as IRepositoryPortSkill
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderSkill::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        skillRepository = yield* _(
          Effect.mapError(
            RepositoryFactorySkill.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactorySkill.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderSkill::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: SkillServiceOptions = {
        skillRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new SkillService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as ISkillServicePort
    })
  }
}
