/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IReviewRequestServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortReviewRequest } from '../ports/repository-ports/index.js'
import { ReviewRequestService, type ReviewRequestServiceOptions } from '../services/index.js'
import { ReviewRequestServiceError } from '../errors/ReviewRequestServiceError.js'
import { RepositoryFactoryReviewRequest } from './RepositoryFactoryReviewRequest.js'

export interface ReviewRequestServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface ReviewRequestServiceFactoryOverrides {
  reviewRequestRepository?: IRepositoryPortReviewRequest
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderReviewRequest {
  private config?: ReviewRequestServiceFactoryConfig
  private overrides: ReviewRequestServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderReviewRequest {
    return new ServiceBuilderReviewRequest()
  }

  withConfig(config: ReviewRequestServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortReviewRequest): this {
    this.overrides.reviewRequestRepository = repository
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

  withOverrides(overrides: ReviewRequestServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IReviewRequestServicePort, ReviewRequestServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.reviewRequestRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderReviewRequest::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderReviewRequest', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let reviewRequestRepository: IRepositoryPortReviewRequest;
      if (self.overrides.reviewRequestRepository) {
        reviewRequestRepository = self.overrides.reviewRequestRepository as IRepositoryPortReviewRequest
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderReviewRequest::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        reviewRequestRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryReviewRequest.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryReviewRequest.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderReviewRequest::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: ReviewRequestServiceOptions = {
        reviewRequestRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new ReviewRequestService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IReviewRequestServicePort
    })
  }
}
