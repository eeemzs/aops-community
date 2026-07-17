/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IDocumentVersionServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortDocumentVersion } from '../ports/repository-ports/index.js'
import { DocumentVersionService, type DocumentVersionServiceOptions } from '../services/index.js'
import { DocumentVersionServiceError } from '../errors/DocumentVersionServiceError.js'
import { RepositoryFactoryDocumentVersion } from './RepositoryFactoryDocumentVersion.js'

export interface DocumentVersionServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface DocumentVersionServiceFactoryOverrides {
  documentVersionRepository?: IRepositoryPortDocumentVersion
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderDocumentVersion {
  private config?: DocumentVersionServiceFactoryConfig
  private overrides: DocumentVersionServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderDocumentVersion {
    return new ServiceBuilderDocumentVersion()
  }

  withConfig(config: DocumentVersionServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortDocumentVersion): this {
    this.overrides.documentVersionRepository = repository
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

  withOverrides(overrides: DocumentVersionServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IDocumentVersionServicePort, DocumentVersionServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.documentVersionRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderDocumentVersion::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderDocumentVersion', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let documentVersionRepository: IRepositoryPortDocumentVersion;
      if (self.overrides.documentVersionRepository) {
        documentVersionRepository = self.overrides.documentVersionRepository as IRepositoryPortDocumentVersion
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderDocumentVersion::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        documentVersionRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryDocumentVersion.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryDocumentVersion.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderDocumentVersion::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: DocumentVersionServiceOptions = {
        documentVersionRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new DocumentVersionService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IDocumentVersionServicePort
    })
  }
}
