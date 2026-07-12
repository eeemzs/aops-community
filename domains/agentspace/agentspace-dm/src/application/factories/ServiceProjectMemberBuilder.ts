/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IProjectMemberServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortProjectMember } from '../ports/repository-ports/index.js'
import { ProjectMemberService, type ProjectMemberServiceOptions } from '../services/index.js'
import { ProjectMemberServiceError } from '../errors/ProjectMemberServiceError.js'
import { RepositoryFactoryProjectMember } from './RepositoryFactoryProjectMember.js'

export interface ProjectMemberServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface ProjectMemberServiceFactoryOverrides {
  projectMemberRepository?: IRepositoryPortProjectMember
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderProjectMember {
  private config?: ProjectMemberServiceFactoryConfig
  private overrides: ProjectMemberServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderProjectMember {
    return new ServiceBuilderProjectMember()
  }

  withConfig(config: ProjectMemberServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortProjectMember): this {
    this.overrides.projectMemberRepository = repository
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

  withOverrides(overrides: ProjectMemberServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IProjectMemberServicePort, ProjectMemberServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.projectMemberRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderProjectMember::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderProjectMember', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let projectMemberRepository: IRepositoryPortProjectMember;
      if (self.overrides.projectMemberRepository) {
        projectMemberRepository = self.overrides.projectMemberRepository as IRepositoryPortProjectMember
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderProjectMember::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        projectMemberRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryProjectMember.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryProjectMember.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderProjectMember::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: ProjectMemberServiceOptions = {
        projectMemberRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new ProjectMemberService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IProjectMemberServicePort
    })
  }
}
