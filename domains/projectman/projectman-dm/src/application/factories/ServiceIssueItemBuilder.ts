/* eslint-disable @typescript-eslint/no-this-alias */
import { Effect } from 'effect'
import { XfConfigurationError } from '@aopslab/xf-core'
import { LocaleOptions, RepositoryCreateParams } from '@aopslab/xf-dm'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { RepositoryConfig } from '@aopslab/xf-db'
import type { IIssueItemServicePort } from '../ports/inbound/index.js'
import type { IRepositoryPortIssueItem } from '../ports/repository-ports/index.js'
import { IssueItemService, type IssueItemServiceOptions } from '../services/index.js'
import { IssueItemServiceError } from '../errors/IssueItemServiceError.js'
import { RepositoryFactoryIssueItem } from './RepositoryFactoryIssueItem.js'

export interface IssueItemServiceFactoryConfig {
  repositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
  //==> custom-factory-config
  // Add domain-specific config fields here (e.g., ttlSec, feature flags).
  //<==//
}

export interface IssueItemServiceFactoryOverrides {
  issueItemRepository?: IRepositoryPortIssueItem
  //==> custom-factory-overrides
  // Add domain-specific overrides here (e.g., dependent services).
  //<==//
}

export class ServiceBuilderIssueItem {
  private config?: IssueItemServiceFactoryConfig
  private overrides: IssueItemServiceFactoryOverrides = {}
  private logLevel?: string

  static create(): ServiceBuilderIssueItem {
    return new ServiceBuilderIssueItem()
  }

  withConfig(config: IssueItemServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortIssueItem): this {
    this.overrides.issueItemRepository = repository
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

  withOverrides(overrides: IssueItemServiceFactoryOverrides): this {
    this.overrides = { ...this.overrides, ...overrides }
    return this
  }

  build(): Effect.Effect<IIssueItemServicePort, IssueItemServiceError> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.issueItemRepository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'repository override veya repositoryConfig sağlamanız gerekiyor',
              operation: 'build',
              stage: 'ServiceBuilderIssueItem::build',
            })
          )
        )
      }

      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'

      const logger = config.logger?.child(
        { module: 'ServiceBuilderIssueItem', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      let issueItemRepository: IRepositoryPortIssueItem;
      if (self.overrides.issueItemRepository) {
        issueItemRepository = self.overrides.issueItemRepository as IRepositoryPortIssueItem
      } else {
        if (!config.repositoryConfig) {
          return yield* _(
            Effect.fail(
              new XfConfigurationError({
                message: 'Repository konfigürasyonu gerekli. withConfig() sonrası repositoryConfig ayarlayın.',
                stage: 'ServiceBuilderIssueItem::build',
              })
            )
          )
        }

        const repositoryParams: RepositoryCreateParams = {
          repositoryConfig: config.repositoryConfig,
          redisConfig: config.redisConfig,
          logger,
        };

        issueItemRepository = yield* _(
          Effect.mapError(
            RepositoryFactoryIssueItem.create(repositoryParams),
            (error) =>
              new XfConfigurationError({
                message: `RepositoryFactoryIssueItem.create başarısız: ${(error as any)?.message ?? 'unknown'}`,
                stage: 'ServiceBuilderIssueItem::build',
                cause: error,
              }),
          ),
        )
      }

      const serviceOptions: IssueItemServiceOptions = {
        issueItemRepository,
        logger,
        //==> custom-service-options
        // Map factory config / overrides to service options here.
        //<==//
      };

      const service = new IssueItemService(serviceOptions)
      yield* _(Effect.sync(() => logger?.debug(`Service created: ${service.constructor.name}`)))
      return service as IIssueItemServicePort
    })
  }
}
