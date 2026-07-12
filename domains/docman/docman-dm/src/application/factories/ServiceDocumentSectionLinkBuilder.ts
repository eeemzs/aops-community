/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IDocumentSectionLinkServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortDocumentSectionLink } from '../ports/repository-ports/index.js'
import { DocumentSectionLinkService, type DocumentSectionLinkServiceOptions } from '../services/index.js'
import { DocumentSectionLinkServiceError } from '../errors/DocumentSectionLinkServiceError.js'
import { RepositoryFactoryDocumentSectionLink } from './RepositoryFactoryDocumentSectionLink.js'

export interface DocumentSectionLinkServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface DocumentSectionLinkServiceFactoryOverrides {
  documentSectionLinkRepository?: IRepositoryPortDocumentSectionLink
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderDocumentSectionLink {
  private config?: DocumentSectionLinkServiceFactoryConfig
  private overrides: DocumentSectionLinkServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderDocumentSectionLink {
    return new ServiceBuilderDocumentSectionLink()
  }

  withConfig(config: DocumentSectionLinkServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortDocumentSectionLink): this {
    this.overrides.documentSectionLinkRepository = repository
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

  withOverrides(overrides: DocumentSectionLinkServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IDocumentSectionLinkServicePort, DocumentSectionLinkServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.documentSectionLinkRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderDocumentSectionLink::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderDocumentSectionLink', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let documentSectionLinkRepository: IRepositoryPortDocumentSectionLink;
      if (self.overrides.documentSectionLinkRepository) {
        documentSectionLinkRepository = self.overrides.documentSectionLinkRepository as IRepositoryPortDocumentSectionLink
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderDocumentSectionLink::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        documentSectionLinkRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryDocumentSectionLink.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryDocumentSectionLink.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderDocumentSectionLink::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: DocumentSectionLinkServiceOptions = {
        documentSectionLinkRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new DocumentSectionLinkService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IDocumentSectionLinkServicePort
    })
  }
}

