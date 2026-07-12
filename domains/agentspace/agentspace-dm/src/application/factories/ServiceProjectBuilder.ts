/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IProjectServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortProject, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import { ProjectService, type ProjectServiceOptions } from '../services/index.js'
import { ProjectServiceError } from '../errors/ProjectServiceError.js'
import { RepositoryFactoryProject } from './RepositoryFactoryProject.js'
import { RepositoryFactoryScope } from './RepositoryFactoryScope.js'

export interface ProjectServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface ProjectServiceFactoryOverrides {
  projectRepository?: IRepositoryPortProject
  scopeRepository?: IRepositoryPortScope
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderProject {
  private config?: ProjectServiceFactoryConfig
  private overrides: ProjectServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderProject {
    return new ServiceBuilderProject()
  }

  withConfig(config: ProjectServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortProject): this {
    this.overrides.projectRepository = repository
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

  withOverrides(overrides: ProjectServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IProjectServicePort, ProjectServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.projectRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderProject::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderProject', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let projectRepository: IRepositoryPortProject
      let scopeRepository: IRepositoryPortScope | undefined = self.overrides.scopeRepository
      if (self.overrides.projectRepository) {
        projectRepository = self.overrides.projectRepository as IRepositoryPortProject
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderProject::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        projectRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryProject.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryProject.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderProject::build',
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
                stage: 'ServiceBuilderProject::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: ProjectServiceOptions = {
        projectRepository,
        scopeRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new ProjectService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IProjectServicePort
    })
  }
}
