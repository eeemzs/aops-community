/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IDocumentGroupServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortDocumentGroup } from '../ports/repository-ports/index.js'
import { DocumentGroupService, type DocumentGroupServiceOptions } from '../services/index.js'
import { DocumentGroupServiceError } from '../errors/DocumentGroupServiceError.js'
import { RepositoryFactoryDocumentGroup } from './RepositoryFactoryDocumentGroup.js'

export interface DocumentGroupServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface DocumentGroupServiceFactoryOverrides {
  documentGroupRepository?: IRepositoryPortDocumentGroup
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderDocumentGroup {
  private config?: DocumentGroupServiceFactoryConfig
  private overrides: DocumentGroupServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderDocumentGroup {
    return new ServiceBuilderDocumentGroup()
  }

  withConfig(config: DocumentGroupServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortDocumentGroup): this {
    this.overrides.documentGroupRepository = repository
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

  withOverrides(overrides: DocumentGroupServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IDocumentGroupServicePort, DocumentGroupServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.documentGroupRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderDocumentGroup::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderDocumentGroup', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let documentGroupRepository: IRepositoryPortDocumentGroup;
      if (self.overrides.documentGroupRepository) {
        documentGroupRepository = self.overrides.documentGroupRepository as IRepositoryPortDocumentGroup
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderDocumentGroup::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        documentGroupRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryDocumentGroup.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryDocumentGroup.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderDocumentGroup::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: DocumentGroupServiceOptions = {
        documentGroupRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new DocumentGroupService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IDocumentGroupServicePort
    })
  }
}
