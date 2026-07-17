/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IDocumentServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortDocument } from '../ports/repository-ports/index.js'
import { DocumentService, type DocumentServiceOptions } from '../services/index.js'
import { DocumentServiceError } from '../errors/DocumentServiceError.js'
import { RepositoryFactoryDocument } from './RepositoryFactoryDocument.js'

export interface DocumentServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface DocumentServiceFactoryOverrides {
  documentRepository?: IRepositoryPortDocument
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderDocument {
  private config?: DocumentServiceFactoryConfig
  private overrides: DocumentServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderDocument {
    return new ServiceBuilderDocument()
  }

  withConfig(config: DocumentServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortDocument): this {
    this.overrides.documentRepository = repository
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

  withOverrides(overrides: DocumentServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IDocumentServicePort, DocumentServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.documentRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderDocument::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderDocument', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let documentRepository: IRepositoryPortDocument;
      if (self.overrides.documentRepository) {
        documentRepository = self.overrides.documentRepository as IRepositoryPortDocument
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderDocument::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        documentRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryDocument.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryDocument.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderDocument::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: DocumentServiceOptions = {
        documentRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new DocumentService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IDocumentServicePort
    })
  }
}
