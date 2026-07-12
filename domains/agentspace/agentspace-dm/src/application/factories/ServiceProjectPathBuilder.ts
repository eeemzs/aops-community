/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IProjectPathServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortProjectPath } from '../ports/repository-ports/index.js'
import { ProjectPathService, type ProjectPathServiceOptions } from '../services/index.js'
import { ProjectPathServiceError } from '../errors/ProjectPathServiceError.js'
import { RepositoryFactoryProjectPath } from './RepositoryFactoryProjectPath.js'

export interface ProjectPathServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface ProjectPathServiceFactoryOverrides {
  projectPathRepository?: IRepositoryPortProjectPath
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderProjectPath {
  private config?: ProjectPathServiceFactoryConfig
  private overrides: ProjectPathServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderProjectPath {
    return new ServiceBuilderProjectPath()
  }

  withConfig(config: ProjectPathServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortProjectPath): this {
    this.overrides.projectPathRepository = repository
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

  withOverrides(overrides: ProjectPathServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IProjectPathServicePort, ProjectPathServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.projectPathRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderProjectPath::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderProjectPath', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let projectPathRepository: IRepositoryPortProjectPath;
      if (self.overrides.projectPathRepository) {
        projectPathRepository = self.overrides.projectPathRepository as IRepositoryPortProjectPath
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderProjectPath::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        projectPathRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryProjectPath.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryProjectPath.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderProjectPath::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: ProjectPathServiceOptions = {
        projectPathRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new ProjectPathService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IProjectPathServicePort
    })
  }
}
